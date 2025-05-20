use tauri::{command, State, Manager};
use std::sync::Arc;
use log::{info, warn, error};
use reqwest::{Client, StatusCode};
use serde_json::json;
use crate::error::{AppError, AppResult};
use crate::AppState;
use crate::auth::TokenManager;
use crate::models::{FrontendUser, AuthDataResponse};

// Exchange Firebase ID token for application JWT, update Rust's in-memory cache, and return it
#[command]
pub async fn exchange_and_store_firebase_token(
    firebase_id_token: String,
    app_state: State<'_, AppState>,
    token_manager: State<'_, Arc<TokenManager>>,
) -> AppResult<AuthDataResponse> {
    let server_url = &app_state.settings.server_url;
    
    // Create request to server to exchange token
    let client = &app_state.client;
    let url = format!("{}/api/auth/firebase/token", server_url);
    
    info!("Exchanging Firebase ID token for application JWT");
    
    let response = client.post(&url)
        .json(&json!({
            "id_token": firebase_id_token,
        }))
        .send()
        .await
        .map_err(|e| {
            error!("Failed to connect to server for token exchange: {}", e);
            AppError::NetworkError(format!("Failed to connect to server: {}", e))
        })?;
    
    if !response.status().is_success() {
        let status = response.status();
        let error_text = response.text().await.unwrap_or_else(|_| "Unknown error".to_string());
        error!("Server returned error during token exchange. Status: {}, Error: {}", status, error_text);
        
        return match status {
            StatusCode::UNAUTHORIZED => Err(AppError::AuthError(format!("Authentication failed: {}", error_text))),
            _ => Err(AppError::ExternalServiceError(format!("Server error during authentication: {}", error_text))),
        };
    }
    
    // Deserialize the server response
    let auth_details = response.json::<AuthDataResponse>().await.map_err(|e| {
        error!("Failed to parse server response: {}", e);
        AppError::SerdeError(format!("Failed to parse server response: {}", e))
    })?;
    
    // Store the application JWT in TokenManager's in-memory cache
    token_manager.set(Some(auth_details.token.clone())).await
        .map_err(|e| {
            error!("Failed to store token in memory: {}", e);
            AppError::StorageError(format!("Failed to store token in memory: {}", e))
        })?;
    
    info!("Application JWT stored in TokenManager's in-memory cache");
    
    // Return the complete auth response to the frontend, which is responsible for
    // storing the token in Stronghold
    Ok(auth_details)
}

// This function was removed as per implementation plan
// Token is now retrieved directly from Stronghold in the frontend

// Get user info from server using provided app JWT (not from TokenManager)
#[command]
pub async fn get_user_info_with_app_jwt(
    app_state: State<'_, AppState>,
    _token_manager: State<'_, Arc<TokenManager>>,
    app_token: String,
) -> AppResult<FrontendUser> {
    let server_url = &app_state.settings.server_url;
    let client = &app_state.client;
    let url = format!("{}/api/auth/userinfo", server_url);
    
    info!("Fetching user info with provided app JWT");
    
    let response = client.get(&url)
        .header("Authorization", format!("Bearer {}", app_token))
        .send()
        .await
        .map_err(|e| {
            error!("Failed to connect to server for user info: {}", e);
            AppError::NetworkError(format!("Failed to connect to server: {}", e))
        })?;
    
    if !response.status().is_success() {
        let status = response.status();
        let error_text = response.text().await.unwrap_or_else(|_| "Unknown error".to_string());
        error!("Server returned error during user info fetch. Status: {}, Error: {}", status, error_text);
        
        return Err(AppError::ExternalServiceError(format!("Server error: {}", error_text)));
    }
    
    // Deserialize the server response
    let user_info = response.json::<FrontendUser>().await.map_err(|e| {
        error!("Failed to parse user info response: {}", e);
        AppError::SerdeError(format!("Failed to parse user info response: {}", e))
    })?;
    
    Ok(user_info)
}

// Set in-memory token in Rust - called by frontend after loading from Stronghold
#[command]
pub async fn set_in_memory_token(
    token_manager: State<'_, Arc<TokenManager>>,
    token: String
) -> AppResult<()> {
    info!("Setting token in TokenManager's in-memory cache from frontend");
    token_manager.set(Some(token)).await
}

// Clear in-memory token in Rust - called by frontend during logout
#[command]
pub async fn clear_in_memory_token(
    token_manager: State<'_, Arc<TokenManager>>
) -> AppResult<()> {
    info!("Clearing token from TokenManager's in-memory cache");
    token_manager.set(None).await
}