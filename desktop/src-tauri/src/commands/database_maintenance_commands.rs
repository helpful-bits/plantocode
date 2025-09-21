use chrono;
use log::{error, info, warn};
use serde_json;
use std::fs;
use std::path::Path;
use tauri::{AppHandle, Manager};

use crate::app_setup;
use crate::db_utils::connection_manager;
use crate::error::AppResult;
use crate::models::DatabaseHealthData;

/// Check the health and status of the database
#[tauri::command]
pub async fn check_database_health_command(app_handle: AppHandle) -> AppResult<DatabaseHealthData> {
    info!("[DatabaseMaintenance] Checking database health");

    // Get the database path from app data directory
    let app_data_dir = app_handle.path().app_local_data_dir().map_err(|e| {
        crate::error::AppError::DatabaseError(format!(
            "Failed to get app local data directory: {}",
            e
        ))
    })?;

    let db_path = app_data_dir.join("appdata.db");

    let mut health_data = DatabaseHealthData {
        status: "checking".to_string(),
        file_exists: false,
        file_size: None,
        file_permissions: None,
        setup_success: false,
        integrity_status: None,
        integrity_details: None,
        recovery_mode: false,
        needs_repair: false,
        error: None,
        error_category: None,
        error_severity: None,
        details: None,
        last_modified: None,
    };

    // Check if database file exists
    health_data.file_exists = db_path.exists();

    if health_data.file_exists {
        // Get file metadata
        if let Ok(metadata) = fs::metadata(&db_path) {
            health_data.file_size = Some(metadata.len());

            // Get file permissions (Unix-style)
            #[cfg(unix)]
            {
                use std::os::unix::fs::PermissionsExt;
                let perms = metadata.permissions();
                health_data.file_permissions = Some(format!("0o{:o}", perms.mode() & 0o777));
            }

            #[cfg(windows)]
            {
                health_data.file_permissions = Some("Windows permissions".to_string());
            }

            // Get last modified time
            if let Ok(modified) = metadata.modified() {
                if let Ok(duration) = modified.duration_since(std::time::UNIX_EPOCH) {
                    let timestamp = duration.as_millis() as i64;
                    health_data.last_modified = Some(timestamp.to_string());
                }
            }
        }

        // Try to check database integrity
        let conn = app_handle.state::<sqlx::SqlitePool>().inner();
        health_data.setup_success = true;

        // Run integrity check
        match sqlx::query_scalar::<_, String>("PRAGMA integrity_check")
            .fetch_one(conn)
            .await
        {
            Ok(result) => {
                if result == "ok" {
                    health_data.integrity_status = Some("ok".to_string());
                    health_data.status = "ok".to_string();
                } else {
                    health_data.integrity_status = Some("invalid".to_string());
                    health_data.status = "error".to_string();
                    health_data.needs_repair = true;
                    health_data.integrity_details = Some(serde_json::Value::String(result));
                }
            }
            Err(e) => {
                health_data.integrity_status = Some("error".to_string());
                health_data.status = "error".to_string();
                health_data.needs_repair = true;
                health_data.error = Some(format!("Integrity check failed: {}", e));
                health_data.error_category = Some("CONNECTIVITY".to_string());
                health_data.error_severity = Some("WARNING".to_string());
            }
        }
    } else {
        health_data.status = "error".to_string();
        health_data.needs_repair = true;
        health_data.error = Some("Database file does not exist".to_string());
        health_data.error_category = Some("MISSING_FILE".to_string());
        health_data.error_severity = Some("ERROR".to_string());
    }

    info!(
        "[DatabaseMaintenance] Database health check completed: {}",
        health_data.status
    );
    Ok(health_data)
}

/// Attempt to repair the database
#[tauri::command]
pub async fn repair_database_command(app_handle: AppHandle) -> AppResult<serde_json::Value> {
    info!("[DatabaseMaintenance] Attempting database repair");

    let app_data_dir = app_handle.path().app_local_data_dir().map_err(|e| {
        crate::error::AppError::DatabaseError(format!(
            "Failed to get app local data directory: {}",
            e
        ))
    })?;

    let db_path = app_data_dir.join("appdata.db");
    let mut backup_path: Option<String> = None;

    // Create backup if database exists
    if db_path.exists() {
        let backup_file = app_data_dir.join(format!(
            "appdata_backup_{}.db",
            chrono::Utc::now().timestamp()
        ));

        match fs::copy(&db_path, &backup_file) {
            Ok(_) => {
                backup_path = Some(backup_file.to_string_lossy().to_string());
                log::info!("[DatabaseMaintenance] Created backup at: {:?}", backup_file);
            }
            Err(e) => {
                log::warn!("[DatabaseMaintenance] Failed to create backup: {}", e);
            }
        }
    }

    // Attempt repairs
    let mut repair_attempts = Vec::new();

    // 1. Try to fix file permissions
    #[cfg(unix)]
    {
        if db_path.exists() {
            use std::os::unix::fs::PermissionsExt;
            let mut perms = fs::Permissions::from_mode(0o600);
            match fs::set_permissions(&db_path, perms) {
                Ok(_) => {
                    repair_attempts.push("Fixed file permissions".to_string());
                    log::info!("[DatabaseMaintenance] Fixed database file permissions");
                }
                Err(e) => {
                    repair_attempts.push(format!("Permission fix failed: {}", e));
                    log::warn!("[DatabaseMaintenance] Failed to fix permissions: {}", e);
                }
            }
        }
    }

    // 2. Try to connect and run basic recovery
    let conn = app_handle.state::<sqlx::SqlitePool>().inner();
    {
        // Try to run vacuum to clean up the database
        match sqlx::query("VACUUM").execute(conn).await {
            Ok(_) => {
                repair_attempts.push("Database vacuum completed".to_string());
                log::info!("[DatabaseMaintenance] Database vacuum completed successfully");
            }
            Err(e) => {
                repair_attempts.push(format!("Vacuum failed: {}", e));
                log::warn!("[DatabaseMaintenance] Database vacuum failed: {}", e);
            }
        }

        // Try to run reindex
        match sqlx::query("REINDEX").execute(conn).await {
            Ok(_) => {
                repair_attempts.push("Database reindex completed".to_string());
                log::info!("[DatabaseMaintenance] Database reindex completed successfully");
            }
            Err(e) => {
                repair_attempts.push(format!("Reindex failed: {}", e));
                log::warn!("[DatabaseMaintenance] Database reindex failed: {}", e);
            }
        }

        // Check integrity again
        match sqlx::query_scalar::<_, String>("PRAGMA integrity_check")
            .fetch_one(conn)
            .await
        {
            Ok(result) => {
                if result == "ok" {
                    repair_attempts.push("Integrity check passed".to_string());
                    log::info!(
                        "[DatabaseMaintenance] Database repair successful - integrity check passed"
                    );

                    return Ok(serde_json::json!({
                        "success": true,
                        "backup": backup_path,
                        "details": repair_attempts
                    }));
                } else {
                    repair_attempts.push(format!("Integrity check still fails: {}", result));
                }
            }
            Err(e) => {
                repair_attempts.push(format!("Post-repair integrity check failed: {}", e));
            }
        }
    }

    // If we get here, repair was not successful
    log::warn!("[DatabaseMaintenance] Database repair failed");
    Ok(serde_json::json!({
        "success": false,
        "error": format!("Repair attempts unsuccessful: {}", repair_attempts.join("; ")),
        "backup": backup_path,
        "details": repair_attempts
    }))
}

/// Reset the database completely (nuclear option)
#[tauri::command]
pub async fn reset_database_command(app_handle: AppHandle) -> AppResult<serde_json::Value> {
    log::info!("[DatabaseMaintenance] Performing full database reset");

    let app_data_dir = app_handle.path().app_local_data_dir().map_err(|e| {
        crate::error::AppError::DatabaseError(format!(
            "Failed to get app local data directory: {}",
            e
        ))
    })?;

    let db_path = app_data_dir.join("appdata.db");
    let wal_path = app_data_dir.join("appdata.db-wal");
    let shm_path = app_data_dir.join("appdata.db-shm");

    let mut backup_path: Option<String> = None;

    // Create backup if database exists
    if db_path.exists() {
        let backup_file = app_data_dir.join(format!(
            "appdata_reset_backup_{}.db",
            chrono::Utc::now().timestamp()
        ));

        match fs::copy(&db_path, &backup_file) {
            Ok(_) => {
                backup_path = Some(backup_file.to_string_lossy().to_string());
                log::info!(
                    "[DatabaseMaintenance] Created backup before reset at: {:?}",
                    backup_file
                );
            }
            Err(e) => {
                log::warn!(
                    "[DatabaseMaintenance] Failed to create backup before reset: {}",
                    e
                );
                return Ok(serde_json::json!({
                    "success": false,
                    "error": format!("Failed to create backup before reset: {}", e)
                }));
            }
        }
    }

    // Remove database files
    let mut removal_errors = Vec::new();

    for file_path in [&db_path, &wal_path, &shm_path] {
        if file_path.exists() {
            match fs::remove_file(file_path) {
                Ok(_) => {
                    log::info!("[DatabaseMaintenance] Removed file: {:?}", file_path);
                }
                Err(e) => {
                    let error_msg = format!("Failed to remove {}: {}", file_path.display(), e);
                    removal_errors.push(error_msg.clone());
                    log::error!("[DatabaseMaintenance] {}", error_msg);
                }
            }
        }
    }

    if !removal_errors.is_empty() {
        return Ok(serde_json::json!({
            "success": false,
            "error": format!("Could not remove existing database files: {}", removal_errors.join("; ")),
            "backup": backup_path
        }));
    }

    // Re-initialize the database (light phase first, then deferred tasks)
    match app_setup::database::initialize_database_light(&app_handle).await {
        Ok(_) => {
            // Spawn deferred DB tasks
            let app_handle_clone = app_handle.clone();
            tauri::async_runtime::spawn(async move {
                if let Err(e) = app_setup::database::run_deferred_db_tasks(&app_handle_clone).await
                {
                    log::error!(
                        "[DatabaseMaintenance] Deferred DB tasks failed after reset: {}",
                        e
                    );
                }
            });

            log::info!("[DatabaseMaintenance] Database reset and re-initialization successful");
            Ok(serde_json::json!({
                "success": true,
                "backup": backup_path
            }))
        }
        Err(e) => {
            log::error!(
                "[DatabaseMaintenance] Failed to re-initialize database after reset: {}",
                e
            );
            Ok(serde_json::json!({
                "success": false,
                "error": format!("Failed to re-initialize database: {}", e),
                "backup": backup_path
            }))
        }
    }
}
