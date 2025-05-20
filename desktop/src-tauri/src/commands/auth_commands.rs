use tauri::{command, State, Manager};
use std::sync::Arc;
use log::{info, warn, error};
use reqwest::{Client, StatusCode};
use serde_json::json;
use crate::error::{AppError, AppResult};
use crate::AppState;
use crate::constants::TOKEN_KEY;
use crate::auth::TokenManager;
use crate::models::{FrontendUser, AuthDataResponse};

// Exchange Firebase ID token for application JWT and store it
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
    
    // Store the application JWT in TokenManager
    token_manager.set(Some(auth_details.token.clone())).await;
    info!("Application JWT stored in TokenManager");
    
    Ok(auth_details)
}

// Retrieve token from TokenManager
#[command]
pub async fn get_stored_token(
    token_manager: State<'_, Arc<TokenManager>>,
) -> AppResult<Option<String>> {
    // Get token from TokenManager
    let token = token_manager.get().await;
    Ok(token)
}

// Clear token from TokenManager
#[command]
pub async fn clear_stored_token(
    token_manager: State<'_, Arc<TokenManager>>,
) -> AppResult<()> {
    // Clear from TokenManager
    token_manager.set(None).await;

    info!("Token cleared from TokenManager");
    Ok(())
}

// Get user info from server using stored application JWT
#[command]
pub async fn get_user_info_from_stored_app_jwt(
    app_state: State<'_, AppState>,
    token_manager: State<'_, Arc<TokenManager>>,
) -> AppResult<FrontendUser> {
    // Get token from TokenManager
    let token = match token_manager.get().await {
        Some(token) => token,
        None => {
            error!("No stored token found when attempting to get user info");
            return Err(AppError::AuthError("No stored token".into()));
        }
    };
    
    let server_url = &app_state.settings.server_url;
    let client = &app_state.client;
    let url = format!("{}/api/auth/userinfo", server_url);
    
    info!("Fetching user info from stored app JWT");
    
    let response = client.get(&url)
        .header("Authorization", format!("Bearer {}", token))
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
        
        // If token is unauthorized, clear it
        if status == StatusCode::UNAUTHORIZED {
            info!("Clearing invalid token from storage");
            token_manager.set(None).await;
            return Err(AppError::AuthError("Invalid or expired token".into()));
        }
        
        return Err(AppError::ExternalServiceError(format!("Server error: {}", error_text)));
    }
    
    // Deserialize the server response
    let user_info = response.json::<FrontendUser>().await.map_err(|e| {
        error!("Failed to parse user info response: {}", e);
        AppError::SerdeError(format!("Failed to parse user info response: {}", e))
    })?;
    
    Ok(user_info)
}