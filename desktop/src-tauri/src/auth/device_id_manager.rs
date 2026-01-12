use crate::error::AppError;
use std::{fs, path::PathBuf, sync::RwLock};
use tauri::{AppHandle, Manager};
use uuid::Uuid;

static DEVICE_ID: RwLock<Option<String>> = RwLock::new(None);

fn device_id_path(app: &AppHandle) -> Result<PathBuf, AppError> {
    let dir = app
        .path()
        .app_local_data_dir()
        .map_err(|e| AppError::ConfigError(format!("Failed to get app data dir: {}", e)))?;
    Ok(dir.join("device_id"))
}

pub fn get_or_create(app: &AppHandle) -> Result<String, AppError> {
    // Check if we have a cached value
    {
        let guard = DEVICE_ID.read().map_err(|e| {
            AppError::ConfigError(format!("Failed to acquire device ID read lock: {}", e))
        })?;
        if let Some(v) = guard.as_ref() {
            return Ok(v.clone());
        }
    }

    // Need to create or load - acquire write lock
    let mut guard = DEVICE_ID.write().map_err(|e| {
        AppError::ConfigError(format!("Failed to acquire device ID write lock: {}", e))
    })?;

    // Double-check after acquiring write lock
    if let Some(v) = guard.as_ref() {
        return Ok(v.clone());
    }

    let path = device_id_path(app)?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).ok();
    }
    let value = if let Ok(bytes) = fs::read(&path) {
        let id = String::from_utf8(bytes).unwrap_or_else(|_| Uuid::new_v4().to_string());
        let normalized = id.to_lowercase();
        if normalized != id {
            let _ = fs::write(&path, &normalized);
        }
        normalized
    } else {
        let v = Uuid::new_v4().to_string().to_lowercase();
        let _ = fs::write(&path, &v);
        v
    };
    *guard = Some(value.clone());
    Ok(value)
}

/// Clear the device ID on logout. This deletes both the file and the in-memory cache,
/// ensuring a new device ID is generated on the next login.
/// This is important for multi-user scenarios where different users log in on the same machine.
pub fn clear(app: &AppHandle) -> Result<(), AppError> {
    // Clear the in-memory cache
    {
        let mut guard = DEVICE_ID.write().map_err(|e| {
            AppError::ConfigError(format!("Failed to acquire device ID write lock: {}", e))
        })?;
        *guard = None;
    }

    // Delete the file
    let path = device_id_path(app)?;
    if path.exists() {
        fs::remove_file(&path).map_err(|e| {
            AppError::ConfigError(format!("Failed to delete device ID file: {}", e))
        })?;
        tracing::info!("Device ID cleared for logout");
    }

    Ok(())
}
