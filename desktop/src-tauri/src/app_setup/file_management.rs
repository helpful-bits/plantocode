use tauri::{AppHandle, Manager};
use crate::error::AppError;
use log::info;
use std::sync::Arc;
use std::time::Duration;
use crate::utils::FileLockManager;
use crate::FILE_LOCK_MANAGER;

pub async fn initialize_file_lock_manager(app_handle: &AppHandle) -> Result<(), AppError> {
    // Initialize file lock manager (60 seconds timeout)
    let file_lock_manager_instance = Arc::new(FileLockManager::new(Duration::from_secs(60)));
    
    // Manage state with Tauri
    app_handle.manage(file_lock_manager_instance.clone());
    
    // Store reference in global static
    FILE_LOCK_MANAGER.set(file_lock_manager_instance)
        .expect("Failed to set FILE_LOCK_MANAGER");
    
    info!("File lock manager initialized and registered in app state");
    
    Ok(())
}
