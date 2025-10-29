use crate::error::AppError;
use log::{error, info, warn};
use tauri::{AppHandle, Manager};

pub mod config;
pub mod database;
pub mod embedded_schema;
pub mod file_management;
pub mod job_system;
pub mod services;

// Re-export important functions for easy access
pub use services::{
    initialize_system_prompts, initialize_terminal_manager, reinitialize_api_clients,
};

/// Run deferred initialization steps for the application
async fn run_deferred_initialization(app_handle: &AppHandle) -> Result<(), AppError> {
    info!("Deferred initialization started");

    // Run deferred DB tasks first
    if let Err(e) = database::run_deferred_db_tasks(app_handle).await {
        error!("Deferred DB tasks failed: {}", e);
        return Err(e);
    }

    // Initialize system prompts (with presence check) - requires API client so may fail on first run
    if app_handle.try_state::<std::sync::Arc<crate::services::system_prompt_cache_service::SystemPromptCacheService>>().is_none() {
        if let Err(e) = services::initialize_system_prompts(app_handle).await {
            warn!("System prompts initialization failed (non-critical): {}", e);
            // Don't fail deferred initialization for this - user needs to authenticate first
        } else {
            info!("System prompts initialized (deferred phase)");
        }
    } else {
        info!("System prompts skipped (already initialized)");
    }

    // Initialize file lock manager (with presence check)
    if app_handle
        .try_state::<std::sync::Arc<crate::utils::FileLockManager>>()
        .is_none()
    {
        if let Err(e) = file_management::initialize_file_lock_manager(app_handle).await {
            error!("File lock manager initialization failed: {}", e);
            return Err(e);
        }
        info!("File lock manager initialized (deferred phase)");
    } else {
        info!("File lock manager skipped (already initialized)");
    }

    // Start job system (idempotent call - will no-op if already started)
    if let Err(e) = job_system::start_job_system(app_handle).await {
        error!("Job system start failed: {}", e);
        return Err(e);
    }

    // Initialize configuration sync manager
    if let Err(e) = config::initialize_config_sync(app_handle).await {
        warn!(
            "Configuration sync initialization failed (non-critical): {}",
            e
        );
        // Don't fail startup for config sync issues
    }

    // Schedule backup service with 12-second delay to avoid contention
    info!("Scheduling backup service initialization with delay...");
    let app_handle_backup = app_handle.clone();
    tauri::async_runtime::spawn(async move {
        // Wait 12 seconds to avoid database contention
        tokio::time::sleep(tokio::time::Duration::from_secs(12)).await;

        info!("Initializing backup service (delayed)");
        if let Err(e) = services::initialize_backup_service(&app_handle_backup).await {
            error!("Backup service initialization failed: {}", e);
        } else {
            info!("Backup service initialized successfully");
        }
    });

    // Terminal manager is now initialized in critical phase (skipped here)

    // Sync early in-memory values to DB if not already present
    // This should happen after deferred DB tasks complete and repos are available
    if let Some(settings_repo) =
        app_handle.try_state::<std::sync::Arc<crate::db_utils::SettingsRepository>>()
    {
        let app_state = app_handle.state::<crate::AppState>();

        if let Some(url) = app_state.get_server_url() {
            if let Ok(None) = settings_repo.get_value("selected_server_url").await {
                if let Err(e) = settings_repo.set_value("selected_server_url", &url).await {
                    warn!("Failed to sync server URL to DB: {}", e);
                }
            }
        }

        if app_state.get_onboarding_completed() == Some(true) {
            if let Ok(None) = settings_repo.get_value("onboarding_completed").await {
                if let Err(e) = settings_repo
                    .set_value("onboarding_completed", "true")
                    .await
                {
                    warn!("Failed to sync onboarding status to DB: {}", e);
                }
            }
        }
    }

    info!("Deferred initialization completed successfully");
    Ok(())
}

/// Run critical initialization steps that must complete before UI is interactive
/// This includes database and job queue setup to prevent race conditions on first run
pub async fn run_critical_initialization(app_handle: &AppHandle) -> Result<(), AppError> {
    info!("Starting critical initialization phase...");

    // Initialize database (light phase) - must complete before any commands execute
    if let Err(e) = database::initialize_database_light(app_handle).await {
        error!("Database light initialization failed: {}", e);
        return Err(e);
    }
    info!("Database light initialization completed");

    // Run migrations immediately after DB initialization, before repository wiring
    info!("Running version-based migrations...");
    let current_version = app_handle.package_info().version.to_string();
    let pool_arc = app_handle
        .state::<std::sync::Arc<sqlx::SqlitePool>>()
        .inner()
        .clone();
    let migration_system = crate::db_utils::MigrationSystem::new(pool_arc);
    if let Err(e) = migration_system.run_migrations(app_handle, &current_version).await {
        error!("Critical phase migration failed: {}", e);
        return Err(e);
    }
    info!("Migrations completed in critical phase");

    // Initialize job system light (queue and registry only) - must be ready before dispatch
    if let Err(e) = job_system::initialize_job_system_light(app_handle).await {
        error!("Job system light initialization failed: {}", e);
        return Err(e); // This is now critical - fail if it doesn't work
    }
    info!("Job system light initialization completed");

    // Wire core repositories early for first-run availability
    if let Err(e) = database::wire_core_job_repositories(app_handle).await {
        error!("Core repositories wiring failed: {}", e);
        return Err(e);
    }
    info!("Core repositories wired successfully");

    // Initialize SessionCache as soon as repositories are ready
    crate::app_setup::services::initialize_session_cache(app_handle).await?;
    info!("SessionCache initialized and flush loop started");

    // Initialize HistoryStateSequencer right after SessionCache
    crate::app_setup::services::initialize_history_state_sequencer(app_handle).await?;
    info!("HistoryStateSequencer initialized");

    // System prompts initialization is deferred (requires API client)

    // Initialize file lock manager (moved to critical path)
    if app_handle
        .try_state::<std::sync::Arc<crate::utils::FileLockManager>>()
        .is_none()
    {
        if let Err(e) = file_management::initialize_file_lock_manager(app_handle).await {
            error!("File lock manager initialization failed: {}", e);
            return Err(e);
        }
        info!("File lock manager initialized (critical phase)");
    } else {
        info!("File lock manager skipped (already initialized)");
    }

    // Start job system (idempotent - moved to critical path)
    if let Err(e) = job_system::start_job_system(app_handle).await {
        error!("Job system start failed: {}", e);
        return Err(e);
    }
    info!("Job system started (critical phase)");

    // Initialize terminal manager (moved to critical path to avoid state access panic)
    if let Err(e) = services::initialize_terminal_manager(app_handle).await {
        warn!(
            "Terminal manager initialization failed (non-critical): {}",
            e
        );
        // Don't fail startup for this
    } else {
        info!("Terminal manager initialized successfully (critical phase)");
    }

    info!("Critical initialization phase completed successfully");
    Ok(())
}

/// Run background initialization steps that can happen after UI is interactive
pub async fn run_background_initialization(app_handle: AppHandle) -> Result<(), AppError> {
    info!("Starting background initialization phase...");

    // Run deferred initialization tasks first to ensure job system readiness
    if let Err(e) = run_deferred_initialization(&app_handle).await {
        error!("Deferred initialization failed: {}", e);
        // Log but continue - these are background tasks
    }

    // Initialize TokenManager (never block on this)
    if let Err(e) = services::initialize_token_manager(&app_handle).await {
        warn!("TokenManager initialization failed, continuing: {}", e);
        // Continue instead of returning early
    } else {
        // Check if there's a selected server URL from settings and reinitialize API clients if found
        let settings_repo =
            app_handle.state::<std::sync::Arc<crate::db_utils::SettingsRepository>>();
        if let Ok(Some(server_url)) = settings_repo.get_value("selected_server_url").await {
            info!(
                "Found selected server URL: {}, setting in AppState and reinitializing API clients",
                server_url
            );

            // Update AppState with the server URL
            let app_state = app_handle.state::<crate::AppState>();
            app_state.set_server_url(server_url.clone());

            if let Err(e) = services::reinitialize_api_clients(&app_handle, server_url).await {
                warn!(
                    "Failed to reinitialize API clients with selected server URL: {}",
                    e
                );
                // Don't fail startup for this, user can select server again
            }
        } else {
            info!(
                "No selected server URL found, API clients will be initialized when user selects a server region"
            );
        }
    }

    // Initialize device link connection after API clients are ready
    if let Err(e) = crate::app_setup::services::initialize_device_link_connection(&app_handle).await
    {
        tracing::warn!(error = ?e, "failed_to_start_device_link_client");
    }

    info!("Background initialization completed");
    Ok(())
}
