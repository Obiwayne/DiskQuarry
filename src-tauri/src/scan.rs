//! Parallel drive scanner.
//!
//! One pass over the drive sorts every file into exactly one category, so the
//! categories add up to the space in use. A directory takes the category of the
//! first rule it matches; everything under it inherits that category unless an
//! exact path rule says otherwise (for example `C:\Windows\Temp` is a cache even
//! though `C:\Windows` is system data). Files outside every rule are "Large files"
//! when they are at least `LARGE_FILE` bytes, and "Other" otherwise.

use rayon::prelude::*;
use serde::Serialize;
use std::collections::{HashMap, HashSet};
use std::fs;
use std::path::Path;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::Mutex;
use std::time::UNIX_EPOCH;

pub const LARGE_FILE: u64 = 100 * 1024 * 1024;
const DOWNLOAD_MIN: u64 = 1024 * 1024;
const MAX_FILES: usize = 400;
const MAX_CHILDREN: usize = 14;

#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum Cat {
    Apps = 0,
    Downloads = 1,
    Large = 2,
    Caches = 3,
    System = 4,
    Other = 5,
}

pub const CATS: [Cat; 6] = [Cat::Apps, Cat::Downloads, Cat::Large, Cat::Caches, Cat::System, Cat::Other];

/// `None` means no rule matched yet: files are sorted by size into Large or Other.
type Zone = Option<Cat>;

#[derive(Default, Clone, Copy)]
pub struct Totals {
    pub bytes: [u64; 6],
    pub files: [u64; 6],
}

impl Totals {
    fn add(&mut self, cat: Cat, size: u64) {
        self.bytes[cat as usize] += size;
        self.files[cat as usize] += 1;
    }
    fn merge(&mut self, other: &Totals) {
        for i in 0..6 {
            self.bytes[i] += other.bytes[i];
            self.files[i] += other.files[i];
        }
    }
    pub fn sum(&self) -> u64 {
        self.bytes.iter().sum()
    }
}

#[derive(Serialize, Clone)]
pub struct FileItem {
    pub path: String,
    pub name: String,
    pub bytes: u64,
    pub modified: u64,
}

#[derive(Serialize, Clone)]
pub struct Child {
    pub name: String,
    pub bytes: u64,
    pub is_dir: bool,
}

#[derive(Serialize, Clone)]
pub struct Folder {
    pub path: String,
    pub name: String,
    pub cat: Cat,
    pub bytes: u64,
    pub files: u64,
    pub children: Vec<Child>,
}

pub struct Rules {
    root: String,
    exact: HashMap<String, Cat>,
    app_locations: HashSet<String>,
}

const CACHE_NAMES: &[&str] = &[
    "cache", "caches", "code cache", "gpucache", "cache2", "cachestorage", "inetcache", "d3dscache",
    "crashdumps", "shadercache", "dxcache", "glcache", "npm-cache", ".cache", "cache_data",
    "grshadercache", "graphitedawncache", "dawncache", "dawngraphitecache", "dawnwebgpucache",
    "nv_cache", "v3-cache", "go-build", "squirreltemp",
];
const APP_DIR_NAMES: &[&str] = &["steamlibrary", "steamapps", "epic games", "xboxgames"];
const ROOT_SYSTEM_FILES: &[&str] = &["pagefile.sys", "hiberfil.sys", "swapfile.sys", "dumpstack.log.tmp", "dumpstack.log"];

pub fn lower(p: &str) -> String {
    p.trim_end_matches('\\').to_lowercase()
}

impl Rules {
    /// `root` is the drive root such as `C:\`. `install_dirs` are app install
    /// locations read from the registry; `downloads` is the signed-in user's
    /// Downloads folder.
    pub fn new(root: &str, install_dirs: &[String], downloads: Option<String>) -> Rules {
        let root_l = lower(root);
        let mut exact = HashMap::new();
        let at = |rel: &str| format!("{}\\{}", root_l, rel);
        for rel in [
            "windows", "programdata", "system volume information", "recovery", "$windows.~bt",
            "$windows.~ws", "$winreagent", "$sysreset", "windows.old", "boot", "config.msi",
        ] {
            exact.insert(at(rel), Cat::System);
        }
        for rel in [
            "$recycle.bin", "windows\\temp", "windows\\softwaredistribution\\download",
            "programdata\\microsoft\\windows\\wer", "windows\\livekernelreports", "windows\\minidump",
            "windows\\prefetch",
        ] {
            exact.insert(at(rel), Cat::Caches);
        }
        for rel in ["program files", "program files (x86)"] {
            exact.insert(at(rel), Cat::Apps);
        }
        if let Some(d) = downloads {
            let d = lower(&d);
            if d.starts_with(&root_l) {
                exact.insert(d, Cat::Downloads);
            }
        }
        let mut app_locations = HashSet::new();
        let windows = at("windows");
        for dir in install_dirs {
            let d = lower(dir.trim_matches('"'));
            // Skip the drive root, shared parents and anything inside Windows.
            if !d.starts_with(&root_l) || d.len() <= root_l.len() + 1 || d.starts_with(&windows) {
                continue;
            }
            if exact.contains_key(&d) {
                continue;
            }
            app_locations.insert(d.clone());
            exact.entry(d).or_insert(Cat::Apps);
        }
        Rules { root: root_l, exact, app_locations }
    }

    fn zone_for(&self, path_l: &str, name_l: &str, parent: Zone, parent_l: &str) -> Zone {
        if let Some(&c) = self.exact.get(path_l) {
            return Some(c);
        }
        if parent.is_some() {
            return parent;
        }
        if APP_DIR_NAMES.contains(&name_l) {
            return Some(Cat::Apps);
        }
        if CACHE_NAMES.contains(&name_l) {
            return Some(Cat::Caches);
        }
        if (name_l == "temp" || name_l == "tmp") && parent_l.ends_with("\\appdata\\local") {
            return Some(Cat::Caches);
        }
        // Downloads of any user profile on this drive: <root>\users\<name>\downloads.
        if name_l == "downloads" {
            if let Some(profile_parent) = parent_l.rsplit_once('\\').map(|(p, _)| p) {
                if profile_parent == format!("{}\\users", self.root) {
                    return Some(Cat::Downloads);
                }
            }
        }
        None
    }
}

#[derive(Serialize, Clone, Default)]
pub struct Progress {
    pub files: u64,
    pub bytes: u64,
    pub current: String,
}

#[derive(Default)]
struct Collected {
    large: Vec<FileItem>,
    downloads: Vec<FileItem>,
    zone_roots: Vec<Folder>,
    other_folders: Vec<Folder>,
    app_sizes: HashMap<String, u64>,
    root_system_files: Vec<FileItem>,
}

pub struct Scanner<'a> {
    rules: &'a Rules,
    cancel: &'a AtomicBool,
    files: AtomicU64,
    bytes: AtomicU64,
    denied: AtomicU64,
    current: Mutex<String>,
    collected: Mutex<Collected>,
}

pub struct Outcome {
    pub totals: Totals,
    pub large: Vec<FileItem>,
    pub downloads: Vec<FileItem>,
    pub zone_roots: Vec<Folder>,
    pub other_folders: Vec<Folder>,
    pub app_sizes: HashMap<String, u64>,
    pub root_system_files: Vec<FileItem>,
    pub denied_dirs: u64,
    pub cancelled: bool,
}

fn modified_secs(md: &fs::Metadata) -> u64 {
    md.modified()
        .ok()
        .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
        .map(|d| d.as_secs())
        .unwrap_or(0)
}

/// Size the file takes on this disk. Cloud placeholders (OneDrive "online-only"
/// files) report their full logical size but use no local space.
#[cfg(windows)]
fn local_size(md: &fs::Metadata) -> u64 {
    use std::os::windows::fs::MetadataExt;
    const OFFLINE: u32 = 0x1000;
    const RECALL_ON_OPEN: u32 = 0x40000;
    const RECALL_ON_DATA_ACCESS: u32 = 0x400000;
    if md.file_attributes() & (OFFLINE | RECALL_ON_OPEN | RECALL_ON_DATA_ACCESS) != 0 {
        0
    } else {
        md.len()
    }
}

#[cfg(not(windows))]
fn local_size(md: &fs::Metadata) -> u64 {
    md.len()
}

fn join(dir_l: &str, name: &str) -> String {
    if dir_l.ends_with('\\') {
        format!("{}{}", dir_l, name)
    } else {
        format!("{}\\{}", dir_l, name)
    }
}

impl<'a> Scanner<'a> {
    pub fn new(rules: &'a Rules, cancel: &'a AtomicBool) -> Self {
        Scanner {
            rules,
            cancel,
            files: AtomicU64::new(0),
            bytes: AtomicU64::new(0),
            denied: AtomicU64::new(0),
            current: Mutex::new(String::new()),
            collected: Mutex::new(Collected::default()),
        }
    }

    pub fn progress(&self) -> Progress {
        Progress {
            files: self.files.load(Ordering::Relaxed),
            bytes: self.bytes.load(Ordering::Relaxed),
            current: self.current.lock().map(|c| c.clone()).unwrap_or_default(),
        }
    }

    pub fn run(&self, root: &str) -> Outcome {
        let root_l = self.rules.root.clone();
        let totals = self.walk(Path::new(root), &root_l, None, 0, false);
        let mut c = self.collected.lock().map(|mut c| std::mem::take(&mut *c)).unwrap_or_default();
        c.large.sort_by(|a, b| b.bytes.cmp(&a.bytes));
        c.large.truncate(MAX_FILES);
        c.downloads.sort_by(|a, b| b.bytes.cmp(&a.bytes));
        c.downloads.truncate(MAX_FILES);
        c.zone_roots.sort_by(|a, b| b.bytes.cmp(&a.bytes));
        c.other_folders.sort_by(|a, b| b.bytes.cmp(&a.bytes));
        c.root_system_files.sort_by(|a, b| b.bytes.cmp(&a.bytes));
        Outcome {
            totals,
            large: c.large,
            downloads: c.downloads,
            zone_roots: c.zone_roots,
            other_folders: c.other_folders,
            app_sizes: c.app_sizes,
            root_system_files: c.root_system_files,
            denied_dirs: self.denied.load(Ordering::Relaxed),
            cancelled: self.cancel.load(Ordering::Relaxed),
        }
    }

    fn walk(&self, dir: &Path, dir_l: &str, zone: Zone, depth: u32, is_zone_root: bool) -> Totals {
        let mut t = Totals::default();
        if self.cancel.load(Ordering::Relaxed) {
            return t;
        }
        let rd = match fs::read_dir(dir) {
            Ok(rd) => rd,
            Err(_) => {
                self.denied.fetch_add(1, Ordering::Relaxed);
                return t;
            }
        };
        if depth <= 5 {
            if let Ok(mut cur) = self.current.try_lock() {
                *cur = dir.to_string_lossy().into_owned();
            }
        }
        let at_root = depth == 0;
        let mut subdirs: Vec<String> = Vec::new();
        let mut children: Vec<Child> = Vec::new();
        let mut found_large: Vec<FileItem> = Vec::new();
        let mut found_downloads: Vec<FileItem> = Vec::new();
        let mut found_root_sys: Vec<FileItem> = Vec::new();

        for entry in rd.flatten() {
            let ft = match entry.file_type() {
                Ok(ft) => ft,
                Err(_) => continue,
            };
            // Junctions and symlinks point at space counted elsewhere.
            if ft.is_symlink() {
                continue;
            }
            let name = entry.file_name().to_string_lossy().into_owned();
            if ft.is_dir() {
                subdirs.push(name);
                continue;
            }
            let md = match entry.metadata() {
                Ok(md) => md,
                Err(_) => continue,
            };
            let size = local_size(&md);
            let is_root_sys = at_root && ROOT_SYSTEM_FILES.contains(&name.to_lowercase().as_str());
            let cat = match zone {
                Some(c) => c,
                None if is_root_sys => Cat::System,
                None if size >= LARGE_FILE => Cat::Large,
                None => Cat::Other,
            };
            t.add(cat, size);
            self.files.fetch_add(1, Ordering::Relaxed);
            self.bytes.fetch_add(size, Ordering::Relaxed);
            let wants_item = cat == Cat::Large
                || (cat == Cat::Downloads && size >= DOWNLOAD_MIN)
                || is_root_sys;
            if wants_item {
                let item = FileItem {
                    path: entry.path().to_string_lossy().into_owned(),
                    name: name.clone(),
                    bytes: size,
                    modified: modified_secs(&md),
                };
                match cat {
                    Cat::Large => found_large.push(item),
                    Cat::Downloads => found_downloads.push(item),
                    _ => found_root_sys.push(item),
                }
            }
            if is_zone_root {
                children.push(Child { name, bytes: size, is_dir: false });
            }
        }

        let results: Vec<(String, Totals)> = subdirs
            .par_iter()
            .map(|name| {
                let name_l = name.to_lowercase();
                let child_l = join(dir_l, &name_l);
                let child_zone = self.rules.zone_for(&child_l, &name_l, zone, dir_l);
                let child_root = child_zone.is_some() && child_zone != zone;
                let ct = self.walk(&dir.join(name), &child_l, child_zone, depth + 1, child_root);
                (name.clone(), ct)
            })
            .collect();

        for (name, ct) in &results {
            t.merge(ct);
            if is_zone_root {
                children.push(Child { name: name.clone(), bytes: ct.sum(), is_dir: true });
            }
        }

        let in_users = dir_l.starts_with(&join(&self.rules.root, "users\\"));
        let record_other = zone.is_none()
            && t.bytes[Cat::Other as usize] > 0
            && ((depth == 1 && !dir_l.ends_with("\\users")) || (depth == 3 && in_users));

        if !(is_zone_root || record_other || zone == Some(Cat::Apps))
            && found_large.is_empty()
            && found_downloads.is_empty()
            && found_root_sys.is_empty()
        {
            return t;
        }

        let mut c = match self.collected.lock() {
            Ok(c) => c,
            Err(_) => return t,
        };
        c.large.append(&mut found_large);
        c.downloads.append(&mut found_downloads);
        c.root_system_files.append(&mut found_root_sys);
        if zone == Some(Cat::Apps) && self.rules.app_locations.contains(dir_l) {
            c.app_sizes.insert(dir_l.to_string(), t.sum());
        }
        let display = dir.to_string_lossy().into_owned();
        let leaf = dir.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_else(|| display.clone());
        if let (true, Some(cat)) = (is_zone_root, zone) {
            children.sort_by(|a, b| b.bytes.cmp(&a.bytes));
            children.truncate(MAX_CHILDREN);
            c.zone_roots.push(Folder {
                path: display.clone(),
                name: leaf.clone(),
                cat,
                bytes: t.bytes[cat as usize],
                files: t.files[cat as usize],
                children,
            });
        }
        if record_other {
            c.other_folders.push(Folder {
                path: display,
                name: leaf,
                cat: Cat::Other,
                bytes: t.bytes[Cat::Other as usize],
                files: t.files[Cat::Other as usize],
                children: Vec::new(),
            });
        }
        t
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn rules() -> Rules {
        Rules::new(
            "C:\\",
            &["C:\\Users\\sam\\AppData\\Local\\slack".into(), "C:\\".into()],
            Some("C:\\Users\\sam\\Downloads".into()),
        )
    }

    fn zone_path(r: &Rules, path: &str) -> Zone {
        // Walk the path one component at a time, the way the scanner does.
        let mut zone = None;
        let mut cur = "c:".to_string();
        for part in path.to_lowercase().split('\\').skip(1) {
            let next = join(&cur, part);
            zone = r.zone_for(&next, part, zone, &cur);
            cur = next;
        }
        zone
    }

    #[test]
    fn system_folders_are_system_data() {
        let r = rules();
        assert_eq!(zone_path(&r, "C:\\Windows\\System32"), Some(Cat::System));
        assert_eq!(zone_path(&r, "C:\\ProgramData\\Microsoft"), Some(Cat::System));
    }

    #[test]
    fn windows_temp_is_a_cache_inside_system() {
        let r = rules();
        assert_eq!(zone_path(&r, "C:\\Windows\\Temp\\x"), Some(Cat::Caches));
        assert_eq!(zone_path(&r, "C:\\Windows\\SoftwareDistribution\\Download"), Some(Cat::Caches));
    }

    #[test]
    fn user_caches_and_temp() {
        let r = rules();
        assert_eq!(
            zone_path(&r, "C:\\Users\\sam\\AppData\\Local\\Google\\Chrome\\User Data\\Default\\Cache"),
            Some(Cat::Caches)
        );
        assert_eq!(zone_path(&r, "C:\\Users\\sam\\AppData\\Local\\Temp"), Some(Cat::Caches));
        assert_eq!(zone_path(&r, "C:\\Users\\sam\\Documents\\Temp"), None);
    }

    #[test]
    fn registry_install_locations_are_apps() {
        let r = rules();
        assert_eq!(zone_path(&r, "C:\\Users\\sam\\AppData\\Local\\slack\\app-4.41"), Some(Cat::Apps));
        assert_eq!(zone_path(&r, "C:\\Program Files\\Git"), Some(Cat::Apps));
        // The drive root itself is never treated as an install location.
        assert_eq!(zone_path(&r, "C:\\Users"), None);
    }

    #[test]
    fn downloads_for_any_profile() {
        let r = rules();
        assert_eq!(zone_path(&r, "C:\\Users\\sam\\Downloads\\iso"), Some(Cat::Downloads));
        assert_eq!(zone_path(&r, "C:\\Users\\alex\\Downloads"), Some(Cat::Downloads));
        assert_eq!(zone_path(&r, "C:\\Users\\alex\\Projects\\Downloads"), None);
    }

    /// Full scan of the system drive: `cargo test --release -- --ignored --nocapture`
    #[test]
    #[ignore]
    fn scan_system_drive() {
        let downloads = dirs::download_dir().map(|p| p.to_string_lossy().into_owned());
        let r = Rules::new("C:\\", &[], downloads);
        let cancel = AtomicBool::new(false);
        let started = std::time::Instant::now();
        let out = Scanner::new(&r, &cancel).run("C:\\");
        let gb = |b: u64| b as f64 / (1u64 << 30) as f64;
        for c in CATS {
            println!("{:?}: {:.1} GB, {} files", c, gb(out.totals.bytes[c as usize]), out.totals.files[c as usize]);
        }
        println!("total {:.1} GB in {:.1}s, {} denied dirs, {} cache roots", gb(out.totals.sum()), started.elapsed().as_secs_f64(), out.denied_dirs, out.zone_roots.iter().filter(|f| f.cat == Cat::Caches).count());
        for f in out.zone_roots.iter().filter(|f| f.cat == Cat::Caches).take(12) {
            println!("  cache {:.1} GB {}", gb(f.bytes), f.path);
        }
        assert!(out.totals.sum() > 0);
    }

    #[test]
    fn scans_a_real_tree() {
        let tmp = std::env::temp_dir().join(format!("dq-test-{}", std::process::id()));
        let _ = fs::remove_dir_all(&tmp);
        fs::create_dir_all(tmp.join("Downloads")).unwrap();
        fs::create_dir_all(tmp.join("stuff\\cache")).unwrap();
        fs::write(tmp.join("Downloads\\a.bin"), vec![0u8; 2 * 1024 * 1024]).unwrap();
        fs::write(tmp.join("stuff\\cache\\c.bin"), vec![0u8; 4096]).unwrap();
        fs::write(tmp.join("stuff\\note.txt"), b"hello").unwrap();
        let root = tmp.to_string_lossy().into_owned();
        let r = Rules::new(&root, &[], Some(tmp.join("Downloads").to_string_lossy().into_owned()));
        let cancel = AtomicBool::new(false);
        let out = Scanner::new(&r, &cancel).run(&root);
        assert_eq!(out.totals.bytes[Cat::Downloads as usize], 2 * 1024 * 1024);
        assert_eq!(out.totals.bytes[Cat::Caches as usize], 4096);
        assert_eq!(out.totals.bytes[Cat::Other as usize], 5);
        assert_eq!(out.downloads.len(), 1);
        assert!(out.zone_roots.iter().any(|f| f.cat == Cat::Caches && f.name == "cache"));
        let _ = fs::remove_dir_all(&tmp);
    }
}
