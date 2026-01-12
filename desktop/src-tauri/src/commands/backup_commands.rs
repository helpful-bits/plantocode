use crate::error::AppResult;
use crate::services::{BackupInfo, BackupService, BackupStats};
use log::{error, info, warn};
use std::path::Path;
use std::sync::Arc;
use tauri::{AppHandle, State, command};

/// Get statistics about the backup system
#[tauri::command]
pub async fn get_backup_stats_command(
    backup_service: State<'_, Arc<BackupService>>,
) -> AppResult<BackupStats> {
    info!("[BackupCommands] Getting backup statistics");

    backup_service.get_backup_stats()
}

/// List all available backups
#[tauri::command]
pub async fn list_backups_command(
    backup_service: State<'_, Arc<BackupService>>,
) -> AppResult<Vec<BackupInfo>> {
    info!("[BackupCommands] Listing available backups");

    backup_service.get_backup_list().await
}

/// Restore database from a specific backup file
#[tauri::command]
pub async fn restore_from_backup_command(
    backup_service: State<'_, Arc<BackupService>>,
    backup_filename: String,
) -> AppResult<serde_json::Value> {
    info!(
        "[BackupCommands] Restoring database from backup: {}",
        backup_filename
    );

    // Find the backup file by filename
    let backups = backup_service.get_backup_list().await?;
    let backup_info = backups
        .iter()
        .find(|b| b.filename == backup_filename)
        .ok_or_else(|| {
            crate::error::AppError::DatabaseError(format!(
                "Backup file not found: {}",
                backup_filename
            ))
        })?;

    if !backup_info.is_valid {
        return Err(crate::error::AppError::DatabaseError(
            "Selected backup file is corrupted or invalid".to_string(),
        ));
    }

    let backup_path = Path::new(&backup_info.full_path);

    match backup_service.restore_from_backup(backup_path).await {
        Ok(_) => {
            info!(
                "[BackupCommands] Database restored successfully from: {}",
                backup_filename
            );
            Ok(serde_json::json!({
                "success": true,
                "backupFile": backup_filename,
                "message": "Database restored successfully. Please restart the application."
            }))
        }
        Err(e) => {
            error!("[BackupCommands] Failed to restore from backup: {}", e);
            Err(e)
        }
    }
}

/// Automatically restore from the latest valid backup
#[tauri::command]
pub async fn auto_restore_latest_backup_command(
    backup_service: State<'_, Arc<BackupService>>,
) -> AppResult<serde_json::Value> {
    info!("[BackupCommands] Attempting automatic restore from latest backup");

    match backup_service.auto_restore_latest_backup().await? {
        Some(restored_backup) => {
            info!(
                "[BackupCommands] Auto-restored from backup: {}",
                restored_backup
            );
            Ok(serde_json::json!({
                "success": true,
                "backupFile": restored_backup,
                "message": "Database automatically restored from latest backup. Please restart the application."
            }))
        }
        None => {
            warn!("[BackupCommands] No valid backups found for auto-restore");
            Ok(serde_json::json!({
                "success": false,
                "message": "No valid backups available for restoration."
            }))
        }
    }
}

/// Create an immediate backup manually
#[tauri::command]
pub async fn create_manual_backup_command(
    backup_service: State<'_, Arc<BackupService>>,
) -> AppResult<serde_json::Value> {
    info!("[BackupCommands] Creating manual backup");

    // Access the backup service's create_backup method
    // Since it's not public, we'll need to add a public wrapper
    match backup_service.create_manual_backup().await {
        Ok(backup_path) => {
            let filename = backup_path
                .file_name()
                .and_then(|n| n.to_str())
                .unwrap_or("unknown");

            info!("[BackupCommands] Manual backup created: {}", filename);
            Ok(serde_json::json!({
                "success": true,
                "backupFile": filename,
                "backupPath": backup_path.to_string_lossy(),
                "message": "Manual backup created successfully."
            }))
        }
        Err(e) => {
            error!("[BackupCommands] Failed to create manual backup: {}", e);
            Err(e)
        }
    }
}

/// Verify integrity of a specific backup
#[tauri::command]
pub async fn verify_backup_command(
    backup_service: State<'_, Arc<BackupService>>,
    backup_filename: String,
) -> AppResult<serde_json::Value> {
    info!("[BackupCommands] Verifying backup: {}", backup_filename);

    // Find the backup file by filename
    let backups = backup_service.get_backup_list().await?;
    let backup_info = backups
        .iter()
        .find(|b| b.filename == backup_filename)
        .ok_or_else(|| {
            crate::error::AppError::DatabaseError(format!(
                "Backup file not found: {}",
                backup_filename
            ))
        })?;

    Ok(serde_json::json!({
        "filename": backup_info.filename,
        "isValid": backup_info.is_valid,
        "sizeBytes": backup_info.size_bytes,
        "createdTimestamp": backup_info.created_timestamp,
        "message": if backup_info.is_valid {
            "Backup is valid and can be restored"
        } else {
            "Backup is corrupted or invalid"
        }
    }))
}

/// Delete a specific backup file
#[tauri::command]
pub async fn delete_backup_command(
    backup_service: State<'_, Arc<BackupService>>,
    backup_filename: String,
) -> AppResult<serde_json::Value> {
    info!("[BackupCommands] Deleting backup: {}", backup_filename);

    // Find the backup file by filename
    let backups = backup_service.get_backup_list().await?;
    let backup_info = backups
        .iter()
        .find(|b| b.filename == backup_filename)
        .ok_or_else(|| {
            crate::error::AppError::DatabaseError(format!(
                "Backup file not found: {}",
                backup_filename
            ))
        })?;

    let backup_path = Path::new(&backup_info.full_path);

    match std::fs::remove_file(backup_path) {
        Ok(_) => {
            info!(
                "[BackupCommands] Backup deleted successfully: {}",
                backup_filename
            );
            Ok(serde_json::json!({
                "success": true,
                "backupFile": backup_filename,
                "message": "Backup deleted successfully."
            }))
        }
        Err(e) => {
            error!("[BackupCommands] Failed to delete backup: {}", e);
            Err(crate::error::AppError::DatabaseError(format!(
                "Failed to delete backup: {}",
                e
            )))
        }
    }
}
