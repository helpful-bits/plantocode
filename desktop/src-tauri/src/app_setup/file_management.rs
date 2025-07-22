use crate::FILE_LOCK_MANAGER;
use crate::error::AppError;
use crate::utils::FileLockManager;
use log::info;
use std::sync::Arc;
use tauri::{AppHandle, Manager};

pub async fn initialize_file_lock_manager(app_handle: &AppHandle) -> Result<(), AppError> {
    // Initialize file lock manager - simplified for write operations only
    // No timeout needed as this is now a basic mutex-style coordinator
    let file_lock_manager_instance = Arc::new(FileLockManager::new());

    // Manage state with Tauri
    app_handle.manage(file_lock_manager_instance.clone());

    // Store reference in global static
    FILE_LOCK_MANAGER
        .set(file_lock_manager_instance)
        .expect("Failed to set FILE_LOCK_MANAGER");

    info!("File lock manager initialized and registered in app state");

    Ok(())
}
