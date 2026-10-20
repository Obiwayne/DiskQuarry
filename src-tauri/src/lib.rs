mod apps;
mod scan;

use scan::{Cat, FileItem, Folder, Rules, Scanner, CATS};
use serde::Serialize;
use std::path::Path;
use std::process::Command;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter, State};

#[derive(Default)]
struct ScanState {
    cancel: Arc<AtomicBool>,
    running: Arc<AtomicBool>,
}

#[derive(Serialize)]
struct Drive {
    mount: String,
    label: String,
    total: u64,
    free: u64,
    removable: bool,
}

#[derive(Serialize, Clone)]
struct CatSummary {
    cat: Cat,
    bytes: u64,
    files: u64,
}

#[derive(Serialize, Clone)]
struct ScanResult {
    mount: String,
    total: u64,
    free: u64,
    used: u64,
    categories: Vec<CatSummary>,
    large_files: Vec<FileItem>,
    downloads: Vec<FileItem>,
    downloads_path: String,
    caches: Vec<Folder>,
    system: Vec<Folder>,
    system_files: Vec<FileItem>,
    app_folders: Vec<Folder>,
    other_folders: Vec<Folder>,
    apps: Vec<apps::App>,
    /// In use on the drive but not readable without admin rights (restore
    /// points, other users' folders). Counted as Other.
    unaccounted: u64,
    /// Bytes counted twice through hard links (mostly Windows\WinSxS), removed from System data.
    hardlink_overlap: u64,
    denied_dirs: u64,
    scanned_files: u64,
    duration_ms: u64,
    cancelled: bool,
}

fn disk_space(mount: &str) -> (u64, u64) {
    let disks = sysinfo::Disks::new_with_refreshed_list();
    let want = scan::lower(mount);
    disks
        .list()
        .iter()
        .find(|d| scan::lower(&d.mount_point().to_string_lossy()) == want)
        .map(|d| (d.total_space(), d.available_space()))
        .unwrap_or((0, 0))
}

#[tauri::command]
fn list_drives() -> Vec<Drive> {
    let disks = sysinfo::Disks::new_with_refreshed_list();
    let mut out: Vec<Drive> = Vec::new();
    for d in disks.list() {
        let mount = d.mount_point().to_string_lossy().into_owned();
        if d.total_space() == 0 || out.iter().any(|x| x.mount == mount) {
            continue;
        }
        out.push(Drive {
            label: d.name().to_string_lossy().into_owned(),
            mount,
            total: d.total_space(),
            free: d.available_space(),
            removable: d.is_removable(),
        });
    }
    out.sort_by(|a, b| a.mount.cmp(&b.mount));
    out
}

fn scan_drive(app: &AppHandle, mount: &str, cancel: &AtomicBool) -> ScanResult {
    let started = Instant::now();
    let mut installed = apps::installed();
    let locations: Vec<String> = installed.iter().map(|a| a.location.clone()).filter(|l| !l.is_empty()).collect();
    let downloads = dirs::download_dir().map(|p| p.to_string_lossy().into_owned());
    let rules = Rules::new(mount, &locations, downloads.clone());
    let scanner = Scanner::new(&rules, cancel);

    let threads = std::thread::available_parallelism().map(|n| n.get()).unwrap_or(4).clamp(4, 16) * 2;
    let pool = rayon::ThreadPoolBuilder::new()
        .num_threads(threads)
        .stack_size(16 * 1024 * 1024)
        .build()
        .expect("thread pool");

    let done = AtomicBool::new(false);
    let out = std::thread::scope(|s| {
        s.spawn(|| {
            while !done.load(Ordering::Relaxed) {
                let _ = app.emit("scan-progress", scanner.progress());
                std::thread::sleep(Duration::from_millis(150));
            }
        });
        let out = pool.install(|| scanner.run(mount));
        done.store(true, Ordering::Relaxed);
        out
    });

    let (total, free) = disk_space(mount);
    let used = total.saturating_sub(free);
    let mut bytes = out.totals.bytes;
    let sum: u64 = bytes.iter().sum();
    let mut hardlink_overlap = 0;
    let mut unaccounted = 0;
    if !out.cancelled && used > 0 {
        if sum > used {
            hardlink_overlap = (sum - used).min(bytes[Cat::System as usize]);
            bytes[Cat::System as usize] -= hardlink_overlap;
        } else {
            unaccounted = used - sum;
            bytes[Cat::Other as usize] += unaccounted;
        }
    }

    for a in installed.iter_mut() {
        if let Some(&b) = out.app_sizes.get(&scan::lower(&a.location)) {
            a.bytes = b;
            a.measured = true;
        }
    }
    installed.sort_by(|a, b| b.bytes.cmp(&a.bytes));

    let by_cat = |cat: Cat| out.zone_roots.iter().filter(|f| f.cat == cat).cloned().collect::<Vec<_>>();
    ScanResult {
        mount: mount.to_string(),
        total,
        free,
        used,
        categories: CATS
            .iter()
            .map(|&c| CatSummary { cat: c, bytes: bytes[c as usize], files: out.totals.files[c as usize] })
            .collect(),
        large_files: out.large,
        downloads: out.downloads,
        downloads_path: downloads.unwrap_or_default(),
        caches: by_cat(Cat::Caches),
        system: by_cat(Cat::System),
        system_files: out.root_system_files,
        app_folders: by_cat(Cat::Apps),
        other_folders: out.other_folders,
        apps: installed,
        unaccounted,
        hardlink_overlap,
        denied_dirs: out.denied_dirs,
        scanned_files: out.totals.files.iter().sum(),
        duration_ms: started.elapsed().as_millis() as u64,
        cancelled: out.cancelled,
    }
}

#[tauri::command]
fn start_scan(app: AppHandle, state: State<ScanState>, mount: String) -> Result<(), String> {
    if state.running.swap(true, Ordering::SeqCst) {
        return Err("A scan is already running.".into());
    }
    state.cancel.store(false, Ordering::SeqCst);
    let cancel = state.cancel.clone();
    let running = state.running.clone();
    std::thread::spawn(move || {
        let result = scan_drive(&app, &mount, &cancel);
        running.store(false, Ordering::SeqCst);
        let _ = app.emit("scan-done", result);
    });
    Ok(())
}

#[tauri::command]
fn cancel_scan(state: State<ScanState>) {
    state.cancel.store(true, Ordering::SeqCst);
}

/// Paths the app will never move to the Recycle Bin: drive roots and anything
/// Windows or installed programs need.
fn protected(path: &str) -> bool {
    let p = scan::lower(path);
    if p.len() <= 3 {
        return true;
    }
    let windir = std::env::var("SystemRoot").unwrap_or_else(|_| "C:\\Windows".into());
    let mut roots = vec![windir];
    for var in ["ProgramFiles", "ProgramFiles(x86)", "ProgramData"] {
        if let Ok(v) = std::env::var(var) {
            roots.push(v);
        }
    }
    roots.iter().any(|r| {
        let r = scan::lower(r);
        p == r || p.starts_with(&format!("{}\\", r))
    })
}

#[tauri::command]
async fn recycle(paths: Vec<String>) -> Result<usize, String> {
    if let Some(p) = paths.iter().find(|p| protected(p)) {
        return Err(format!("{} is protected and was not touched.", p));
    }
    tauri::async_runtime::spawn_blocking(move || {
        let existing: Vec<&String> = paths.iter().filter(|p| Path::new(p).exists()).collect();
        trash::delete_all(&existing).map_err(|e| e.to_string())?;
        Ok(existing.len())
    })
    .await
    .map_err(|e| e.to_string())?
}

#[derive(Serialize)]
struct Cleared {
    moved: usize,
    skipped: usize,
}

/// Moves what is inside each cache folder to the Recycle Bin, leaving the folder
/// itself in place (apps and Windows expect folders such as Temp to exist).
/// Files that are in use are skipped.
#[tauri::command]
async fn recycle_contents(dirs: Vec<String>) -> Result<Cleared, String> {
    if let Some(d) = dirs.iter().find(|d| protected(d)) {
        return Err(format!("{} is protected and was not touched.", d));
    }
    tauri::async_runtime::spawn_blocking(move || {
        let mut out = Cleared { moved: 0, skipped: 0 };
        for d in dirs {
            let Ok(rd) = std::fs::read_dir(&d) else {
                out.skipped += 1;
                continue;
            };
            for e in rd.flatten() {
                match trash::delete(e.path()) {
                    Ok(()) => out.moved += 1,
                    Err(_) => out.skipped += 1,
                }
            }
        }
        out
    })
    .await
    .map_err(|e| e.to_string())
}

#[cfg(windows)]
fn explorer() -> Command {
    Command::new("explorer.exe")
}

#[tauri::command]
fn reveal(path: String) -> Result<(), String> {
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        explorer().raw_arg(format!("/select,\"{}\"", path)).spawn().map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
fn open_path(path: String) -> Result<(), String> {
    #[cfg(windows)]
    explorer().arg(path).spawn().map_err(|e| e.to_string())?;
    Ok(())
}

/// Opens a page of Windows Settings: Installed apps or Storage Sense.
#[tauri::command]
fn open_settings(page: String) -> Result<(), String> {
    if !["appsfeatures", "storagesense"].contains(&page.as_str()) {
        return Err("Unknown settings page.".into());
    }
    #[cfg(windows)]
    explorer().arg(format!("ms-settings:{}", page)).spawn().map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn open_url(url: String) -> Result<(), String> {
    const ALLOWED: [&str; 2] = ["https://repoquarry.dev/", "https://github.com/"];
    if !ALLOWED.iter().any(|a| url.starts_with(a)) {
        return Err("Only RepoQuarry and GitHub links can be opened.".into());
    }
    Command::new("rundll32")
        .args(["url.dll,FileProtocolHandler", &url])
        .spawn()
        .map_err(|e| e.to_string())?;
    Ok(())
}

/// Windows shows its own "Are you sure?" dialog before emptying.
#[tauri::command]
fn empty_recycle_bin() -> Result<(), String> {
    #[cfg(windows)]
    unsafe {
        use windows_sys::Win32::UI::Shell::SHEmptyRecycleBinW;
        let hr = SHEmptyRecycleBinW(std::ptr::null_mut(), std::ptr::null(), 0);
        // S_OK, or E_UNEXPECTED when the bin is already empty / user said no.
        if hr != 0 && hr != 0x8000FFFFu32 as i32 {
            return Err(format!("Windows returned 0x{:08X}", hr));
        }
    }
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(ScanState::default())
        .invoke_handler(tauri::generate_handler![
            list_drives,
            start_scan,
            cancel_scan,
            recycle,
            recycle_contents,
            reveal,
            open_path,
            open_settings,
            open_url,
            empty_recycle_bin
        ])
        .run(tauri::generate_context!())
        .expect("error while running DiskQuarry");
}
