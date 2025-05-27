use tauri::{AppHandle, Manager};
use crate::error::{AppError, AppResult};
use crate::utils::hash_utils;
use log::{info, debug, warn, error};
use std::sync::Arc;
use dirs;
use uuid::Uuid;
use reqwest::header::{HeaderMap, HeaderValue};
use crate::constants::{SERVER_API_URL, HEADER_CLIENT_ID};
use crate::api_clients::{ApiClient, TranscriptionClient, server_proxy_client::ServerProxyClient};
use crate::auth::TokenManager;

pub async fn initialize_api_clients(app_handle: &AppHandle) -> AppResult<()> {
   
    // Initialize TokenManager with persistent storage support
    let token_manager = Arc::new(TokenManager::new());
    info!("TokenManager instance created.");

    // Initialize the TokenManager (load token from persistence)
    // This MUST happen before clients that use it are created.
    match token_manager.init().await {
        Ok(_) => {
            info!("TokenManager initialized and token loaded from persistence.");
        },
        Err(e) => {
            error!("TokenManager initialization with keyring/storage failed: {}", e);
            // For critical startup issues, we should fail fast rather than continue in a broken state
            // However, for auth token loading, we can continue as the user can re-authenticate
            warn!("Continuing without persisted token - user will need to re-authenticate");
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
    
    // Manage state with Tauri
    app_handle.manage(api_client_arc);
    app_handle.manage(transcription_client_arc);
    app_handle.manage(server_proxy_client_arc);
    
    info!("API clients initialized and registered in app state.");
    
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
    
    // Create a unique but stable identifier based on the home path and a UUID
    // This provides stability while still being unique per device
    let machine_uuid = Uuid::new_v4().to_string();
    let combined_string = format!("{}:{}", home_dir, machine_uuid);
    
    // Hash to create a fixed-length identifier that doesn't expose the path
    // Temporarily use hash_string instead of sha256_hash
    let client_id = hash_utils::hash_string(&combined_string);
    
    Ok(client_id)
}