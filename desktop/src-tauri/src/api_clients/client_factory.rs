use std::sync::Arc;
use log::{info, error};
use tauri::{AppHandle, Manager};

use crate::error::{AppError, AppResult};
use crate::api_clients::client_trait::{ApiClient, TranscriptionClient};
use crate::api_clients::server_proxy_client::ServerProxyClient;
use crate::auth::token_manager::TokenManager;


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