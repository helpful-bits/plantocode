use tauri::{AppHandle, Manager};
use crate::error::AppError;
use crate::utils::hash_utils;
use log::{info, debug, warn};
use std::sync::Arc;
use dirs;
use uuid::Uuid;
use reqwest::header::{HeaderMap, HeaderValue};
use crate::constants::{SERVER_API_URL, HEADER_CLIENT_ID};
use crate::api_clients::{ApiClient, TranscriptionClient, server_proxy_client::ServerProxyClient};
use crate::auth::TokenManager;

pub async fn initialize_api_clients(app_handle: &AppHandle) -> Result<(), AppError> {
   
    // Initialize TokenManager with persistent storage support
    let token_manager = Arc::new(TokenManager::new());
    info!("TokenManager initialized");
    
    // Note: token_manager.init will be called after plugin initialization in main.rs
    
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
    let server_url = std::env::var("SERVER_URL").unwrap_or_else(|_| SERVER_API_URL.to_string());
    
    // Configure reqwest client with default headers
    let http_client = reqwest::Client::builder()
        .default_headers(default_headers)
        .build()
        .map_err(|e| AppError::ConfigError(format!("Failed to build HTTP client: {}", e)))?;
    
    // Create the API client with custom HTTP client 
    let server_proxy_client = ServerProxyClient::new_with_client(
        app_handle.clone(), 
        server_url, 
        token_manager.clone(),
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
    app_handle.manage(token_manager.clone());
    
    info!("API client and TokenManager registered in app state");
    
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