use tauri::{AppHandle, Manager};
use crate::error::AppError;
use log::{info, warn};
use std::sync::Arc;
use crate::constants::SERVER_API_URL;
use crate::api_clients::{ApiClient, TranscriptionClient, server_proxy_client::ServerProxyClient};
use crate::auth::TokenManager;

pub async fn initialize_api_clients(app_handle: &AppHandle) -> Result<(), AppError> {
    // Verify that Stronghold access works
    match app_handle.try_state::<Arc<tauri_plugin_stronghold::stronghold::Stronghold>>() {
        Some(_) => {
            info!("Stronghold state found - will be used for secure token storage");
        },
        None => {
            warn!("Stronghold state not available - TokenManager will operate in memory-only mode");
        }
    };
    
    // Initialize TokenManager with app_handle for Stronghold access
    let token_manager = Arc::new(TokenManager::new(app_handle.clone()));
    info!("TokenManager initialized");
    
    // Initialize Server Proxy API client
    let server_url = std::env::var("SERVER_URL").unwrap_or_else(|_| SERVER_API_URL.to_string());
    let server_proxy_client = ServerProxyClient::new(app_handle.clone(), server_url, token_manager.clone());
    
    info!("ServerProxyClient initialized with server URL: {}", server_proxy_client.server_url());
    
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