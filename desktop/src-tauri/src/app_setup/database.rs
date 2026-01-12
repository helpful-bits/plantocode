use crate::db_utils::{BackgroundJobRepository, SessionRepository, SettingsRepository, execute_script_in_transaction};
use crate::error::AppError;
use log::{error, info, warn};
use sqlx::{Executor, SqlitePool, migrate::MigrateDatabase, sqlite::SqlitePoolOptions};
use std::fs;
use std::sync::Arc;
use tauri::{AppHandle, Manager};
use tracing::{error as tracing_error, info as tracing_info, warn as tracing_warn};

const HISTORY_DEVICE_IDS_NORMALIZED_KEY: &str = "history_device_ids_normalized";

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
        .max_connections(20)
        .after_connect(|conn, _meta| {
            Box::pin(async move {
                // Enable foreign key constraints
                sqlx::query("PRAGMA foreign_keys = ON")
                    .execute(&mut *conn)
                    .await?;

                // Enable WAL mode for better concurrency
                let _ = sqlx::query("PRAGMA journal_mode = WAL")
                    .execute(&mut *conn)
                    .await;

                // Set busy timeout to 5 seconds (5000ms)
                let _ = sqlx::query("PRAGMA busy_timeout = 5000")
                    .execute(&mut *conn)
                    .await;

                // Use NORMAL synchronous mode for better performance with WAL
                let _ = sqlx::query("PRAGMA synchronous = NORMAL")
                    .execute(&mut *conn)
                    .await;

                Ok(())
            })
        })
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
                // Use embedded schema as final fallback
                info!("Using embedded migration schema");
                super::embedded_schema::CONSOLIDATED_SCHEMA.to_string()
            }
        };

        // Apply migrations using transactional safety
        execute_script_in_transaction(&db, &migration_sql).await?;

        info!("Database migrations applied successfully");

        // Set app version immediately after fresh schema application
        let version = app_handle.package_info().version.to_string();
        sqlx::query(
            "INSERT OR REPLACE INTO key_value_store(key, value, updated_at)
             VALUES('app_version', ?, strftime('%s','now'))"
        )
        .bind(version)
        .execute(&db)
        .await?;

        info!("App version set in database after fresh schema application");
    }

    // Manage the pool as state immediately
    let pool_arc = Arc::new(db);
    app_handle.manage(pool_arc.clone());

    // Wire TerminalRepository if not already managed
    if app_handle
        .try_state::<std::sync::Arc<crate::db_utils::TerminalRepository>>()
        .is_none()
    {
        let repo = crate::db_utils::TerminalRepository::new(pool_arc.clone());
        app_handle.manage(std::sync::Arc::new(repo));
    }

    // Ensure error_logs exists (assumes consolidated schema handles this)
    if let Err(e) = sqlx::query(
        r#"
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
    "#,
    )
    .execute(&*pool_arc)
    .await
    {
        log::warn!("Failed ensuring error_logs table: {}", e);
    }
    if let Err(e) = sqlx::query(
        r#"
      CREATE INDEX IF NOT EXISTS idx_error_logs_timestamp ON error_logs(timestamp)
    "#,
    )
    .execute(&*pool_arc)
    .await
    {
        log::warn!("Failed ensuring error_logs index: {}", e);
    }

    // Manage ErrorLogRepository in Tauri state (assumes table exists via consolidated schema)
    let error_log_repo = crate::db_utils::ErrorLogRepository::new(pool_arc.clone());
    let error_log_repo_arc = Arc::new(error_log_repo);
    app_handle.manage(error_log_repo_arc.clone());

    // Best-effort prune (30 days)
    let error_log_repo_for_prune = error_log_repo_arc.clone();
    tauri::async_runtime::spawn(async move {
        if let Err(e) = error_log_repo_for_prune.prune_older_than_days(30).await {
            log::warn!("Error log prune failed: {}", e);
        }
    });

    // Manage ONLY SettingsRepository early
    let settings_repo =
        crate::db_utils::SettingsRepository::with_app_handle(pool_arc.clone(), app_handle.clone());
    let settings_repo_arc = std::sync::Arc::new(settings_repo);
    app_handle.manage(settings_repo_arc);

    info!("Light database initialization complete - heavy DB maintenance deferred");
    info!("Database connection pool and settings repository ready");

    Ok(())
}

/// Wire core job repositories early during critical initialization
pub async fn wire_core_job_repositories(app_handle: &AppHandle) -> Result<(), AppError> {
    use log::info;
    use std::sync::Arc;

    // Get database pool from app state
    let pool_arc = app_handle
        .state::<Arc<SqlitePool>>()
        .inner()
        .clone();

    // Wire SessionRepository if not already managed
    if app_handle
        .try_state::<Arc<crate::db_utils::SessionRepository>>()
        .is_none()
    {
        let session_repo = crate::db_utils::SessionRepository::new(pool_arc.clone());
        let session_repo_arc = Arc::new(session_repo);
        app_handle.manage(session_repo_arc);
        info!("SessionRepository wired (early)");
    }

    // Wire BackgroundJobRepository if not already managed
    if app_handle
        .try_state::<Arc<crate::db_utils::BackgroundJobRepository>>()
        .is_none()
    {
        let background_job_repo = crate::db_utils::BackgroundJobRepository::new_with_app_handle(
            pool_arc.clone(),
            app_handle.clone(),
        );
        let background_job_repo_arc = Arc::new(background_job_repo);
        app_handle.manage(background_job_repo_arc);
        info!("BackgroundJobRepository wired (early)");
    }

    Ok(())
}

pub async fn run_deferred_db_tasks(
    app_handle: &tauri::AppHandle,
) -> Result<(), crate::error::AppError> {
    use std::sync::Arc;
    use tracing::{error, info, warn};

    info!("Starting deferred DB tasks: health check, recovery, migrations, and repo wiring.");
    info!("Deferred DB: starting quick check.");

    // Retrieve pool from app state
    let pool_arc = app_handle
        .state::<Arc<SqlitePool>>()
        .inner()
        .clone();

    // Health check with PRAGMA quick_check
    match check_database_health(&*pool_arc).await {
        Ok(true) => {
            info!("Deferred DB: quick check passed");
        }
        Ok(false) => {
            warn!("Deferred DB: quick check failed, attempting automatic recovery");
            let app_data_dir = app_handle.path().app_local_data_dir().map_err(|e| {
                crate::error::AppError::InitializationError(format!(
                    "Failed to get app local data dir: {}",
                    e
                ))
            })?;
            attempt_automatic_recovery(app_handle, &app_data_dir).await?;

            // Re-check after recovery
            match check_database_health(&*pool_arc).await {
                Ok(true) => {
                    info!("Deferred DB: quick check passed after recovery");
                }
                _ => {
                    error!("Deferred DB: quick check still failed after recovery attempt");
                    return Err(crate::error::AppError::DatabaseError(
                        "Database quick check failed even after recovery".to_string(),
                    ));
                }
            }
        }
        Err(e) => {
            error!("Deferred DB: quick check error: {}", e);
            warn!("Deferred DB: attempting automatic recovery due to quick check error");
            let app_data_dir = app_handle.path().app_local_data_dir().map_err(|e| {
                crate::error::AppError::InitializationError(format!(
                    "Failed to get app local data dir: {}",
                    e
                ))
            })?;
            attempt_automatic_recovery(app_handle, &app_data_dir).await?;
        }
    }

    // Check stored version vs current for idempotency
    info!("Deferred DB: checking for any pending migrations...");
    let current_version = app_handle.package_info().version.to_string();
    let migration_system = crate::db_utils::MigrationSystem::new(pool_arc.clone());

    // Check if versions match and skip migration execution if so
    match migration_system.get_stored_version().await {
        Ok(Some(stored_version)) if stored_version == current_version => {
            info!(
                "Deferred DB: versions match ({}), no migrations needed",
                current_version
            );
            // Skip migration execution - versions match, making this path idempotent
        }
        Ok(stored_version_opt) => {
            let stored_display = stored_version_opt
                .as_deref()
                .unwrap_or("<none>");
            info!(
                "Deferred DB: version mismatch detected (stored: {}, current: {}), checking migrations",
                stored_display,
                current_version
            );

            // Only run if there's a version mismatch (shouldn't happen in normal flow)
            if let Err(e) = migration_system.run_migrations(app_handle, &current_version).await {
                warn!("Deferred migration check encountered error (may be non-critical): {}", e);
                // Don't fail startup - migrations should have already run in critical phase
            }
        }
        Err(e) => {
            warn!("Failed to check stored version: {}", e);
            // Continue anyway - migrations will handle this
        }
    }

    // One-time normalization for history device_id casing (avoids checksum drift)
    match sqlx::query_scalar::<_, String>("SELECT value FROM key_value_store WHERE key = ?")
        .bind(HISTORY_DEVICE_IDS_NORMALIZED_KEY)
        .fetch_optional(&*pool_arc)
        .await
    {
        Ok(None) => {
            if let Ok(mut tx) = pool_arc.begin().await {
                let task_rows = sqlx::query(
                    "UPDATE task_description_history
                     SET device_id = lower(device_id)
                     WHERE device_id IS NOT NULL AND device_id != lower(device_id)"
                )
                .execute(&mut *tx)
                .await
                .map(|res| res.rows_affected())
                .unwrap_or(0);

                let file_rows = sqlx::query(
                    "UPDATE file_selection_history
                     SET device_id = lower(device_id)
                     WHERE device_id IS NOT NULL AND device_id != lower(device_id)"
                )
                .execute(&mut *tx)
                .await
                .map(|res| res.rows_affected())
                .unwrap_or(0);

                let _ = sqlx::query(
                    "INSERT OR REPLACE INTO key_value_store (key, value, updated_at)
                     VALUES (?, 'true', strftime('%s','now'))"
                )
                .bind(HISTORY_DEVICE_IDS_NORMALIZED_KEY)
                .execute(&mut *tx)
                .await;

                let _ = tx.commit().await;

                if task_rows > 0 || file_rows > 0 {
                    info!(
                        "Deferred DB: normalized history device_id casing (task_rows={}, file_rows={})",
                        task_rows, file_rows
                    );
                }
            } else {
                warn!("Deferred DB: failed to start transaction for history device_id normalization");
            }
        }
        Ok(Some(_)) => {}
        Err(e) => {
            warn!("Deferred DB: failed to check history normalization flag: {}", e);
        }
    }

    if let Err(e) = sqlx::query(
        "CREATE INDEX IF NOT EXISTS idx_background_jobs_status_created_at
         ON background_jobs(status, created_at)"
    )
    .execute(&*pool_arc)
    .await
    {
        warn!("Deferred DB: failed to ensure background job status index: {}", e);
    }

    // Ensure database permissions
    let app_data_root_dir = app_handle.path().app_local_data_dir().map_err(|e| {
        crate::error::AppError::InitializationError(format!(
            "Failed to get app local data dir: {}",
            e
        ))
    })?;
    if let Err(e) = crate::db_utils::ensure_db_permissions(&app_data_root_dir) {
        error!("Deferred DB: failed to ensure DB permissions: {}", e);
    }

    // Create and manage remaining repositories with presence checks
    if app_handle
        .try_state::<Arc<crate::db_utils::SessionRepository>>()
        .is_none()
    {
        let session_repo = crate::db_utils::SessionRepository::new(pool_arc.clone());
        let session_repo_arc = Arc::new(session_repo);
        app_handle.manage(session_repo_arc.clone());
        info!("Deferred DB: SessionRepository wired.");
    } else {
        info!("Deferred DB: SessionRepository skipped (already managed)");
    }

    if app_handle
        .try_state::<Arc<crate::db_utils::BackgroundJobRepository>>()
        .is_none()
    {
        let background_job_repo = crate::db_utils::BackgroundJobRepository::new_with_app_handle(
            pool_arc.clone(),
            app_handle.clone(),
        );
        let background_job_repo_arc = Arc::new(background_job_repo);
        app_handle.manage(background_job_repo_arc.clone());
        info!("Deferred DB: BackgroundJobRepository wired.");
    } else {
        info!("Deferred DB: BackgroundJobRepository skipped (already managed)");
    }

    if app_handle
        .try_state::<Arc<crate::db_utils::TerminalRepository>>()
        .is_none()
    {
        let terminal_repo = crate::db_utils::TerminalRepository::new(pool_arc.clone());
        let terminal_repo_arc = Arc::new(terminal_repo);
        app_handle.manage(terminal_repo_arc.clone());
        info!("Deferred DB: TerminalRepository wired.");
    } else {
        info!("Deferred DB: TerminalRepository skipped (already managed)");
    }

    Ok(())
}

/// Check if database is healthy
async fn check_database_health(db: &SqlitePool) -> Result<bool, AppError> {
    // Run quick_check (much faster than full integrity_check, ~3.3s improvement)
    match sqlx::query_scalar::<_, String>("PRAGMA quick_check")
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
    let db_pool = app_handle
        .state::<Arc<SqlitePool>>()
        .inner()
        .clone();
    let backup_config = crate::services::BackupConfig::default();
    let backup_service = BackupService::new(
        app_data_dir.to_path_buf(),
        db_pool.as_ref().clone(),
        backup_config,
    );

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
