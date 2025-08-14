use crate::db_utils::{
    BackgroundJobRepository, SessionRepository, SettingsRepository,
};
use crate::error::AppError;
use log::{error, info, warn};
use tracing::{info as tracing_info, warn as tracing_warn, error as tracing_error};
use sqlx::{Executor, SqlitePool, migrate::MigrateDatabase, sqlite::SqlitePoolOptions};
use std::fs;
use std::sync::Arc;
use tauri::{AppHandle, Manager};

pub async fn initialize_database_light(app_handle: &AppHandle) -> Result<(), AppError> {
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
                return Err(AppError::DatabaseError(
                    "Migration file not found and no embedded fallback available".to_string()
                ));
            }
        };

        // Apply migrations
        db.execute(&*migration_sql)
            .await
            .map_err(|e| AppError::DatabaseError(format!("Failed to apply migrations: {}", e)))?;

        info!("Database migrations applied successfully");
    }

    // Manage the pool as state immediately
    app_handle.manage(db.clone());
    let pool_arc = Arc::new(db);
    
    // Ensure error_logs exists (assumes consolidated schema handles this)
    if let Err(e) = sqlx::query(r#"
      CREATE TABLE IF NOT EXISTS error_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp INTEGER NOT NULL DEFAULT (strftime('%s','now')),
        level TEXT NOT NULL DEFAULT 'ERROR' CHECK (level IN ('ERROR','WARN','INFO','DEBUG')),
        error_type TEXT,
        message TEXT NOT NULL,
        context TEXT,
        stack TEXT,
        metadata TEXT,
        app_version TEXT,
        platform TEXT
      )
    "#).execute(&*pool_arc).await {
      log::warn!("Failed ensuring error_logs table: {}", e);
    }
    if let Err(e) = sqlx::query(r#"
      CREATE INDEX IF NOT EXISTS idx_error_logs_timestamp ON error_logs(timestamp)
    "#).execute(&*pool_arc).await {
      log::warn!("Failed ensuring error_logs index: {}", e);
    }

    // Manage ErrorLogRepository in Tauri state (assumes table exists via consolidated schema)
    let error_log_repo = crate::db_utils::ErrorLogRepository::new(pool_arc.clone());
    app_handle.manage(error_log_repo.clone());

    // Best-effort prune (30 days)
    tauri::async_runtime::spawn(async move {
      if let Err(e) = error_log_repo.prune_older_than_days(30).await {
        log::warn!("Error log prune failed: {}", e);
      }
    });

    // Manage ONLY SettingsRepository early
    let settings_repo = crate::db_utils::SettingsRepository::with_app_handle(pool_arc.clone(), app_handle.clone());
    let settings_repo_arc = std::sync::Arc::new(settings_repo);
    app_handle.manage(settings_repo_arc);

    info!("Light database initialization complete - heavy DB maintenance deferred");
    info!("Database connection pool and settings repository ready");

    Ok(())
}

pub async fn run_deferred_db_tasks(app_handle: &tauri::AppHandle) -> Result<(), crate::error::AppError> {
    use tracing::{info, warn, error};
    use std::sync::Arc;
    
    info!("Starting deferred DB tasks: health check, recovery, migrations, and repo wiring.");
    info!("Deferred DB: starting integrity check.");
    
    // Retrieve pool from app state
    let db = app_handle.state::<SqlitePool>().inner().clone();
    let pool_arc = Arc::new(db);
    
    // Health check with PRAGMA integrity_check
    match check_database_health(&*pool_arc).await {
        Ok(true) => {
            info!("Deferred DB: integrity check passed");
        }
        Ok(false) => {
            warn!("Deferred DB: integrity check failed, attempting automatic recovery");
            let app_data_dir = app_handle.path().app_local_data_dir().map_err(|e| {
                crate::error::AppError::InitializationError(format!("Failed to get app local data dir: {}", e))
            })?;
            attempt_automatic_recovery(app_handle, &app_data_dir).await?;
            
            // Re-check after recovery
            match check_database_health(&*pool_arc).await {
                Ok(true) => {
                    info!("Deferred DB: integrity check passed after recovery");
                }
                _ => {
                    error!("Deferred DB: integrity check still failed after recovery attempt");
                    return Err(crate::error::AppError::DatabaseError(
                        "Database integrity check failed even after recovery".to_string()
                    ));
                }
            }
        }
        Err(e) => {
            error!("Deferred DB: integrity check error: {}", e);
            warn!("Deferred DB: attempting automatic recovery due to integrity check error");
            let app_data_dir = app_handle.path().app_local_data_dir().map_err(|e| {
                crate::error::AppError::InitializationError(format!("Failed to get app local data dir: {}", e))
            })?;
            attempt_automatic_recovery(app_handle, &app_data_dir).await?;
        }
    }
    
    // Run version-based migrations
    info!("Deferred DB: starting version-based migrations...");
    let current_version = app_handle.package_info().version.to_string();
    let migration_system = crate::db_utils::MigrationSystem::new(pool_arc.clone());
    
    if let Err(e) = migration_system.run_migrations(app_handle, &current_version).await {
        error!("Deferred DB: version migration failed: {}", e);
        // Log the error but continue - most migrations are non-critical
        warn!("Deferred DB: continuing despite migration failure. Some features may not work correctly.");
    }
    
    info!("Deferred DB: migrations completed.");
    
    // Ensure database permissions
    let app_data_root_dir = app_handle.path().app_local_data_dir().map_err(|e| {
        crate::error::AppError::InitializationError(format!("Failed to get app local data dir: {}", e))
    })?;
    if let Err(e) = crate::db_utils::ensure_db_permissions(&app_data_root_dir) {
        error!("Deferred DB: failed to ensure DB permissions: {}", e);
    }
    
    // Create and manage remaining repositories: SessionRepository and BackgroundJobRepository
    let session_repo = crate::db_utils::SessionRepository::new(pool_arc.clone());
    let background_job_repo = crate::db_utils::BackgroundJobRepository::new(pool_arc.clone());
    
    // Wrap repositories in Arc
    let session_repo_arc = Arc::new(session_repo);
    let background_job_repo_arc = Arc::new(background_job_repo);
    
    // Manage state with Tauri
    app_handle.manage(session_repo_arc.clone());
    app_handle.manage(background_job_repo_arc.clone());
    
    info!("Deferred DB: repositories (session, background jobs) wired.");
    
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
