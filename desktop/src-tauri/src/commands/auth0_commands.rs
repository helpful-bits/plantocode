use crate::AppState;
use crate::auth::TokenManager;
use crate::error::{AppError, AppResult};
use crate::models::{AuthDataResponse, FrontendUser};
use log::{debug, error, info, warn};
use oauth2::{
    AuthUrl, AuthorizationCode, ClientId, CsrfToken, PkceCodeChallenge, PkceCodeVerifier,
    RedirectUrl, Scope, TokenResponse, TokenUrl, basic::BasicClient,
};
use reqwest::{Client, StatusCode};
use serde::{Deserialize, Serialize};
use serde_json::json;
use std::sync::Arc;
use tauri::{AppHandle, Manager, State, command};
use url::Url;

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PollStatusResponse {
    pub status: String,
    pub authorization_code: Option<String>,
    pub tauri_csrf_token: Option<String>,
}

/// Start Auth0 login flow using PKCE
#[command]
pub async fn start_auth0_login_flow(
    app_handle: AppHandle,
    app_state: State<'_, AppState>,
    provider_hint: Option<String>,
) -> AppResult<(String, String)> {
    let polling_id = uuid::Uuid::new_v4().to_string();

    // Generate PKCE challenge
    let (pkce_challenge, pkce_verifier) = PkceCodeChallenge::new_random_sha256();

    // Generate CSRF token
    let csrf_token_tauri = CsrfToken::new_random();

    // Store the attempt
    app_state
        .auth0_state_store
        .store_attempt(
            polling_id.clone(),
            pkce_verifier.secret().to_string(),
            csrf_token_tauri.secret().to_string(),
        )
        .map_err(|e| AppError::InternalError(format!("Failed to store auth attempt: {}", e)))?;

    // Get Auth0 config from compile-time constants
    let auth0_domain = crate::constants::AUTH0_DOMAIN
        .ok_or_else(|| AppError::ConfigError("AUTH0_DOMAIN not configured. Please rebuild with AUTH0_DOMAIN environment variable set.".to_string()))?;
    let auth0_native_client_id = crate::constants::AUTH0_NATIVE_CLIENT_ID
        .ok_or_else(|| AppError::ConfigError("AUTH0_NATIVE_CLIENT_ID not configured. Please rebuild with AUTH0_NATIVE_CLIENT_ID environment variable set.".to_string()))?;
    let auth0_api_audience = crate::constants::AUTH0_API_AUDIENCE
        .ok_or_else(|| AppError::ConfigError("AUTH0_API_AUDIENCE not configured. Please rebuild with AUTH0_API_AUDIENCE environment variable set.".to_string()))?;
    
    // Get server URL from app state
    let server_url = app_state.get_server_url()
        .ok_or_else(|| AppError::ConfigError("No server URL configured. Please select a server region first.".to_string()))?;
    
    // Construct Auth0 URLs dynamically
    let server_auth0_callback_url = format!("{}/auth/auth0/callback", server_url.trim_end_matches('/'));
    let server_auth0_initiate_login_url = format!("{}/auth/auth0/initiate-login", server_url.trim_end_matches('/'));

    // Construct URL to server's initiate-login endpoint
    let mut initiate_url = Url::parse(&server_auth0_initiate_login_url)
        .map_err(|e| AppError::ConfigError(format!("Invalid server URL: {}", e)))?;

    initiate_url
        .query_pairs_mut()
        .append_pair("pid", &polling_id)
        .append_pair("csrf_tauri", csrf_token_tauri.secret())
        .append_pair("challenge", pkce_challenge.as_str())
        .append_pair("challenge_method", "S256")
        .append_pair("client_id", &auth0_native_client_id)
        .append_pair("audience", &auth0_api_audience)
        .append_pair("scope", "openid profile email")
        .append_pair("redirect_uri", &server_auth0_callback_url);

    // Add provider hint if provided
    if let Some(hint) = provider_hint {
        initiate_url
            .query_pairs_mut()
            .append_pair("connection", &hint);
    }

    info!("Starting Auth0 login flow with polling ID: {}", polling_id);

    Ok((initiate_url.to_string(), polling_id))
}

/// Check auth status and exchange token if ready
#[command]
pub async fn check_auth_status_and_exchange_token(
    app_handle: AppHandle,
    polling_id: String,
    app_state: State<'_, AppState>,
    token_manager: State<'_, Arc<TokenManager>>,
) -> AppResult<Option<FrontendUser>> {
    // Get the stored attempt
    let (pkce_verifier_secret, csrf_token_tauri_original) = app_state
        .auth0_state_store
        .get_attempt(&polling_id)
        .map_err(|e| AppError::InternalError(format!("Failed to get auth attempt: {}", e)))?
        .ok_or_else(|| AppError::ValidationError("Polling ID not found or expired".to_string()))?;

    // Poll the server for status
    let server_url = app_state.get_server_url()
        .ok_or_else(|| AppError::ConfigError("No server URL configured. Please select a server region first.".to_string()))?;
    let server_auth0_poll_status_url = format!("{}/auth0/poll-status", server_url.trim_end_matches('/'));

    let poll_url = format!("{}?pid={}", server_auth0_poll_status_url, polling_id);
    let client = &app_state.client;

    let response = client
        .get(&poll_url)
        .send()
        .await
        .map_err(|e| AppError::NetworkError(format!("Failed to poll status: {}", e)))?;

    if response.status() == StatusCode::NO_CONTENT {
        // Still pending
        return Ok(None);
    }

    if !response.status().is_success() {
        let error_text = response
            .text()
            .await
            .unwrap_or_else(|_| "Unknown error".to_string());
        return Err(AppError::ExternalServiceError(format!(
            "Poll status error: {}",
            error_text
        )));
    }

    let poll_response: PollStatusResponse = response
        .json()
        .await
        .map_err(|e| AppError::SerdeError(format!("Failed to parse poll response: {}", e)))?;

    if poll_response.status != "ready" {
        return Ok(None);
    }

    let authorization_code = poll_response
        .authorization_code
        .ok_or_else(|| AppError::ValidationError("Authorization code missing".to_string()))?;

    // Validate authorization code format
    if authorization_code.is_empty() {
        error!("Authorization code validation failed: empty code");
        return Err(AppError::ValidationError(
            "Invalid authorization code format".to_string(),
        ));
    }

    if authorization_code.len() < 10 {
        error!("Authorization code validation failed: code too short");
        return Err(AppError::ValidationError(
            "Invalid authorization code length".to_string(),
        ));
    }
    let csrf_token_tauri_from_server = poll_response
        .tauri_csrf_token
        .ok_or_else(|| AppError::ValidationError("CSRF token missing".to_string()))?;

    // Validate CSRF token with enhanced security checks
    if csrf_token_tauri_from_server.is_empty() || csrf_token_tauri_original.is_empty() {
        error!("CSRF token validation failed: empty token(s) detected");
        return Err(AppError::SecurityError(
            "Invalid CSRF token format".to_string(),
        ));
    }

    if csrf_token_tauri_from_server.len() < 16 || csrf_token_tauri_original.len() < 16 {
        error!("CSRF token validation failed: token too short");
        return Err(AppError::SecurityError(
            "Invalid CSRF token length".to_string(),
        ));
    }

    if csrf_token_tauri_from_server != csrf_token_tauri_original {
        error!("CSRF token mismatch detected - potential security threat");
        return Err(AppError::SecurityError("CSRF token mismatch".to_string()));
    }

    debug!("CSRF token validation successful");

    // Exchange authorization code for tokens using OAuth2 client
    let auth0_domain = crate::constants::AUTH0_DOMAIN
        .ok_or_else(|| AppError::ConfigError("AUTH0_DOMAIN not configured. Please rebuild with AUTH0_DOMAIN environment variable set.".to_string()))?;
    let auth0_native_client_id = crate::constants::AUTH0_NATIVE_CLIENT_ID
        .ok_or_else(|| AppError::ConfigError("AUTH0_NATIVE_CLIENT_ID not configured. Please rebuild with AUTH0_NATIVE_CLIENT_ID environment variable set.".to_string()))?;
    // Get server URL from app state
    let server_url = app_state.get_server_url()
        .ok_or_else(|| AppError::ConfigError("No server URL configured. Please select a server region first.".to_string()))?;
    let server_auth0_callback_url = format!("{}/auth/auth0/callback", server_url.trim_end_matches('/'));

    let auth_url = AuthUrl::new(format!("https://{}/authorize", auth0_domain))
        .map_err(|e| AppError::ConfigError(format!("Invalid auth URL: {}", e)))?;
    let token_url = TokenUrl::new(format!("https://{}/oauth/token", auth0_domain))
        .map_err(|e| AppError::ConfigError(format!("Invalid token URL: {}", e)))?;

    let oauth_client = BasicClient::new(ClientId::new(auth0_native_client_id.to_string()))
        .set_auth_uri(auth_url)
        .set_token_uri(token_url)
        .set_redirect_uri(
            RedirectUrl::new(server_auth0_callback_url)
                .map_err(|e| AppError::ConfigError(format!("Invalid redirect URL: {}", e)))?,
        );

    let http_client = reqwest::Client::new();
    let token_result = oauth_client
        .exchange_code(AuthorizationCode::new(authorization_code))
        .set_pkce_verifier(PkceCodeVerifier::new(pkce_verifier_secret))
        .request_async(&http_client)
        .await
        .map_err(|e| AppError::ExternalServiceError(format!("Token exchange failed: {}", e)))?;

    // For Auth0, we need to extract the access token and use it as our token
    // Auth0's access tokens for APIs are JWTs that can be validated by the server
    let access_token = token_result.access_token().secret().to_string();

    let refresh_token = token_result
        .refresh_token()
        .map(|rt| rt.secret().to_string());

    // Send tokens to server for finalization
    let server_auth0_finalize_login_url = format!("{}/auth0/finalize-login", server_url.trim_end_matches('/'));

    let finalize_response = client
        .post(&server_auth0_finalize_login_url)
        .json(&json!({
            "auth0_id_token": access_token,
            "auth0_refresh_token": refresh_token
        }))
        .send()
        .await
        .map_err(|e| AppError::NetworkError(format!("Failed to finalize login: {}", e)))?;

    let response_status = finalize_response.status();
    let response_text = finalize_response
        .text()
        .await
        .unwrap_or_else(|_| "Failed to read response body".to_string());

    if !response_status.is_success() {
        error!(
            "Finalize login failed with status {}: {}",
            response_status, response_text
        );
        return Err(AppError::ExternalServiceError(format!(
            "Finalize login error: {}",
            response_text
        )));
    }

    let auth_response: AuthDataResponse = serde_json::from_str(&response_text).map_err(|e| {
        error!(
            "Failed to parse auth response. Status: {}, Response body: {}, Parse error: {}",
            response_status, response_text, e
        );
        AppError::SerdeError(format!("Failed to parse auth response: {}", e))
    })?;

    // Store app JWT
    token_manager.set(Some(auth_response.token.clone())).await?;

    // Remove the polling ID now that authentication is complete
    let _ = app_state
        .auth0_state_store
        .remove_attempt(&polling_id)
        .map_err(|e| warn!("Failed to remove auth attempt: {}", e));

    info!(
        "Auth0 login completed successfully for user: {}",
        auth_response.user.email
    );

    Ok(Some(auth_response.user))
}

/// Refresh app JWT using Auth0 refresh token
#[command]
pub async fn refresh_app_jwt_auth0(
    app_handle: AppHandle,
    token_manager: State<'_, Arc<TokenManager>>,
    app_state: State<'_, AppState>,
) -> AppResult<()> {
    let current_token = token_manager
        .get()
        .await
        .ok_or_else(|| AppError::ValidationError("No app JWT found".to_string()))?;

    // Get server URL from app state
    let server_url = app_state.get_server_url()
        .ok_or_else(|| AppError::ConfigError("No server URL configured. Please select a server region first.".to_string()))?;
    let server_auth0_refresh_app_token_url = format!("{}/api/auth0/refresh-app-token", server_url.trim_end_matches('/'));

    let client = &app_state.client;

    let response = client
        .post(&server_auth0_refresh_app_token_url)
        .header("Authorization", format!("Bearer {}", current_token))
        .send()
        .await
        .map_err(|e| AppError::NetworkError(format!("Failed to refresh token: {}", e)))?;

    if !response.status().is_success() {
        let status = response.status();
        let error_text = response
            .text()
            .await
            .unwrap_or_else(|_| "Unknown error".to_string());

        if status == StatusCode::UNAUTHORIZED {
            // Clear invalid token
            token_manager.set(None).await?;
        }

        return Err(AppError::ExternalServiceError(format!(
            "Token refresh failed: {}",
            error_text
        )));
    }

    let auth_response: AuthDataResponse = response
        .json()
        .await
        .map_err(|e| AppError::SerdeError(format!("Failed to parse refresh response: {}", e)))?;

    // Store new app JWT
    token_manager.set(Some(auth_response.token)).await?;

    info!("App JWT refreshed successfully via Auth0");

    Ok(())
}

/// Logout from Auth0
#[command]
pub async fn logout_auth0(
    app_handle: AppHandle,
    token_manager: State<'_, Arc<TokenManager>>,
    app_state: State<'_, AppState>,
) -> AppResult<()> {
    // Get current token for server logout call
    let current_token = token_manager.get().await;

    // Call server logout endpoint if we have a token
    if let Some(token) = &current_token {
        let server_url = app_state.get_server_url()
            .ok_or_else(|| AppError::ConfigError("No server URL configured. Please select a server region first.".to_string()))?;
        let server_logout_url = format!("{}/api/auth/logout", server_url.trim_end_matches('/'));

        let client = &app_state.client;
        let logout_response = client
            .post(&server_logout_url)
            .header("Authorization", format!("Bearer {}", token))
            .send()
            .await;

        match logout_response {
            Ok(response) => {
                if response.status().is_success() {
                    info!("Successfully called server logout endpoint");
                } else {
                    warn!(
                        "Server logout endpoint returned non-success status: {}",
                        response.status()
                    );
                }
            }
            Err(e) => {
                warn!("Failed to call server logout endpoint: {}", e);
            }
        }
    }

    // Clear stored app JWT regardless of server response
    token_manager.set(None).await?;

    // Construct Auth0 logout URL
    let auth0_domain = crate::constants::AUTH0_DOMAIN
        .ok_or_else(|| AppError::ConfigError("AUTH0_DOMAIN not configured. Please rebuild with AUTH0_DOMAIN environment variable set.".to_string()))?;
    let auth0_native_client_id = crate::constants::AUTH0_NATIVE_CLIENT_ID
        .ok_or_else(|| AppError::ConfigError("AUTH0_NATIVE_CLIENT_ID not configured. Please rebuild with AUTH0_NATIVE_CLIENT_ID environment variable set.".to_string()))?;
    // Get server URL from app state
    let server_url = app_state.get_server_url()
        .ok_or_else(|| AppError::ConfigError("No server URL configured. Please select a server region first.".to_string()))?;
    let server_auth0_logged_out_url = format!("{}/auth/auth0/logged-out", server_url.trim_end_matches('/'));

    // Construct a logout URL that redirects to the configured logged out page
    let logout_url = format!(
        "https://{}/v2/logout?client_id={}&returnTo={}",
        auth0_domain,
        auth0_native_client_id,
        urlencoding::encode(&server_auth0_logged_out_url)
    );

    // Open logout URL in browser
    use tauri_plugin_shell::ShellExt;
    app_handle
        .shell()
        .open(logout_url, None)
        .map_err(|e| AppError::ExternalServiceError(format!("Failed to open logout URL: {}", e)))?;

    info!("Auth0 logout initiated");

    Ok(())
}

/// Get user info with app JWT with timeout protection
#[command]
pub async fn get_user_info_with_app_jwt(
    server_proxy_client: State<'_, Arc<crate::api_clients::server_proxy_client::ServerProxyClient>>,
) -> AppResult<FrontendUser> {
    use tokio::time::{Duration, timeout};

    info!("Getting user info via server proxy");

    // Add overall timeout protection (reduced to 10s to match frontend)
    match timeout(Duration::from_secs(10), server_proxy_client.get_user_info()).await {
        Ok(result) => result,
        Err(_) => {
            error!("Timeout fetching user info from server");
            Err(AppError::NetworkError(
                "Timeout fetching user info from server".to_string(),
            ))
        }
    }
}

/// Get stored app JWT with timeout protection
#[command]
pub async fn get_app_jwt(token_manager: State<'_, Arc<TokenManager>>) -> AppResult<Option<String>> {
    use tokio::time::{Duration, timeout};

    // Add timeout protection to prevent hanging
    match timeout(Duration::from_secs(10), token_manager.get()).await {
        Ok(token) => {
            debug!("Retrieved app JWT from TokenManager");
            Ok(token)
        }
        Err(_) => {
            error!("Timeout retrieving app JWT from TokenManager");
            Err(AppError::StorageError(
                "Timeout retrieving stored JWT".to_string(),
            ))
        }
    }
}

/// Set app JWT (same as before)
#[command]
pub async fn set_app_jwt(
    token: Option<String>,
    token_manager: State<'_, Arc<TokenManager>>,
) -> AppResult<()> {
    token_manager.set(token).await
}

/// Clear stored app JWT (same as before)
#[command]
pub async fn clear_stored_app_jwt(token_manager: State<'_, Arc<TokenManager>>) -> AppResult<()> {
    token_manager.set(None).await
}
