use std::sync::Arc;
use log::{info, error};
use tauri::{AppHandle, Manager};

use crate::constants::SERVER_API_URL;
use crate::error::{AppError, AppResult};
use crate::api_clients::client_trait::{ApiClient, TranscriptionClient};
use crate::api_clients::server_proxy_client::ServerProxyClient;
use crate::auth::token_manager::TokenManager;

/// Client factory for creating and managing API clients
#[derive(Default)]
pub struct ClientFactory {}

impl ClientFactory {
    /// Create a new client factory
    pub fn new() -> Self {
        Self {}
    }
    
    /// Get a server proxy client instance
    pub fn get_server_proxy_client(&self, app_handle: AppHandle) -> AppResult<ServerProxyClient> {
        info!("Creating ServerProxyClient for server proxy operations");
        let server_url = SERVER_API_URL.to_string();
        
        // Get the token manager from the app state
        let token_manager = app_handle.state::<Arc<TokenManager>>().inner().clone();
        
        // Create a new ServerProxyClient with the token manager
        Ok(ServerProxyClient::new(app_handle, server_url, token_manager))
    }
    
    /// Create an LLM client for the application
    pub fn create_llm_client(&self, app_handle: AppHandle) -> AppResult<Arc<dyn ApiClient>> {
        // Create a server proxy client that will route all requests to OpenRouter through the server
        info!("Creating ServerProxyClient for LLM operations through server proxy");
        let server_url = SERVER_API_URL.to_string();
        
        // Get the token manager from the app state
        let token_manager = app_handle.state::<Arc<TokenManager>>().inner().clone();
        
        // Create a ServerProxyClient with the token manager
        let client = ServerProxyClient::new(app_handle, server_url, token_manager);
        
        // Return the client as an ApiClient trait object
        Ok(Arc::new(client) as Arc<dyn ApiClient>)
    }
}

/// Get the API client from Tauri's managed state
///
/// This should be used in processors and services to get the application-wide
/// shared client instance.
pub fn get_api_client(app_handle: &AppHandle) -> AppResult<Arc<dyn ApiClient>> {
    app_handle.try_state::<Arc<dyn ApiClient>>()
        .ok_or_else(|| AppError::InternalError("ApiClient not managed in application state".to_string()))
        .map(|s| s.inner().clone())
}

/// Get the server proxy client from Tauri's managed state
/// 
/// This should be used if you specifically need a ServerProxyClient instance
pub fn get_server_proxy_client(app_handle: &AppHandle) -> AppResult<Arc<ServerProxyClient>> {
    app_handle.try_state::<Arc<ServerProxyClient>>()
        .ok_or_else(|| AppError::InternalError("ServerProxyClient not managed in application state".to_string()))
        .map(|s| s.inner().clone())
}

/// Get the transcription client from Tauri's managed state
pub fn get_transcription_client(app_handle: &AppHandle) -> AppResult<Arc<dyn TranscriptionClient>> {
    app_handle.try_state::<Arc<dyn TranscriptionClient>>()
        .ok_or_else(|| AppError::InternalError("TranscriptionClient not managed in application state".to_string()))
        .map(|s| s.inner().clone())
}