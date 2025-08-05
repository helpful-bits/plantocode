use crate::api_clients::{
    ApiClient, TranscriptionClient, billing_client::BillingClient,
    server_proxy_client::ServerProxyClient,
};
use crate::auth::TokenManager;
use crate::constants::SERVER_API_URL;
use crate::error::{AppError, AppResult};
use crate::services::{BackupConfig, BackupService, initialize_cache_service};
use log::{debug, error, info, warn};
use sqlx::SqlitePool;
use std::sync::Arc;
use tauri::{AppHandle, Manager};

/// Initialize TokenManager only (deferred client initialization)
pub async fn initialize_token_manager(app_handle: &AppHandle) -> AppResult<()> {
    // Initialize TokenManager with persistent storage support
    let token_manager = Arc::new(TokenManager::new());
    info!("TokenManager instance created.");

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

    // Manage TokenManager early so other parts can access it if needed
    app_handle.manage(token_manager.clone());

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

    info!("TokenManager and cache services initialized");
    Ok(())
}

/// Reinitialize API clients with a specific server URL
pub async fn reinitialize_api_clients(app_handle: &AppHandle, server_url: String) -> AppResult<()> {
    info!("Reinitializing API clients with server URL: {}", server_url);

    // Get TokenManager from app state
    let token_manager = app_handle.state::<Arc<TokenManager>>()
        .inner()
        .clone();

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
    let billing_client = BillingClient::new(server_url.clone(), token_manager.clone());
    let billing_client_arc = Arc::new(billing_client);

    info!("BillingClient initialized");

    // Acquire write locks and populate RwLock containers
    {
        let server_proxy_lock = app_handle.state::<Arc<tokio::sync::RwLock<Option<Arc<ServerProxyClient>>>>>()
            .inner()
            .clone();
        let mut server_proxy_guard = server_proxy_lock.write().await;
        *server_proxy_guard = Some(server_proxy_client_arc.clone());
    }
    
    {
        let billing_lock = app_handle.state::<Arc<tokio::sync::RwLock<Option<Arc<BillingClient>>>>>()
            .inner()
            .clone();
        let mut billing_guard = billing_lock.write().await;
        *billing_guard = Some(billing_client_arc.clone());
    }
    
    {
        let api_client_lock = app_handle.state::<Arc<tokio::sync::RwLock<Option<Arc<dyn ApiClient>>>>>()
            .inner()
            .clone();
        let mut api_client_guard = api_client_lock.write().await;
        *api_client_guard = Some(api_client_arc.clone());
    }
    
    {
        let transcription_lock = app_handle.state::<Arc<tokio::sync::RwLock<Option<Arc<dyn TranscriptionClient>>>>>()
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

    // Note: BackgroundJobRepository will pick up the ServerProxyClient from app state
    // when create_repositories is called in db_utils/mod.rs. Since we initialize
    // API clients after the database, the repository won't have the proxy client
    // initially. This is handled by the repository checking for proxy client
    // availability when needed for final cost polling.
    info!("ServerProxyClient available in app state for BackgroundJobRepository to use");

    info!("API clients reinitialized and registered in app state.");
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
    let db_pool = app_handle.state::<SqlitePool>().inner().clone();

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
        db_pool,
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
