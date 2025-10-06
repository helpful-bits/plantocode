use crate::error::AppError;
use std::{fs, path::PathBuf, sync::OnceLock};
use tauri::{AppHandle, Manager};
use uuid::Uuid;

static DEVICE_ID: OnceLock<String> = OnceLock::new();

fn device_id_path(app: &AppHandle) -> Result<PathBuf, AppError> {
    let dir = app
        .path()
        .app_local_data_dir()
        .map_err(|e| AppError::ConfigError(format!("Failed to get app data dir: {}", e)))?;
    Ok(dir.join("device_id"))
}

pub fn get_or_create(app: &AppHandle) -> Result<String, AppError> {
    if let Some(v) = DEVICE_ID.get() {
        return Ok(v.clone());
    }
    let path = device_id_path(app)?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).ok();
    }
    let value = if let Ok(bytes) = fs::read(&path) {
        let id = String::from_utf8(bytes).unwrap_or_else(|_| Uuid::new_v4().to_string());
        id.to_uppercase()
    } else {
        let v = Uuid::new_v4().to_string().to_uppercase();
        let _ = fs::write(&path, &v);
        v
    };
    let _ = DEVICE_ID.set(value.clone());
    Ok(value)
}
