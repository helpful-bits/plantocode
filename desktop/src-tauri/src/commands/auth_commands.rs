use tauri::{command, State, Manager, AppHandle};
use std::sync::Arc;
use log::{info, warn, error, debug};
use reqwest::{Client, StatusCode};
use serde_json::json;
use crate::error::{AppError, AppResult};
use crate::AppState;
use crate::auth::TokenManager;
use crate::models::{FrontendUser, AuthDataResponse};

/// Exchange Firebase ID token for application JWT and store in memory
/// Can also be used to directly set a token from JavaScript (when token param is provided)
/// Or to clear the token (when firebaseIdToken is null and token is null)
#[command]
pub async fn exchange_and_store_firebase_token(
    firebase_id_token: Option<String>,
    token: Option<String>,
    app_state: State<'_, AppState>,
    token_manager: State<'_, Arc<TokenManager>>,
) -> AppResult<AuthDataResponse> {
    // Case 1: Direct token sync from JavaScript
    if firebase_id_token.is_none() && token.is_some() {
        debug!("Syncing token from JavaScript to Rust backend");
        token_manager.set(token.clone()).await?;
        
        // For consistency, return a minimal response with just the token
        return Ok(AuthDataResponse {
            token: token.unwrap_or_default(),
            token_type: "Bearer".to_string(),
            user: FrontendUser {
                id: "synced".to_string(),
                email: "synced@example.com".to_string(),
                name: None,
                role: "user".to_string(),
            },
            expires_in: 3600, // Default 1 hour expiry
        });
    }
    
    // Case 2: Clear token
    if firebase_id_token.is_none() && token.is_none() {
        debug!("Clearing token from Rust backend");
        token_manager.set(None).await?;
        
        // Return empty response
        return Ok(AuthDataResponse {
            token: "".to_string(),
            token_type: "Bearer".to_string(),
            user: FrontendUser {
                id: "".to_string(),
                email: "".to_string(),
                name: None,
                role: "".to_string(),
            },
            expires_in: 0,
        });
    }
    
    // Case 3: Exchange Firebase token for app JWT
    let firebase_id_token = firebase_id_token.ok_or_else(|| {
        error!("No Firebase ID token provided for exchange");
        AppError::ValidationError("No Firebase ID token provided".to_string())
    })?;
    
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
    
    // Store the application JWT in TokenManager
    token_manager.set(Some(auth_details.token.clone())).await
        .map_err(|e| {
            error!("Failed to store token: {}", e);
            AppError::StorageError(format!("Failed to store token: {}", e))
        })?;
    
    info!("Application JWT stored in TokenManager");
    
    // Return the auth details to the frontend
    Ok(auth_details)
}

/// Get the current JWT from the token manager
#[command]
pub async fn get_stored_app_jwt(
    token_manager: State<'_, Arc<TokenManager>>,
) -> AppResult<Option<String>> {
    debug!("Retrieving current JWT from token manager");
    Ok(token_manager.get().await)
}

/// Get the current JWT from the token manager - new API
/// This is the preferred command to use going forward
#[command]
pub async fn get_app_jwt(
    token_manager: State<'_, Arc<TokenManager>>,
) -> AppResult<Option<String>> {
    debug!("Retrieving JWT from token manager");
    Ok(token_manager.get().await)
}

/// Set a JWT in the token manager - new API
/// This is the preferred command to use going forward
#[command]
pub async fn set_app_jwt(
    token: Option<String>,
    token_manager: State<'_, Arc<TokenManager>>,
) -> AppResult<()> {
    match &token {
        Some(_) => debug!("Setting new JWT in token manager"),
        None => debug!("Clearing JWT from token manager"),
    }
    token_manager.set(token).await
}

/// Clear the stored JWT - new explicit API for logout
#[command]
pub async fn clear_stored_app_jwt(
    token_manager: State<'_, Arc<TokenManager>>,
) -> AppResult<()> {
    debug!("Explicitly clearing JWT from token manager");
    token_manager.set(None).await
}

/// Refresh the application JWT using the stored Firebase refresh token
/// This is called periodically to maintain active sessions
#[command]
pub async fn refresh_app_jwt(
    app_state: State<'_, AppState>,
    token_manager: State<'_, Arc<TokenManager>>,
) -> AppResult<()> {
    // Get the current token 
    let current_token = match token_manager.get().await {
        Some(token) => token,
        None => {
            debug!("No token to refresh");
            return Ok(());
        }
    };
    
    // Verify token is still valid on server and get a fresh one
    let server_url = &app_state.settings.server_url;
    let client = &app_state.client;
    let url = format!("{}/api/auth/refresh", server_url);
    
    info!("Refreshing application JWT");
    
    let response = client.post(&url)
        .header("Authorization", format!("Bearer {}", current_token))
        .send()
        .await
        .map_err(|e| {
            error!("Failed to connect to server for token refresh: {}", e);
            AppError::NetworkError(format!("Failed to connect to server: {}", e))
        })?;
    
    if !response.status().is_success() {
        let status = response.status();
        let error_text = response.text().await.unwrap_or_else(|_| "Unknown error".to_string());
        error!("Server returned error during token refresh. Status: {}, Error: {}", status, error_text);
        
        // If unauthorized, clear the token
        if status.as_u16() == 401 {
            warn!("Token expired or invalid during refresh - clearing token");
            token_manager.set(None).await?;
        }
        
        return Err(AppError::ExternalServiceError(format!("Server error during token refresh: {}", error_text)));
    }
    
    // Parse the response
    let auth_details = response.json::<AuthDataResponse>().await.map_err(|e| {
        error!("Failed to parse token refresh response: {}", e);
        AppError::SerdeError(format!("Failed to parse token refresh response: {}", e))
    })?;
    
    // Store the refreshed token
    token_manager.set(Some(auth_details.token.clone())).await
        .map_err(|e| {
            error!("Failed to store refreshed token: {}", e);
            AppError::StorageError(format!("Failed to store refreshed token: {}", e))
        })?;
    
    info!("Successfully refreshed application JWT");
    Ok(())
}

/// Get user info from server using provided app JWT
#[command]
pub async fn get_user_info_with_app_jwt(
    app_state: State<'_, AppState>,
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