use std::sync::Arc;
use log::{info, error};
use tauri::{AppHandle, Manager};

use crate::constants::SERVER_API_URL;
use crate::error::{AppError, AppResult};
use crate::api_clients::client_trait::{ApiClient, TranscriptionClient};
use crate::api_clients::server_proxy_client::ServerProxyClient;

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
        
        // Create a new ServerProxyClient
        Ok(ServerProxyClient::new(app_handle, server_url))
    }
    
    /// Create an LLM client for the application
    pub fn create_llm_client(&self, app_handle: AppHandle) -> AppResult<Arc<dyn ApiClient>> {
        // Create a server proxy client that will route all requests to OpenRouter through the server
        info!("Creating ServerProxyClient for LLM operations through server proxy");
        let server_url = SERVER_API_URL.to_string();
        
        // Create a ServerProxyClient
        let client = ServerProxyClient::new(app_handle, server_url);
        
        // Return the client as an ApiClient trait object
        Ok(Arc::new(client) as Arc<dyn ApiClient>)
    }
}

/// Get the LLM client from Tauri's managed state
///
/// This should be used in processors and services to get the application-wide
/// shared client instance.
pub fn get_llm_client(app_handle: &AppHandle) -> AppResult<Arc<dyn ApiClient>> {
    let client_state = app_handle.state::<Arc<dyn ApiClient>>();
    Ok(client_state.inner().clone())
}

/// Get the server proxy client from Tauri's managed state
/// 
/// This should be used if you specifically need a ServerProxyClient instance
pub fn get_server_proxy_client(app_handle: &AppHandle) -> AppResult<Arc<ServerProxyClient>> {
    let client_state = app_handle.state::<Arc<ServerProxyClient>>();
    Ok(client_state.inner().clone())
}

/// Get the transcription client from Tauri's managed state
pub fn get_transcription_client(app_handle: &AppHandle) -> AppResult<Arc<dyn TranscriptionClient>> {
    let client_state = app_handle.state::<Arc<dyn TranscriptionClient>>();
    Ok(client_state.inner().clone())
}