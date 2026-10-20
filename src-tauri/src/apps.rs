//! Installed programs, read from the same registry keys that
//! Settings > Apps > Installed apps uses.

use serde::Serialize;
use std::collections::HashSet;

#[derive(Serialize, Clone, Debug)]
pub struct App {
    pub name: String,
    pub publisher: String,
    pub version: String,
    pub location: String,
    /// Bytes measured on disk during the scan, or the installer's own estimate.
    pub bytes: u64,
    pub measured: bool,
}

#[cfg(windows)]
pub fn installed() -> Vec<App> {
    use winreg::enums::{HKEY_CURRENT_USER, HKEY_LOCAL_MACHINE, KEY_READ};
    use winreg::RegKey;

    const PATHS: [(winreg::HKEY, &str); 3] = [
        (HKEY_LOCAL_MACHINE, "SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall"),
        (HKEY_LOCAL_MACHINE, "SOFTWARE\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall"),
        (HKEY_CURRENT_USER, "SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall"),
    ];

    let mut seen = HashSet::new();
    let mut apps = Vec::new();
    for (hive, path) in PATHS {
        let Ok(key) = RegKey::predef(hive).open_subkey_with_flags(path, KEY_READ) else {
            continue;
        };
        for sub in key.enum_keys().flatten() {
            let Ok(k) = key.open_subkey_with_flags(&sub, KEY_READ) else {
                continue;
            };
            let name: String = k.get_value("DisplayName").unwrap_or_default();
            let name = name.trim().to_string();
            if name.is_empty() {
                continue;
            }
            let system: u32 = k.get_value("SystemComponent").unwrap_or(0);
            let parent: String = k.get_value("ParentKeyName").unwrap_or_default();
            let release: String = k.get_value("ReleaseType").unwrap_or_default();
            if system == 1 || !parent.is_empty() || release.contains("Update") || release == "Hotfix" {
                continue;
            }
            let version: String = k.get_value("DisplayVersion").unwrap_or_default();
            if !seen.insert((name.to_lowercase(), version.clone())) {
                continue;
            }
            let estimated_kb: u32 = k.get_value("EstimatedSize").unwrap_or(0);
            apps.push(App {
                name,
                publisher: k.get_value::<String, _>("Publisher").unwrap_or_default().trim().to_string(),
                version,
                location: k
                    .get_value::<String, _>("InstallLocation")
                    .unwrap_or_default()
                    .trim()
                    .trim_matches('"')
                    .to_string(),
                bytes: estimated_kb as u64 * 1024,
                measured: false,
            });
        }
    }
    apps
}

#[cfg(not(windows))]
pub fn installed() -> Vec<App> {
    Vec::new()
}
