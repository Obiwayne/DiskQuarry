# How DiskQuarry works

## Architecture

```
ui/ (HTML, CSS, vanilla JS)  ──invoke──▶  src-tauri/src/lib.rs   commands: scan, recycle, reveal, settings, links
        ▲                                     │
        └──── scan-progress / scan-done ◀─────┤
                                              ├─ scan.rs   parallel walker + classification rules
                                              └─ apps.rs   installed programs from the registry
ui/catalog.json  ◀── scripts/build-catalog.mjs ◀── RepoQuarry/data (products, projects, metrics)
```

There is no framework and no bundler on the front end. Tauri serves `ui/` straight into WebView2.

## The scan

1. **Installed apps** are read from the three Uninstall registry keys (64-bit, 32-bit and per-user) that Settings uses. System components, updates and hotfixes are skipped. Each app's `InstallLocation` becomes an Applications rule, which is how apps installed under `AppData` (Slack, Discord, VS Code user installs) land in Applications rather than Other.
2. **One walk over the drive.** `rayon` runs `read_dir` on many folders at once, 2× the CPU count (capped at 32 threads), since the work is waiting on the disk. On Windows, `DirEntry::metadata` comes from the directory listing itself, so sizes cost no extra system call per file.
3. **Each folder gets a category** from the first rule that matches:

   | Rule | Category |
   |---|---|
   | Exact paths: `Windows\Temp`, `Windows\SoftwareDistribution\Download`, WER reports, Prefetch, crash dumps, `$Recycle.Bin` | Caches |
   | `Windows`, `ProgramData`, `System Volume Information`, `Recovery`, `Windows.old`, upgrade folders | System Data |
   | `Program Files`, `Program Files (x86)`, registry install locations | Applications |
   | The signed-in user's Downloads folder | Downloads |
   | Otherwise, inherit the parent's category | |
   | Folder named `SteamLibrary`, `steamapps`, `Epic Games`, `XboxGames` | Applications |
   | Folder named `Cache`, `Code Cache`, `GPUCache`, `cache2`, `CacheStorage`, `INetCache`, `npm-cache`, `.cache`, `DXCache`… | Caches |
   | `Temp` directly under `AppData\Local` | Caches |
   | `Users\<anyone>\Downloads` | Downloads |

   A file with no category from its folder is **Large Files** at 100 MB or more, and **Other** below that. `pagefile.sys`, `hiberfil.sys` and `swapfile.sys` at the drive root are System Data.
4. **Totals are reconciled with the drive.**
   - Windows hard-links most of `WinSxS` into `System32` and elsewhere, so folder sizes add up to more than the disk holds. Any excess over the used space Windows reports is taken off System Data and shown in that view.
   - Space that could not be read (System Restore snapshots, other users' profiles, NTFS metadata) is added to Other and called out there.
5. **Things that are skipped:** symlinks and junctions (they point at space counted elsewhere), and OneDrive "online-only" placeholders, which report a full size but use no local space (`OFFLINE`, `RECALL_ON_OPEN` and `RECALL_ON_DATA_ACCESS` attributes count as 0 bytes).

Progress (files, bytes, current folder) is emitted every 150 ms. Stop sets a flag every worker checks before opening the next folder.

## Safety

- **Nothing is deleted permanently.** `recycle` and `recycle_contents` use the Windows Recycle Bin through the `trash` crate.
- **Protected paths** are refused in Rust, whatever the UI sends: drive roots, `%SystemRoot%`, `%ProgramFiles%`, `%ProgramFiles(x86)%` and `%ProgramData%`, plus everything under them.
- **Caches are cleared from the inside.** The folder itself stays, because apps and Windows expect folders such as `Temp` to exist. Files in use are skipped and counted.
- **Emptying the Recycle Bin** calls `SHEmptyRecycleBinW` with default flags, so Windows shows its own confirmation.
- **Uninstalling** opens Settings > Apps rather than running uninstall strings.
- **External links** only open `https://repoquarry.dev/` and `https://github.com/` URLs.
- **No network access.** The content security policy only allows the app's own files and the Tauri IPC channel.

## RepoQuarry swaps

`scripts/build-catalog.mjs` reads RepoQuarry's `data/products`, `data/projects` and `data/metrics.json`. For each paid product that ships a Windows desktop app it stores the product, the regular expressions that recognise its installed-program names, and every project RepoQuarry lists as an alternative (coverage, note, licence, stars). The app matches installed programs against those expressions locally; nothing about your PC leaves it.
