use tauri::{AppHandle, Manager};
use crate::error::AppError;
use log::{info, error};
use std::sync::Arc;
use sqlx::{SqlitePool, migrate::MigrateDatabase, sqlite::SqlitePoolOptions, Executor};
use std::fs;
use crate::db_utils::{create_repositories, SessionRepository, BackgroundJobRepository, SettingsRepository};
use crate::{SESSION_REPO, BACKGROUND_JOB_REPO, SETTINGS_REPO};

pub async fn initialize_database(app_handle: &AppHandle) -> Result<(), AppError> {
    // Initialize the SQLite database connection pool
    let app_data_dir = app_handle.path().app_local_data_dir()
        .map_err(|e| AppError::InitializationError(format!("Failed to get app local data dir: {}", e)))?;
    
    // Ensure app data directory exists
    if !app_data_dir.exists() {
        fs::create_dir_all(&app_data_dir)
            .map_err(|e| AppError::InitializationError(format!("Failed to create app data directory: {}", e)))?;
    }
    
    let db_path = app_data_dir.join("appdata.db");
    let db_url = format!("sqlite:{}", db_path.display());
    
    // Remember if the database file existed before we connect
    let db_exists_before_connect = db_path.exists();
    
    // Create database if it doesn't exist
    if !db_exists_before_connect {
        info!("Database file doesn't exist. Creating new database at: {}", db_path.display());
        sqlx::Sqlite::create_database(&db_url).await
            .map_err(|e| AppError::DatabaseError(format!("Failed to create database: {}", e)))?;
    }
    
    // Configure and connect to SQLite with proper settings
    info!("Connecting to database at: {}", db_path.display());
    let db = SqlitePoolOptions::new()
        .max_connections(10)
        .connect(&db_url).await
        .map_err(|e| AppError::DatabaseError(format!("Failed to connect to database: {}", e)))?;
    
    // Check if we need to run migrations (just created the database)
    if !db_exists_before_connect {
        info!("Running database migrations...");
        // Get migration file path relative to the executable
        let migration_path = app_handle.path().resolve("migrations/consolidated_schema.sql", tauri::path::BaseDirectory::Resource)
            .map_err(|e| AppError::InitializationError(format!("Failed to resolve migration path: {}", e)))?;
        
        // If not found in resource path, try alternate locations
        let migration_sql = if migration_path.exists() {
            info!("Using migration file from resource path: {}", migration_path.display());
            std::fs::read_to_string(&migration_path)
                .map_err(|e| AppError::DatabaseError(format!("Failed to read migration file: {}", e)))?           
        } else {
            // Try to find it in the current directory or use the embedded version
            let local_path = std::path::Path::new("migrations/consolidated_schema.sql");
            if local_path.exists() {
                info!("Using migration file from local path: {}", local_path.display());
                std::fs::read_to_string(local_path)
                    .map_err(|e| AppError::DatabaseError(format!("Failed to read migration file: {}", e)))?                
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
    }

    // Manage the pool as state
    app_handle.manage(db.clone());
    let pool_arc = Arc::new(db);
    info!("Database connection established");

    // Ensure database permissions
    let app_data_root_dir = app_handle.path().app_local_data_dir()
        .map_err(|e| AppError::InitializationError(format!("Failed to get app local data dir: {}", e)))?;
    if let Err(e) = crate::db_utils::ensure_db_permissions(&app_data_root_dir) {
        error!("Failed to ensure DB permissions: {}", e);
    }
    
    // Create repository instances
    let (session_repo, background_job_repo, settings_repo) = create_repositories(pool_arc)
        .map_err(|e| AppError::InitializationError(format!("Failed to create repositories: {}", e)))?;
    
    // Wrap repositories in Arc
    let session_repo_arc = Arc::new(session_repo);
    let background_job_repo_arc = Arc::new(background_job_repo);
    let settings_repo_arc = Arc::new(settings_repo);
    
    // Manage state with Tauri
    app_handle.manage(session_repo_arc.clone());
    app_handle.manage(background_job_repo_arc.clone());
    app_handle.manage(settings_repo_arc.clone());
    
    // Store references in global statics
    SESSION_REPO.set(session_repo_arc)
        .expect("Failed to set SESSION_REPO");
    BACKGROUND_JOB_REPO.set(background_job_repo_arc)
        .expect("Failed to set BACKGROUND_JOB_REPO");
    SETTINGS_REPO.set(settings_repo_arc)
        .expect("Failed to set SETTINGS_REPO");
    
    info!("Repository instances created, managed by Tauri, and stored globally");
    
    Ok(())
}
