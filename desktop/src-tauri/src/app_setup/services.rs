use tauri::{AppHandle, Manager};
use crate::error::{AppError, AppResult};
use crate::utils::hash_utils;
use log::{info, debug, warn, error};
use std::sync::Arc;
use dirs;
use uuid::Uuid;
use reqwest::header::{HeaderMap, HeaderValue};
use crate::constants::{SERVER_API_URL, HEADER_CLIENT_ID};
use crate::api_clients::{ApiClient, TranscriptionClient, server_proxy_client::ServerProxyClient, billing_client::BillingClient};
use crate::auth::TokenManager;
use crate::services::{BackupService, BackupConfig, initialize_cache_service};
use sqlx::SqlitePool;

pub async fn initialize_api_clients(app_handle: &AppHandle) -> AppResult<()> {
   
    // Initialize TokenManager with persistent storage support
    let token_manager = Arc::new(TokenManager::new());
    info!("TokenManager instance created.");

    // Initialize the TokenManager (load token from persistence)
    // This MUST happen before clients that use it are created.
    match token_manager.init().await {
        Ok(_) => {
            // Check if a token was actually loaded
            if let Some(token) = token_manager.get().await {
                info!("TokenManager initialized successfully with persisted token (length: {})", token.len());
            } else {
                info!("TokenManager initialized successfully, but no persisted token found - user will need to authenticate");
            }
        },
        Err(e) => {
            error!("TokenManager initialization failed: {}", e);
            // For auth token loading failures, we can continue as the user can re-authenticate
            warn!("Continuing without persisted token - user will need to authenticate through the UI");
        }
    }

    // Manage TokenManager early so other parts can access it if needed,
    // even if full client setup below fails.
    app_handle.manage(token_manager.clone());
    
    // Generate a stable client identifier for token binding
    let client_id = generate_stable_client_id()?;
    debug!("Generated stable client ID for token binding");
    
    // Create default headers for all requests
    let mut default_headers = HeaderMap::new();
    default_headers.insert(
        HEADER_CLIENT_ID, 
        HeaderValue::from_str(&client_id).map_err(|e| {
            AppError::ConfigError(format!("Invalid client ID for header: {}", e))
        })?
    );
    
    // Initialize Server Proxy API client with client ID binding
    // Use MAIN_SERVER_BASE_URL environment variable for consistency
    let server_url = std::env::var("MAIN_SERVER_BASE_URL")
        .or_else(|_| std::env::var("SERVER_URL"))
        .unwrap_or_else(|_| SERVER_API_URL.to_string());
    
    // Configure reqwest client with default headers
    let http_client = reqwest::Client::builder()
        .default_headers(default_headers)
        .build()
        .map_err(|e| AppError::ConfigError(format!("Failed to build HTTP client: {}", e)))?;
    
    // Create the API client with custom HTTP client 
    let server_proxy_client = ServerProxyClient::new_with_client(
        app_handle.clone(), 
        server_url, 
        token_manager.clone(), // Pass the initialized token_manager
        http_client
    );
    
    info!("ServerProxyClient initialized with server URL and client binding");
    
    // Store in app state
    // Create a single Arc instance of the client
    let server_proxy_client_arc = Arc::new(server_proxy_client);
    
    // Cast the same Arc to use with different interfaces
    let api_client_arc: Arc<dyn ApiClient> = server_proxy_client_arc.clone();
    let transcription_client_arc: Arc<dyn TranscriptionClient> = server_proxy_client_arc.clone();
    
    // Initialize BillingClient
    let billing_client = BillingClient::new(token_manager.clone());
    let billing_client_arc = Arc::new(billing_client);
    
    info!("BillingClient initialized");
    
    // Manage state with Tauri
    app_handle.manage(api_client_arc);
    app_handle.manage(transcription_client_arc);
    app_handle.manage(server_proxy_client_arc);
    app_handle.manage(billing_client_arc);
    
    
    info!("API clients initialized and registered in app state.");
    
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
    let app_data_dir = app_handle.path().app_local_data_dir()
        .map_err(|e| AppError::InitializationError(format!("Failed to get app local data dir: {}", e)))?;
    
    // Get database pool from app state
    let db_pool = app_handle.state::<SqlitePool>().inner().clone();
    
    // Load backup configuration from database or use default
    let settings_repo = app_handle.state::<Arc<crate::db_utils::SettingsRepository>>();
    let backup_config = settings_repo.get_backup_config().await
        .unwrap_or_else(|e| {
            warn!("Failed to load backup config from database: {}, using defaults", e);
            BackupConfig::default()
        });
    
    // Create backup service
    let backup_service = Arc::new(BackupService::new(app_data_dir, db_pool, backup_config.clone()));
    
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

/// Generate a stable client identifier based on machine-specific data
/// This creates a deterministic but anonymous identifier that remains
/// consistent across app restarts on the same device
fn generate_stable_client_id() -> Result<String, AppError> {
    // Attempt to get home directory as a stable reference point
    let home_dir = dirs::home_dir()
        .ok_or_else(|| AppError::ConfigError("Failed to determine home directory".to_string()))?
        .to_string_lossy()
        .to_string();
    
    // Get system hostname for additional uniqueness
    let hostname = std::env::var("HOSTNAME")
        .or_else(|_| std::env::var("COMPUTERNAME"))
        .unwrap_or_else(|_| "unknown".to_string());
    
    // Create a stable identifier based on deterministic machine characteristics
    // This provides stability across restarts while still being unique per device
    let combined_string = format!("vibe-manager:{}:{}", home_dir, hostname);
    
    // Hash to create a fixed-length identifier that doesn't expose the path
    let client_id = hash_utils::hash_string(&combined_string);
    
    debug!("Generated stable client ID for token binding (hash of machine characteristics)");
    
    Ok(client_id)
}