use std::sync::OnceLock;

static DEVICE_NAME_CACHE: OnceLock<String> = OnceLock::new();

pub fn get_device_display_name() -> String {
    DEVICE_NAME_CACHE
        .get_or_init(|| normalize(&resolve_device_name()))
        .clone()
}

pub fn get_device_display_name_with_override(override_name: Option<String>) -> String {
    if let Some(v) = override_name {
        let v = v.trim().to_string();
        if !v.is_empty() && v.to_lowercase() != "unknown" {
            return normalize(&v);
        }
    }
    get_device_display_name()
}

fn normalize(name: &str) -> String {
    let trimmed = name.trim();
    if trimmed.is_empty() {
        return "Unknown Device".to_string();
    }
    if trimmed.len() > 64 {
        trimmed.chars().take(64).collect()
    } else {
        trimmed.to_string()
    }
}

#[cfg(target_os = "macos")]
fn resolve_device_name() -> String {
    use std::process::Command;

    if let Ok(output) = Command::new("scutil").arg("--get").arg("ComputerName").output() {
        if output.status.success() {
            if let Ok(name) = String::from_utf8(output.stdout) {
                let trimmed = name.trim();
                if !trimmed.is_empty() {
                    return trimmed.to_string();
                }
            }
        }
    }

    if let Ok(output) = Command::new("scutil").arg("--get").arg("LocalHostName").output() {
        if output.status.success() {
            if let Ok(name) = String::from_utf8(output.stdout) {
                let trimmed = name.trim();
                if !trimmed.is_empty() {
                    return trimmed.to_string();
                }
            }
        }
    }

    hostname::get()
        .ok()
        .and_then(|h| h.into_string().ok())
        .unwrap_or_else(|| "Unknown Device".to_string())
}

#[cfg(target_os = "windows")]
fn resolve_device_name() -> String {
    use windows_sys::Win32::System::SystemInformation::{
        ComputerNamePhysicalDnsHostname, GetComputerNameExW,
    };

    let mut buffer = [0u16; 256];
    let mut size = buffer.len() as u32;

    unsafe {
        if GetComputerNameExW(ComputerNamePhysicalDnsHostname, buffer.as_mut_ptr(), &mut size) != 0
        {
            let name = String::from_utf16_lossy(&buffer[..size as usize]);
            if !name.trim().is_empty() {
                return name.trim().to_string();
            }
        }
    }

    hostname::get()
        .ok()
        .and_then(|h| h.into_string().ok())
        .unwrap_or_else(|| "Unknown Device".to_string())
}

#[cfg(target_os = "linux")]
fn resolve_device_name() -> String {
    use std::process::Command;

    if let Ok(output) = Command::new("hostnamectl")
        .arg("--pretty")
        .output()
    {
        if output.status.success() {
            if let Ok(name) = String::from_utf8(output.stdout) {
                let trimmed = name.trim();
                if !trimmed.is_empty() {
                    return trimmed.to_string();
                }
            }
        }
    }

    if let Ok(output) = Command::new("hostnamectl")
        .arg("--static")
        .output()
    {
        if output.status.success() {
            if let Ok(name) = String::from_utf8(output.stdout) {
                let trimmed = name.trim();
                if !trimmed.is_empty() {
                    return trimmed.to_string();
                }
            }
        }
    }

    hostname::get()
        .ok()
        .and_then(|h| h.into_string().ok())
        .unwrap_or_else(|| "Unknown Device".to_string())
}

#[cfg(not(any(target_os = "macos", target_os = "windows", target_os = "linux")))]
fn resolve_device_name() -> String {
    hostname::get()
        .ok()
        .and_then(|h| h.into_string().ok())
        .unwrap_or_else(|| "Unknown Device".to_string())
}
