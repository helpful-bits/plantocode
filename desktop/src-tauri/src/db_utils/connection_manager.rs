use log::{error, info, warn};
use sqlx::{Executor, Row};
use std::fs;
use std::path::{Path, PathBuf};
use tauri::Manager;

use crate::constants::{APP_DATA_DIR_NAME, DB_FILENAME};
use crate::error::AppError;
use crate::error::AppResult;

/// Ensures that the database directory and files have the correct permissions
pub fn ensure_db_permissions(app_data_root_dir: &Path) -> AppResult<()> {
    info!("Ensuring database permissions");

    // Construct paths
    let db_dir_path = app_data_root_dir.to_path_buf();
    let db_file_path = db_dir_path.join(DB_FILENAME);

    // Create directory if it doesn't exist
    if !db_dir_path.exists() {
        info!("Creating database directory: {}", db_dir_path.display());
        fs::create_dir_all(&db_dir_path)?;
    }

    // Set directory permissions (platform-specific)
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;

        info!(
            "Setting permissions for directory: {}",
            db_dir_path.display()
        );
        let dir_perms = fs::Permissions::from_mode(0o775); // rwxrwxr-x
        fs::set_permissions(&db_dir_path, dir_perms)?;
    }

    #[cfg(windows)]
    {
        // Windows permissions are typically handled by ACLs
        // Creating the directory is usually sufficient, but we could add
        // specific Windows permission code here if needed
        info!(
            "Database directory exists (Windows): {}",
            db_dir_path.display()
        );
    }

    // Set file permissions if files exist
    if db_file_path.exists() {
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;

            info!(
                "Setting permissions for database file: {}",
                db_file_path.display()
            );
            let file_perms = fs::Permissions::from_mode(0o664); // rw-rw-r--
            fs::set_permissions(&db_file_path, file_perms.clone())?;

            // Check for SQLite auxiliary files and set permissions
            let wal_file_path = db_dir_path.join(format!("{}-wal", DB_FILENAME));
            let shm_file_path = db_dir_path.join(format!("{}-shm", DB_FILENAME));

            if wal_file_path.exists() {
                info!(
                    "Setting permissions for WAL file: {}",
                    wal_file_path.display()
                );
                fs::set_permissions(&wal_file_path, file_perms.clone())?;
            }

            if shm_file_path.exists() {
                info!(
                    "Setting permissions for SHM file: {}",
                    shm_file_path.display()
                );
                fs::set_permissions(&shm_file_path, file_perms.clone())?;
            }
        }

        #[cfg(windows)]
        {
            // Windows-specific file permission handling if needed
            info!("Database file exists (Windows): {}", db_file_path.display());
        }
    }

    Ok(())
}

/// Attempts to recover from a readonly database state
///
/// Updated to work with sqlx::SqlitePool directly
pub async fn handle_readonly_database(
    app_handle: &tauri::AppHandle,
    app_data_root_dir: &Path,
) -> AppResult<bool> {
    error!("Attempting to recover from readonly database state");

    // Construct paths
    let db_dir_path = app_data_root_dir.to_path_buf();
    let db_file_path = db_dir_path.join(DB_FILENAME);
    let wal_file_path = db_dir_path.join(format!("{}-wal", DB_FILENAME));
    let shm_file_path = db_dir_path.join(format!("{}-shm", DB_FILENAME));

    // If database file doesn't exist, nothing to recover
    if !db_file_path.exists() {
        warn!(
            "Database file doesn't exist, nothing to recover: {}",
            db_file_path.display()
        );
        return Ok(false);
    }

    // Create a backup of the database file
    let timestamp = chrono::Utc::now().format("%Y%m%d%H%M%S");
    let backup_path = db_file_path.with_extension(format!("backup-{}", timestamp));
    info!(
        "Creating database backup: {} -> {}",
        db_file_path.display(),
        backup_path.display()
    );

    if let Err(e) = fs::copy(&db_file_path, &backup_path) {
        warn!("Failed to create database backup: {}", e);
    }

    // Ensure proper permissions
    if let Err(e) = ensure_db_permissions(app_data_root_dir) {
        warn!("Failed to set database permissions: {}", e);
    }

    // Try to access the database through Tauri plugin
    info!("Attempting to run integrity check on database");
    let db: sqlx::SqlitePool = app_handle.state::<sqlx::SqlitePool>().inner().clone();

    // Run integrity check
    match sqlx::query("PRAGMA integrity_check;").fetch_one(&db).await {
        Ok(row) => match row.try_get::<'_, String, _>(0) {
            Ok(result) => {
                if result == "ok" {
                    info!("Database integrity check passed");
                    return Ok(true);
                } else {
                    warn!("Database integrity check failed: {}", result);
                }
            }
            Err(e) => {
                warn!("Failed to read integrity check result: {}", e);
            }
        },
        Err(e) => {
            warn!("Failed to run integrity check: {}", e);

            // Try more aggressive recovery: delete WAL and SHM files
            if wal_file_path.exists() {
                info!("Removing WAL file: {}", wal_file_path.display());
                if let Err(e) = fs::remove_file(&wal_file_path) {
                    warn!("Failed to remove WAL file: {}", e);
                }
            }

            if shm_file_path.exists() {
                info!("Removing SHM file: {}", shm_file_path.display());
                if let Err(e) = fs::remove_file(&shm_file_path) {
                    warn!("Failed to remove SHM file: {}", e);
                }
            }

            // Try running integrity check again after removing auxiliary files
            info!("Attempting to run integrity check after removing auxiliary files");
            match sqlx::query("PRAGMA integrity_check;").fetch_one(&db).await {
                Ok(row) => match row.try_get::<'_, String, _>(0) {
                    Ok(result) => {
                        if result == "ok" {
                            info!("Database integrity check passed after removing auxiliary files");
                            return Ok(true);
                        } else {
                            warn!(
                                "Database integrity check failed after removing auxiliary files: {}",
                                result
                            );
                        }
                    }
                    Err(e) => {
                        warn!(
                            "Failed to read integrity check result after removing auxiliary files: {}",
                            e
                        );
                    }
                },
                Err(e) => {
                    error!(
                        "Failed to open database after removing auxiliary files: {}",
                        e
                    );

                    // Last resort: delete the database file and restart the app
                    warn!("Last resort: deleting database file and creating a new one");
                    if let Err(e) = fs::remove_file(&db_file_path) {
                        error!("Failed to delete database file: {}", e);
                        return Ok(false);
                    }

                    // Create an empty file
                    fs::write(&db_file_path, b"")?;

                    // Set permissions
                    if let Err(e) = ensure_db_permissions(app_data_root_dir) {
                        error!("Failed to set permissions for new database file: {}", e);
                        return Ok(false);
                    }

                    info!("Created new empty database file with correct permissions");
                    warn!(
                        "Database completely reset - application needs to restart and reinitialize database"
                    );

                    // The app will need to restart since we've recreated the database file
                    return Ok(false);
                }
            }
        }
    }

    // If we reach here, all recovery attempts failed
    Ok(false)
}
