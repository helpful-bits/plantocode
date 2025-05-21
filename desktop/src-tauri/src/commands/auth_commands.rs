use tauri::{command, State, Manager, AppHandle};
use std::sync::Arc;
use log::{info, warn, error, debug};
use reqwest::{Client, StatusCode};
use serde_json::json;
use crate::error::{AppError, AppResult};
use crate::AppState;
use crate::auth::TokenManager;
use crate::models::{FrontendUser, AuthDataResponse};

/// Exchange main server tokens and store app JWT
/// Renamed from exchange_and_store_firebase_token to better reflect its new purpose
/// Can also be used to directly set a token from JavaScript (when token param is provided)
/// Or to clear the token (when firebaseIdToken is null and token is null)
#[command]
pub async fn exchange_main_server_tokens_and_store_app_jwt(
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
            firebase_uid: None,
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
            firebase_uid: None,
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

/// Initiate OAuth flow on main server
/// This command generates a unique polling ID and CSRF state token,
/// then constructs the URL for the main server's login page
#[command]
pub async fn initiate_oauth_flow_on_main_server(
    app_handle: AppHandle,
    provider: String,
) -> Result<(String, String), String> {
    // Generate a unique polling ID (UUID v4)
    let polling_id = uuid::Uuid::new_v4().to_string();
    
    // Generate a cryptographically strong CSRF state token
    let csrf_state = generate_csrf_token()?;
    
    // Get the main server base URL from environment
    let server_url = std::env::var("MAIN_SERVER_BASE_URL")
        .or_else(|_| std::env::var("SERVER_URL")) // Fallback to older variable name
        .map_err(|e| format!("Failed to get server URL from environment: {}", e))?;
    
    // Construct the auth URL
    let auth_url = format!(
        "{}/auth/hybrid/login-via-web?pid={}&state={}&provider={}",
        server_url, polling_id, csrf_state, provider
    );
    
    info!("Initiated OAuth flow on main server for provider: {}", provider);
    debug!("Auth URL: {}", auth_url);
    debug!("Polling ID: {}", polling_id);
    
    // Return the auth URL and polling ID to the frontend
    Ok((auth_url, polling_id))
}

/// Helper function to generate a secure CSRF token
fn generate_csrf_token() -> Result<String, String> {
    use rand::{rngs::StdRng, Rng, SeedableRng};
    
    // Create a cryptographically secure RNG
    let mut rng = StdRng::from_entropy();
    
    // Generate 32 random bytes
    let mut random_bytes = [0u8; 32];
    rng.fill(&mut random_bytes);
    
    // Convert to hexadecimal string
    let token = random_bytes.iter()
        .map(|b| format!("{:02x}", b))
        .collect::<String>();
    
    Ok(token)
}

/// Trigger Firebase ID token refresh on main server
/// This is used to refresh the Firebase ID token using the stored refresh token on the server
#[command]
pub async fn trigger_firebase_id_token_refresh_on_main_server(
    app_handle: AppHandle,
    token_manager: State<'_, Arc<TokenManager>>,
) -> Result<String, String> {
    // Get the current app JWT
    let app_jwt = token_manager.get().await
        .ok_or_else(|| "App JWT not found".to_string())?;
    
    // Get the main server base URL from environment
    let server_url = std::env::var("MAIN_SERVER_BASE_URL")
        .or_else(|_| std::env::var("SERVER_URL")) // Fallback to older variable name
        .map_err(|e| format!("Failed to get server URL from environment: {}", e))?;
    
    // Prepare the request URL
    let url = format!("{}/api/auth/refresh-firebase-id-token", server_url);
    
    // Get reqwest client from app_handle
    let client = app_handle.state::<reqwest::Client>().inner();
    
    // Make the refresh request
    let response = client.post(&url)
        .header("Authorization", format!("Bearer {}", app_jwt))
        .send()
        .await
        .map_err(|e| format!("Failed to connect to server for token refresh: {}", e))?;
    
    if !response.status().is_success() {
        let error_text = response.text().await.unwrap_or_else(|_| "Unknown error".to_string());
        return Err(format!("Server error during token refresh: {}", error_text));
    }
    
    // Parse response to get the new Firebase ID token
    let refresh_response: serde_json::Value = response.json()
        .await
        .map_err(|e| format!("Failed to parse refresh response: {}", e))?;
    
    // Extract the new Firebase ID token
    let firebase_id_token = refresh_response["firebase_id_token"]
        .as_str()
        .ok_or_else(|| "Firebase ID token not found in response".to_string())?
        .to_string();
    
    info!("Successfully refreshed Firebase ID token");
    
    Ok(firebase_id_token)
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

/// Backward compatibility function for the old exchange_and_store_firebase_token command
/// This simply calls the new exchange_main_server_tokens_and_store_app_jwt function
#[command]
pub async fn exchange_and_store_firebase_token(
    firebase_id_token: Option<String>,
    token: Option<String>,
    app_state: State<'_, AppState>,
    token_manager: State<'_, Arc<TokenManager>>,
) -> AppResult<AuthDataResponse> {
    warn!("Using deprecated exchange_and_store_firebase_token command - please update to exchange_main_server_tokens_and_store_app_jwt");
    exchange_main_server_tokens_and_store_app_jwt(firebase_id_token, token, app_state, token_manager).await
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