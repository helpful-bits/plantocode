use log::{error, info};
use std::sync::Arc;
use tauri::{AppHandle, Manager};

use crate::api_clients::client_trait::{ApiClient, TranscriptionClient};
use crate::api_clients::server_proxy_client::ServerProxyClient;
use crate::api_clients::billing_client::BillingClient;
use crate::auth::token_manager::TokenManager;
use crate::error::{AppError, AppResult};

/// Get the API client from Tauri's managed state
///
/// This should be used in processors and services to get the application-wide
/// shared client instance.
pub async fn get_api_client(app_handle: &AppHandle) -> AppResult<Arc<dyn ApiClient>> {
    let lock = app_handle
        .try_state::<Arc<tokio::sync::RwLock<Option<Arc<dyn ApiClient>>>>>()
        .ok_or_else(|| {
            AppError::InternalError("ApiClient RwLock not managed in application state".to_string())
        })?
        .inner()
        .clone();
    
    let guard = lock.read().await;
    match guard.as_ref() {
        Some(client) => Ok(client.clone()),
        None => Err(AppError::InitializationError(
            "API client not initialized. Please select a server region and log in.".to_string()
        ))
    }
}

/// Get the server proxy client from Tauri's managed state
///
/// This should be used if you specifically need a ServerProxyClient instance
pub async fn get_server_proxy_client(app_handle: &AppHandle) -> AppResult<Arc<ServerProxyClient>> {
    let lock = app_handle
        .try_state::<Arc<tokio::sync::RwLock<Option<Arc<ServerProxyClient>>>>>()
        .ok_or_else(|| {
            AppError::InternalError(
                "ServerProxyClient RwLock not managed in application state".to_string(),
            )
        })?
        .inner()
        .clone();
    
    let guard = lock.read().await;
    match guard.as_ref() {
        Some(client) => Ok(client.clone()),
        None => Err(AppError::InitializationError(
            "API client not initialized. Please select a server region and log in.".to_string()
        ))
    }
}

/// Get the transcription client from Tauri's managed state
pub async fn get_transcription_client(app_handle: &AppHandle) -> AppResult<Arc<dyn TranscriptionClient>> {
    let lock = app_handle
        .try_state::<Arc<tokio::sync::RwLock<Option<Arc<dyn TranscriptionClient>>>>>()
        .ok_or_else(|| {
            AppError::InternalError(
                "TranscriptionClient RwLock not managed in application state".to_string(),
            )
        })?
        .inner()
        .clone();
    
    let guard = lock.read().await;
    match guard.as_ref() {
        Some(client) => Ok(client.clone()),
        None => Err(AppError::InitializationError(
            "API client not initialized. Please select a server region and log in.".to_string()
        ))
    }
}

/// Get the billing client from Tauri's managed state
pub async fn get_billing_client(app_handle: &AppHandle) -> AppResult<Arc<BillingClient>> {
    let lock = app_handle
        .try_state::<Arc<tokio::sync::RwLock<Option<Arc<BillingClient>>>>>()
        .ok_or_else(|| {
            AppError::InternalError(
                "BillingClient RwLock not managed in application state".to_string(),
            )
        })?
        .inner()
        .clone();
    
    let guard = lock.read().await;
    match guard.as_ref() {
        Some(client) => Ok(client.clone()),
        None => Err(AppError::InitializationError(
            "API client not initialized. Please select a server region and log in.".to_string()
        ))
    }
}

pub fn create_http_client() -> reqwest::Client {
    reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(1800)) // 30 minute request timeout
        .connect_timeout(std::time::Duration::from_secs(600)) // 10 minute connection timeout
        .pool_idle_timeout(None) // Keep idle connections in the pool indefinitely
        .tcp_keepalive(Some(std::time::Duration::from_secs(120))) // Send TCP keepalives every 2 minutes
        .build()
        .expect("Failed to create HTTP client")
}
