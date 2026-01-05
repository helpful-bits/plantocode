use crate::AppState;
use crate::api_clients::{
    ApiClient, TranscriptionClient, billing_client::BillingClient, consent_client::ConsentClient,
    server_proxy_client::ServerProxyClient,
};
use crate::auth::TokenManager;
use crate::constants::SERVER_API_URL;
use crate::error::{AppError, AppResult};
use crate::services::{BackupConfig, BackupService, initialize_cache_service};
use log::{debug, error, info, warn};
use sqlx::SqlitePool;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex, OnceLock};
use tauri::{AppHandle, Manager};

static DEVICE_LINK_TASK: OnceLock<Mutex<Option<tauri::async_runtime::JoinHandle<()>>>> =
    OnceLock::new();
static DEVICE_LINK_RESTART_LOCK: OnceLock<Mutex<()>> = OnceLock::new();
static DEVICE_LINK_RUNNING: AtomicBool = AtomicBool::new(false);
static DEVICE_LINK_SERVER_URL: OnceLock<Mutex<Option<String>>> = OnceLock::new();

fn device_link_task() -> &'static Mutex<Option<tauri::async_runtime::JoinHandle<()>>> {
    DEVICE_LINK_TASK.get_or_init(|| Mutex::new(None))
}

fn device_link_restart_lock() -> &'static Mutex<()> {
    DEVICE_LINK_RESTART_LOCK.get_or_init(|| Mutex::new(()))
}

fn device_link_server_url() -> &'static Mutex<Option<String>> {
    DEVICE_LINK_SERVER_URL.get_or_init(|| Mutex::new(None))
}

fn lock_mutex<T>(mutex: &Mutex<T>, label: &str) -> std::sync::MutexGuard<'_, T> {
    match mutex.lock() {
        Ok(guard) => guard,
        Err(poisoned) => {
            warn!("{} lock poisoned, recovering", label);
            poisoned.into_inner()
        }
    }
}

async fn restart_device_link_client(
    app_handle: &tauri::AppHandle,
    server_url: String,
) -> crate::error::AppResult<()> {
    if let Some(existing) =
        app_handle.try_state::<std::sync::Arc<crate::services::device_link_client::DeviceLinkClient>>()
    {
        existing.shutdown().await;
    }

    crate::services::device_link_client::start_device_link_client(
        app_handle.clone(),
        server_url,
    ).await?;

    Ok(())
}

/// Resolve server URL from DB or environment when ServerProxyClient is not available.
/// Precedence: selected_server_url from DB > SERVER_URL env var > EU default
async fn resolve_server_url_from_db_or_env(pool: &Arc<sqlx::SqlitePool>) -> String {
    // 1) Try selected_server_url from DB
    let settings_repo = crate::db_utils::settings_repository::SettingsRepository::new(pool.clone());
    if let Ok(Some(url)) = settings_repo.get_value("selected_server_url").await {
        return url;
    }

    // 2) Try SERVER_URL env var
    if let Ok(env_url) = std::env::var("SERVER_URL") {
        return env_url;
    }

    // 3) Final fallback: EU region to match mobile default
    "https://api-eu.plantocode.com".to_string()
}

/// Initialize TokenManager only (deferred client initialization)
pub async fn initialize_token_manager(app_handle: &AppHandle) -> AppResult<()> {
    // Get the existing TokenManager from app state (managed early in lib.rs)
    let token_manager = app_handle.state::<Arc<TokenManager>>().inner().clone();
    info!("TokenManager instance retrieved from app state.");

    // Initialize the TokenManager (load token from persistence)
    // This MUST happen before clients that use it are created.
    match token_manager.init().await {
        Ok(_) => {
            // Check if a token was actually loaded
            if let Some(token) = token_manager.get().await {
                info!(
                    "TokenManager initialized successfully with persisted token (length: {})",
                    token.len()
                );
            } else {
                info!(
                    "TokenManager initialized successfully, but no persisted token found - user will need to authenticate"
                );
            }
        }
        Err(e) => {
            error!("TokenManager initialization failed: {}", e);
            // For auth token loading failures, we can continue as the user can re-authenticate
            warn!(
                "Continuing without persisted token - user will need to authenticate through the UI"
            );
        }
    }

    // Initialize auto-sync cache service now that TokenManager is available
    let app_handle_auto_sync = app_handle.clone();
    tokio::spawn(async move {
        use crate::services::config_cache_service::auto_sync_cache_with_server;
        info!("Starting auto-sync cache service");
        auto_sync_cache_with_server(app_handle_auto_sync).await;
    });

    // Initialize cache health monitoring now that TokenManager is available
    let app_handle_health = app_handle.clone();
    let token_manager_health = token_manager.clone();
    tokio::spawn(async move {
        use crate::services::cache_health_monitor::initialize_cache_health_monitor;
        if let Err(e) =
            initialize_cache_health_monitor(&app_handle_health, token_manager_health).await
        {
            error!("Cache health monitor initialization failed: {}", e);
        } else {
            info!("Cache health monitor initialized successfully");
        }
    });

    // Auto-start device link connection if token is available
    if token_manager.get().await.is_some() {
        let app_for_device_link = app_handle.clone();
        tokio::spawn(async move {
            if let Err(e) = initialize_device_link_connection(&app_for_device_link).await {
                tracing::warn!("Failed to initialize device link connection: {:?}", e);
            }
        });
    }

    info!("TokenManager and cache services initialized");
    Ok(())
}

/// Reinitialize API clients with a specific server URL
pub async fn reinitialize_api_clients(app_handle: &AppHandle, server_url: String) -> AppResult<()> {
    info!("Reinitializing API clients with server URL: {}", server_url);

    let app_state = app_handle.state::<AppState>();
    app_state.set_api_clients_ready(false);

    // Get TokenManager from app state
    let token_manager = app_handle.state::<Arc<TokenManager>>().inner().clone();

    // Create the API client - it will create its own HTTP client internally
    let server_proxy_client = ServerProxyClient::new(
        app_handle.clone(),
        server_url.clone(),
        token_manager.clone(), // Pass the initialized token_manager
    );

    info!("ServerProxyClient initialized with server URL and client binding");

    // Create a single Arc instance of the client
    let server_proxy_client_arc = Arc::new(server_proxy_client);

    // Cast the same Arc to use with different interfaces
    let api_client_arc: Arc<dyn ApiClient> = server_proxy_client_arc.clone();
    let transcription_client_arc: Arc<dyn TranscriptionClient> = server_proxy_client_arc.clone();

    // Initialize BillingClient
    let billing_client = BillingClient::new(
        server_url.clone(),
        token_manager.clone(),
        app_handle.clone(),
    );
    let billing_client_arc = Arc::new(billing_client);

    info!("BillingClient initialized");

    // Initialize ConsentClient
    let consent_client = ConsentClient::new(
        server_url.clone(),
        token_manager.clone(),
        app_handle.clone(),
    );
    let consent_client_arc = Arc::new(consent_client);

    info!("ConsentClient initialized");

    // Acquire write locks and populate RwLock containers
    {
        let server_proxy_lock = app_handle
            .state::<Arc<tokio::sync::RwLock<Option<Arc<ServerProxyClient>>>>>()
            .inner()
            .clone();
        let mut server_proxy_guard = server_proxy_lock.write().await;
        *server_proxy_guard = Some(server_proxy_client_arc.clone());
    }

    {
        let billing_lock = app_handle
            .state::<Arc<tokio::sync::RwLock<Option<Arc<BillingClient>>>>>()
            .inner()
            .clone();
        let mut billing_guard = billing_lock.write().await;
        *billing_guard = Some(billing_client_arc.clone());
    }

    {
        let consent_lock = app_handle
            .state::<Arc<tokio::sync::RwLock<Option<Arc<ConsentClient>>>>>()
            .inner()
            .clone();
        let mut consent_guard = consent_lock.write().await;
        *consent_guard = Some(consent_client_arc.clone());
    }

    {
        let api_client_lock = app_handle
            .state::<Arc<tokio::sync::RwLock<Option<Arc<dyn ApiClient>>>>>()
            .inner()
            .clone();
        let mut api_client_guard = api_client_lock.write().await;
        *api_client_guard = Some(api_client_arc.clone());
    }

    {
        let transcription_lock = app_handle
            .state::<Arc<tokio::sync::RwLock<Option<Arc<dyn TranscriptionClient>>>>>()
            .inner()
            .clone();
        let mut transcription_guard = transcription_lock.write().await;
        *transcription_guard = Some(transcription_client_arc.clone());
    }

    // Also manage the Arc instances directly for compatibility with existing commands
    app_handle.manage(api_client_arc);
    app_handle.manage(transcription_client_arc);
    app_handle.manage(server_proxy_client_arc.clone());
    app_handle.manage(billing_client_arc);
    app_handle.manage(consent_client_arc);

    // Note: BackgroundJobRepository will pick up the ServerProxyClient from app state
    // when create_repositories is called in db_utils/mod.rs. Since we initialize
    // API clients after the database, the repository won't have the proxy client
    // initially. This is handled by the repository checking for proxy client
    // availability when needed for final cost polling.
    info!("ServerProxyClient available in app state for BackgroundJobRepository to use");

    app_state.set_api_clients_ready(true);
    info!("API clients reinitialized and registered in app state.");

    // Auto-start DeviceLinkClient if token is available
    if token_manager.get().await.is_some() {
        let app_for_restart = app_handle.clone();
        tokio::spawn(async move {
            if let Err(e) = initialize_device_link_connection(&app_for_restart).await {
                tracing::warn!(
                    "Failed to reinitialize DeviceLinkClient after server change: {:?}",
                    e
                );
            }
        });
    }

    Ok(())
}

/// Initialize system prompts cache service with 5-minute cache TTL
/// This function sets up the on-demand cache service without initial population
/// Cache will be populated on first request
pub async fn initialize_system_prompts(app_handle: &AppHandle) -> AppResult<()> {
    info!("Setting up system prompts cache service with 5-minute TTL...");

    // Initialize the 5-minute cache service
    initialize_cache_service(app_handle).await?;

    Ok(())
}

/// Initialize the backup service with automatic scheduling
pub async fn initialize_backup_service(app_handle: &AppHandle) -> AppResult<()> {
    info!("Initializing backup service...");

    // Get app data directory
    let app_data_dir = app_handle.path().app_local_data_dir().map_err(|e| {
        AppError::InitializationError(format!("Failed to get app local data dir: {}", e))
    })?;

    // Get database pool from app state
    let db_pool = app_handle
        .state::<Arc<SqlitePool>>()
        .inner()
        .clone();

    // Load backup configuration from database or use default
    let settings_repo = app_handle.state::<Arc<crate::db_utils::SettingsRepository>>();
    let backup_config = settings_repo.get_backup_config().await.unwrap_or_else(|e| {
        warn!(
            "Failed to load backup config from database: {}, using defaults",
            e
        );
        BackupConfig::default()
    });

    // Create backup service
    let backup_service = Arc::new(BackupService::new(
        app_data_dir,
        db_pool.as_ref().clone(),
        backup_config.clone(),
    ));

    // Initialize the service (create directories, initial backup if needed)
    backup_service.initialize().await?;

    // Store backup service in app state
    app_handle.manage(backup_service.clone());

    // Start the automatic backup scheduler in the background
    if backup_config.enabled {
        let scheduler_service = backup_service.clone();
        tokio::spawn(async move {
            info!("Starting backup scheduler...");
            scheduler_service.start_scheduler().await;
        });
    }

    info!("Backup service initialized and scheduler started");
    Ok(())
}

/// Initialize the terminal manager
pub async fn initialize_terminal_manager(app_handle: &AppHandle) -> AppResult<()> {
    info!("Initializing terminal manager...");

    // Fix PATH environment on non-Windows platforms before creating terminal manager
    #[cfg(not(target_os = "windows"))]
    {
        info!("Applying PATH environment fix for macOS/Linux");
        match fix_path_env::fix() {
            Ok(_) => {
                info!("PATH environment fixed successfully");
            }
            Err(e) => {
                warn!(
                    "Failed to fix PATH environment: {}. Terminal may not find all commands.",
                    e
                );
                // Continue anyway - this is not a fatal error
            }
        }
    }

    if app_handle
        .try_state::<std::sync::Arc<crate::services::TerminalManager>>()
        .is_none()
    {
        let pool = app_handle
            .state::<Arc<sqlx::SqlitePool>>()
            .inner()
            .clone();
        let repo = Arc::new(crate::db_utils::TerminalRepository::new(pool.clone()));
        let mgr = std::sync::Arc::new(crate::services::TerminalManager::new(
            app_handle.clone(),
            repo,
        ));

        mgr.clone().start_periodic_flusher();

        // Restore any sessions from previous app runs
        match mgr.restore_sessions().await {
            Ok(restored_ids) => {
                if !restored_ids.is_empty() {
                    info!(
                        "Restored {} terminal sessions on startup",
                        restored_ids.len()
                    );
                }
            }
            Err(e) => {
                error!("Failed to restore terminal sessions: {}", e);
            }
        }

        app_handle.manage(mgr);
        info!("Terminal manager initialized successfully");
    } else {
        info!("Terminal manager already initialized");
    }

    Ok(())
}

/// Initialize the connection manager with TLS support for mobile connectivity
/// NOTE: Currently disabled due to missing TLS module implementation
pub async fn initialize_connection_manager(_app_handle: &AppHandle) -> AppResult<()> {
    info!("Connection manager initialization skipped - TLS module not implemented");
    Ok(())
}

pub async fn initialize_device_link_connection(
    app_handle: &tauri::AppHandle,
) -> crate::error::AppResult<()> {
    use crate::auth::token_manager::TokenManager;
    use crate::services::device_link_client::DeviceLinkClient;
    use crate::api_clients::server_proxy_client::ServerProxyClient;
    use std::sync::Arc;

    tracing::info!("Starting DeviceLinkClient connection...");

    // Get token manager and check if we have a valid token
    let token_manager = app_handle.state::<Arc<TokenManager>>();
    if token_manager.get().await.is_none() {
        tracing::info!("No authentication token available, skipping DeviceLinkClient");
        return Ok(());
    }

    // Get settings repository to check device settings
    let pool = match app_handle.try_state::<Arc<sqlx::SqlitePool>>() {
        Some(p) => p.inner().clone(),
        None => {
            tracing::info!("SqlitePool not yet available; deferring DeviceLinkClient start");
            return Ok(());
        }
    };
    let settings_repo =
        crate::db_utils::settings_repository::SettingsRepository::new(pool.clone());
    let device_settings = settings_repo.get_device_settings().await?;

    if !device_settings.allow_remote_access {
        tracing::info!(
            "Device not discoverable or remote access disabled, skipping DeviceLinkClient"
        );
        return Ok(());
    }

    // Server URL precedence for DeviceLinkClient:
    // 1. ServerProxyClient.base_url() if initialized
    // 2. selected_server_url from app DB
    // 3. SERVER_URL environment variable
    // 4. Hardcoded EU default (to match mobile)
    let server_url = if let Some(proxy_client_lock) = app_handle
        .try_state::<Arc<tokio::sync::RwLock<Option<Arc<ServerProxyClient>>>>>()
    {
        let proxy_guard = proxy_client_lock.read().await;
        if let Some(proxy_client) = proxy_guard.as_ref() {
            proxy_client.base_url().to_string()
        } else {
            resolve_server_url_from_db_or_env(&pool).await
        }
    } else {
        resolve_server_url_from_db_or_env(&pool).await
    };

    tracing::info!("Using server URL for DeviceLinkClient: {}", server_url);

    if let Some(existing) = app_handle.try_state::<Arc<DeviceLinkClient>>() {
        existing.set_server_url(server_url.clone());
    }

    let mut should_shutdown = false;
    {
        let _restart_guard = lock_mutex(device_link_restart_lock(), "device link restart");
        let mut server_url_guard = lock_mutex(device_link_server_url(), "device link server url");
        let url_changed = server_url_guard.as_deref() != Some(&server_url);
        *server_url_guard = Some(server_url.clone());

        let running = DEVICE_LINK_RUNNING.load(Ordering::SeqCst);
        if running && !url_changed {
            tracing::info!("DeviceLinkClient already running, skipping start");
            return Ok(());
        }

        if running && url_changed {
            tracing::info!("DeviceLinkClient server URL changed, restarting");
            should_shutdown = true;
        }

        DEVICE_LINK_RUNNING.store(true, Ordering::SeqCst);
    }

    if should_shutdown {
        if let Some(existing) = app_handle.try_state::<Arc<DeviceLinkClient>>() {
            existing.shutdown().await;
        }
    }

    let mut task_guard = lock_mutex(device_link_task(), "device link task");
    if let Some(handle) = task_guard.take() {
        handle.abort();
    }

    let app_handle_clone = app_handle.clone();
    let server_url_clone = server_url.clone();
    let task = tauri::async_runtime::spawn(async move {
        if let Err(e) = restart_device_link_client(&app_handle_clone, server_url_clone).await {
            tracing::error!("DeviceLinkClient error: {:?}", e);
        }
        DEVICE_LINK_RUNNING.store(false, Ordering::SeqCst);
        let mut task_guard = lock_mutex(device_link_task(), "device link task");
        *task_guard = None;
    });

    *task_guard = Some(task);

    tracing::info!("DeviceLinkClient started successfully");

    Ok(())
}

pub async fn initialize_session_cache(app_handle: &tauri::AppHandle) -> crate::error::AppResult<()> {
    let cache = app_handle.state::<std::sync::Arc<crate::services::SessionCache>>().inner().clone();
    cache.initialize_from_db(app_handle).await?;

    // Spawn non-blocking periodic flush loop
    let app = app_handle.clone();
    tauri::async_runtime::spawn(async move {
        let mut ticker = tokio::time::interval(std::time::Duration::from_millis(680));
        loop {
            ticker.tick().await;
            if let Err(e) = cache.flush_dirty_to_db(&app).await {
                tracing::warn!("SessionCache flush error: {e}");
            }
        }
    });

    tracing::info!("SessionCache initialized with 680ms periodic flush");
    Ok(())
}

pub async fn initialize_history_state_sequencer(app_handle: &tauri::AppHandle) -> crate::error::AppResult<()> {
    use crate::services::history_state_sequencer::HistoryStateSequencer;
    use crate::db_utils::session_repository::SessionRepository;

    let session_repo = app_handle.state::<Arc<SessionRepository>>().inner().clone();
    let sequencer = Arc::new(HistoryStateSequencer::new(
        app_handle.clone(),
        session_repo,
    ));
    app_handle.manage(sequencer);

    tracing::info!("HistoryStateSequencer initialized");
    Ok(())
}
