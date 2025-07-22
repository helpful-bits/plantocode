use crate::db_utils::{
    BackgroundJobRepository, SessionRepository, SettingsRepository, create_repositories,
};
use crate::error::AppError;
use log::{error, info, warn};
use sqlx::{Executor, SqlitePool, migrate::MigrateDatabase, sqlite::SqlitePoolOptions};
use std::fs;
use std::sync::Arc;
use tauri::{AppHandle, Manager};

pub async fn initialize_database(app_handle: &AppHandle) -> Result<(), AppError> {
    // Initialize the SQLite database connection pool
    let app_data_dir = app_handle.path().app_local_data_dir().map_err(|e| {
        AppError::InitializationError(format!("Failed to get app local data dir: {}", e))
    })?;

    // Ensure app data directory exists
    if !app_data_dir.exists() {
        fs::create_dir_all(&app_data_dir).map_err(|e| {
            AppError::InitializationError(format!("Failed to create app data directory: {}", e))
        })?;
    }

    let db_path = app_data_dir.join("appdata.db");
    let db_url = format!("sqlite:{}", db_path.display());

    // Remember if the database file existed before we connect
    let db_exists_before_connect = db_path.exists();

    // Create database if it doesn't exist
    if !db_exists_before_connect {
        info!(
            "Database file doesn't exist. Creating new database at: {}",
            db_path.display()
        );
        sqlx::Sqlite::create_database(&db_url)
            .await
            .map_err(|e| AppError::DatabaseError(format!("Failed to create database: {}", e)))?;
    }

    // Configure and connect to SQLite with proper settings
    info!("Connecting to database at: {}", db_path.display());
    let db = SqlitePoolOptions::new()
        .max_connections(10)
        .connect(&db_url)
        .await
        .map_err(|e| AppError::DatabaseError(format!("Failed to connect to database: {}", e)))?;

    // Check if we need to run migrations or attempt recovery
    if !db_exists_before_connect {
        info!("Running database migrations...");
        // Get migration file path relative to the executable
        let migration_path = app_handle
            .path()
            .resolve(
                "migrations/consolidated_schema.sql",
                tauri::path::BaseDirectory::Resource,
            )
            .map_err(|e| {
                AppError::InitializationError(format!("Failed to resolve migration path: {}", e))
            })?;

        // If not found in resource path, try alternate locations
        let migration_sql = if migration_path.exists() {
            info!(
                "Using migration file from resource path: {}",
                migration_path.display()
            );
            std::fs::read_to_string(&migration_path).map_err(|e| {
                AppError::DatabaseError(format!("Failed to read migration file: {}", e))
            })?
        } else {
            // Try to find it in the current directory or use the embedded version
            let local_path = std::path::Path::new("migrations/consolidated_schema.sql");
            if local_path.exists() {
                info!(
                    "Using migration file from local path: {}",
                    local_path.display()
                );
                std::fs::read_to_string(local_path).map_err(|e| {
                    AppError::DatabaseError(format!("Failed to read migration file: {}", e))
                })?
            } else {
                info!("Using embedded migration SQL");
                include_str!("../../migrations/consolidated_schema.sql").to_string()
            }
        };

        // Apply migrations
        db.execute(&*migration_sql)
            .await
            .map_err(|e| AppError::DatabaseError(format!("Failed to apply migrations: {}", e)))?;

        info!("Database migrations applied successfully");
    } else {
        // Check if existing database is healthy, attempt recovery if needed
        match check_database_health(&db).await {
            Ok(true) => {
                info!("Database ready - health check passed");
            }
            Ok(false) => {
                warn!("Database health check failed, attempting automatic recovery");
                attempt_automatic_recovery(app_handle, &app_data_dir).await?;
            }
            Err(e) => {
                error!("Database health check error: {}", e);
                warn!("Attempting automatic recovery due to health check error");
                attempt_automatic_recovery(app_handle, &app_data_dir).await?;
            }
        }
    }

    // Manage the pool as state
    app_handle.manage(db.clone());
    let pool_arc = Arc::new(db);
    info!("Database connection established");

    // Ensure database permissions
    let app_data_root_dir = app_handle.path().app_local_data_dir().map_err(|e| {
        AppError::InitializationError(format!("Failed to get app local data dir: {}", e))
    })?;
    if let Err(e) = crate::db_utils::ensure_db_permissions(&app_data_root_dir) {
        error!("Failed to ensure DB permissions: {}", e);
    }

    // Create repository instances
    let (session_repo, background_job_repo, settings_repo) =
        create_repositories(pool_arc, app_handle.clone()).map_err(|e| {
            AppError::InitializationError(format!("Failed to create repositories: {}", e))
        })?;

    // Wrap repositories in Arc
    let session_repo_arc = Arc::new(session_repo);
    let background_job_repo_arc = Arc::new(background_job_repo);
    let settings_repo_arc = Arc::new(settings_repo);

    // Manage state with Tauri
    app_handle.manage(session_repo_arc.clone());
    app_handle.manage(background_job_repo_arc.clone());
    app_handle.manage(settings_repo_arc.clone());

    info!("Repository instances created and managed by Tauri");

    Ok(())
}

/// Check if database is healthy
async fn check_database_health(db: &SqlitePool) -> Result<bool, AppError> {
    // Try to run a simple integrity check
    match sqlx::query_scalar::<_, String>("PRAGMA integrity_check")
        .fetch_one(db)
        .await
    {
        Ok(result) => Ok(result == "ok"),
        Err(_) => Ok(false), // Any error means unhealthy
    }
}

/// Attempt automatic recovery from backups
async fn attempt_automatic_recovery(
    app_handle: &AppHandle,
    app_data_dir: &std::path::Path,
) -> Result<(), AppError> {
    use crate::services::BackupService;
    use std::sync::Arc;

    info!("Attempting automatic database recovery from backups");

    // Check if backup service is available in app state
    // Since we're in database initialization, backup service might not be ready yet
    // So we'll create a temporary backup service instance
    let db_pool = app_handle.state::<SqlitePool>().inner().clone();
    let backup_config = crate::services::BackupConfig::default();
    let backup_service = BackupService::new(app_data_dir.to_path_buf(), db_pool, backup_config);

    match backup_service.auto_restore_latest_backup().await {
        Ok(Some(restored_backup)) => {
            info!(
                "Successfully restored database from backup: {}",
                restored_backup
            );
            Ok(())
        }
        Ok(None) => {
            warn!("No valid backups found for automatic recovery");
            Err(AppError::DatabaseError(
                "Database is corrupted and no valid backups are available for recovery".to_string(),
            ))
        }
        Err(e) => {
            error!("Automatic recovery failed: {}", e);
            Err(AppError::DatabaseError(format!(
                "Database is corrupted and automatic recovery failed: {}",
                e
            )))
        }
    }
}
