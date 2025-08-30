pub mod background_job_repository;
pub mod connection_manager;
pub mod error_log_repository;
pub mod job_metadata_updates;
pub mod migration_system;
pub mod session_repository;
pub mod settings_repository;
pub mod terminal_sessions_repository;

// Re-export modules
pub use background_job_repository::BackgroundJobRepository;
pub use connection_manager::*;
pub use error_log_repository::ErrorLogRepository;
pub use migration_system::MigrationSystem;
pub use session_repository::SessionRepository;
pub use settings_repository::SettingsRepository;
pub use terminal_sessions_repository::TerminalSessionsRepository;

use crate::error::{AppError, AppResult};
use crate::models::{DatabaseInfo, TableInfo};
use log::warn;
use serde_json::Value;
use sqlx::{Executor, Row, SqlitePool};
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Arc;
use tauri::Manager;
use tokio::fs as tokio_fs;

/// Get the Tauri database instance and ensure it has proper permissions
///
/// This uses Tauri v2's plugin architecture for database access.
pub fn get_database_instance(
    app_handle: &tauri::AppHandle,
) -> Result<sqlx::SqlitePool, crate::error::AppError> {
    use crate::error::AppError;
    use log::{error, info};

    // Get the database using the Tauri v2 API
    info!("Retrieving database instance using Tauri v2 API");
    let db: sqlx::SqlitePool = app_handle.state::<sqlx::SqlitePool>().inner().clone();

    // Ensure database permissions
    let app_data_root_dir = app_handle.path().app_local_data_dir().map_err(|e| {
        AppError::ConfigError(format!("Failed to determine app data directory: {}", e))
    })?;

    // Ensure database directory and file have proper permissions
    info!("Ensuring database permissions");
    if let Err(e) = ensure_db_permissions(&app_data_root_dir) {
        error!("Failed to ensure database permissions: {}", e);
    }

    Ok(db)
}


/// Get database diagnostic information
pub async fn get_database_info(db: Arc<SqlitePool>) -> AppResult<DatabaseInfo> {
    // Get database file path
    let db_path_row = sqlx::query("PRAGMA database_list;").fetch_one(&*db).await?;
    let file_path_str: Option<String> = db_path_row
        .try_get::<'_, Option<String>, _>("file")
        .unwrap_or(None);
    let db_file_path = file_path_str.clone().map(PathBuf::from);

    // Get WAL file path if main DB path exists
    let wal_file_path = db_file_path.as_ref().and_then(|p| {
        if let Some(file_name) = p.file_name().and_then(|n| n.to_str()) {
            Some(p.with_file_name(format!("{}-wal", file_name)))
        } else {
            None
        }
    });

    // Get file sizes
    let mut size_bytes = None;
    if let Some(ref p_val) = db_file_path {
        // p_val is &PathBuf
        match tokio_fs::metadata(p_val).await {
            Ok(meta) => size_bytes = Some(meta.len()),
            Err(e) => {
                let error_str = e.to_string();
                warn!(
                    "Failed to get metadata for DB file {}: {}",
                    p_val.display(),
                    error_str
                );
            }
        }
    }

    let mut wal_size_bytes = None;
    if let Some(ref p_val) = wal_file_path {
        // p_val is &PathBuf
        match tokio_fs::metadata(p_val).await {
            Ok(meta) => wal_size_bytes = Some(meta.len()),
            Err(e) => {
                let error_str = e.to_string();
                warn!(
                    "Failed to get metadata for WAL file {}: {}",
                    p_val.display(),
                    error_str
                );
            }
        }
    }

    // Get integrity check status
    let integrity_row = sqlx::query("PRAGMA integrity_check;")
        .fetch_one(&*db)
        .await?;
    let integrity_check: String = integrity_row.try_get::<'_, String, _>("integrity_check")?;

    // Get journal mode
    let journal_mode_row = sqlx::query("PRAGMA journal_mode;").fetch_one(&*db).await?;
    let journal_mode: String = journal_mode_row.try_get::<'_, String, _>("journal_mode")?;
    let wal_enabled = journal_mode.to_lowercase() == "wal";

    // Get table names
    let table_name_rows = sqlx::query(
        "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%';",
    )
    .fetch_all(&*db)
    .await?;

    let mut tables_info = Vec::new();
    let mut total_rows = 0;

    for row in table_name_rows {
        let table_name: String = row.try_get::<'_, String, _>("name")?;

        let count_query = format!("SELECT COUNT(*) FROM \"{}\"", table_name);
        let count_row = sqlx::query(&count_query).fetch_one(&*db).await?;
        let row_count: i64 = count_row.try_get::<'_, i64, _>(0)?;

        tables_info.push(TableInfo {
            name: table_name,
            row_count,
        });
        total_rows += row_count;
    }

    Ok(DatabaseInfo {
        file_path: file_path_str,
        tables: tables_info,
        total_rows,
        integrity_check,
        wal_enabled,
        journal_mode,
        size_bytes,
        wal_size_bytes,
    })
}
