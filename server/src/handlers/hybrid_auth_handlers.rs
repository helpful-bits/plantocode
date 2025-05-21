use actix_web::{web, HttpResponse, Result};
use serde::{Deserialize, Serialize};
use uuid::Uuid;
use tera::Tera;
use crate::db::UserRepository;
use crate::auth_stores::{PollingStore, StateStore, PendingToken, FirebasePendingTokens, StateValue, LoginViaWebQuery};
use crate::services::auth::oauth::FirebaseOAuthService;
use crate::error::AppError;
use log::{info, error, warn};
use chrono::Utc;
use actix_files::NamedFile;
use std::path::PathBuf;

// Define request and response structures
#[derive(Deserialize)]
pub struct ProviderTokenCaptureRequest {
    provider_id_token: String,
    oauth_provider_id: String,
    polling_id: String,
    state: String,
}

#[derive(Deserialize)]
pub struct TokenPollingRequest {
    #[serde(alias = "pid")]
    poll_id: String,
}

#[derive(Serialize)]
pub struct TokenResponse {
    #[serde(rename = "firebase_id_token")]
    id_token: String,
    #[serde(rename = "firebase_uid")]
    firebase_uid: String,
}

#[derive(Deserialize)]
pub struct FirebaseTokenRefreshRequest {
    refresh_token: Option<String>,
    user_id: Option<String>,
}

// Serve the login page
pub async fn serve_login_page(
    tera: web::Data<Tera>,
    query: web::Query<LoginViaWebQuery>,
    state_store: web::Data<StateStore>,
) -> Result<HttpResponse, AppError> {
    let pid = &query.pid;
    let state = &query.state;
    let provider = &query.provider;
    
    // Validate the polling ID is a valid UUID
    let _poll_uuid = Uuid::parse_str(pid)
        .map_err(|_| AppError::BadRequest("Invalid polling ID format".to_string()))?;
    
    // Store the Tauri-generated state with the polling ID
    state_store.insert(
        pid.clone(),
        StateValue {
            state: state.clone(),
            created_at: Utc::now(),
        },
    );
    
    // Prepare template context
    let mut context = tera::Context::new();
    
    // Get Firebase config from environment
    let firebase_api_key = std::env::var("FIREBASE_API_KEY")
        .unwrap_or_else(|_| "YOUR_FIREBASE_API_KEY".to_string());
    let firebase_auth_domain = std::env::var("FIREBASE_AUTH_DOMAIN")
        .unwrap_or_else(|_| "your-project.firebaseapp.com".to_string());
    let firebase_project_id = std::env::var("FIREBASE_PROJECT_ID")
        .unwrap_or_else(|_| "your-project-id".to_string());
    
    context.insert("firebase_api_key", &firebase_api_key);
    context.insert("firebase_auth_domain", &firebase_auth_domain);
    context.insert("firebase_project_id", &firebase_project_id);
    
    // Render the template - note that pid, state, and provider will be read from
    // window.location.search in the JavaScript, so we don't need to pass them directly
    let rendered = tera.render("login.html", &context)
        .map_err(|e| {
            error!("Template rendering error: {}", e);
            AppError::Internal(format!("Template rendering error: {}", e))
        })?;
    
    info!("Serving login page for provider: {}, pid: {}", provider, pid);
    
    Ok(HttpResponse::Ok()
        .content_type("text/html; charset=utf-8")
        .body(rendered))
}

// Capture tokens from the browser
pub async fn capture_provider_token(
    web::Json(req): web::Json<ProviderTokenCaptureRequest>,
    polling_store: web::Data<PollingStore>,
    state_store: web::Data<StateStore>,
    user_repository: web::Data<UserRepository>,
    firebase_oauth: web::Data<FirebaseOAuthService>,
) -> Result<HttpResponse, AppError> {
    // Validate state parameter for CSRF protection
    let state_value = match state_store.remove(&req.polling_id) {
        Some((_, value)) => value,
        None => {
            warn!("No state value found for polling ID: {}", req.polling_id);
            return Err(AppError::Unauthorized("Invalid polling ID or expired session".to_string()));
        }
    };
    
    // Compare the stored state with the one provided in the request
    if state_value.state != req.state {
        warn!("State mismatch for polling ID: {}", req.polling_id);
        return Err(AppError::Unauthorized("Invalid state parameter".to_string()));
    }
    
    // Exchange OAuth provider's ID token for Firebase tokens
    let firebase_auth_response = firebase_oauth.sign_in_with_idp(
        &req.provider_id_token,
        &req.oauth_provider_id,
        "http://localhost", // Generic request URI
        true,  // Return secure token
        true   // Return IdP credential
    ).await.map_err(|e| {
        error!("Failed to exchange provider token for Firebase tokens: {}", e);
        AppError::Unauthorized("Failed to authenticate with Firebase".to_string())
    })?;
    
    // Create or update the user in our database
    let user = user_repository.find_or_create_by_firebase_details(
        &firebase_auth_response.local_id,
        &firebase_auth_response.email,
        firebase_auth_response.display_name.as_deref(),
    ).await?;
    
    // Store the refresh token if enabled
    if let Err(e) = user_repository.store_firebase_refresh_token(&user.id, &firebase_auth_response.refresh_token).await {
        error!("Failed to store Firebase refresh token: {}", e);
        // Continue without failing, as this is not critical
    }
    
    // Store Firebase tokens in polling store
    polling_store.insert(
        req.polling_id.clone(),
        FirebasePendingTokens {
            id_token: firebase_auth_response.id_token.clone(),
            refresh_token: firebase_auth_response.refresh_token.clone(),
            created_at: Utc::now(),
            provider: req.oauth_provider_id.clone(),
            firebase_uid: firebase_auth_response.local_id.clone(), // Added
        },
    );
    
    info!("Firebase tokens captured and stored for polling ID: {}", req.polling_id);
    
    Ok(HttpResponse::Ok().json("success"))
}

// Handle polling for tokens
pub async fn get_firebase_token_for_polling(
    web::Query(req): web::Query<TokenPollingRequest>,
    polling_store: web::Data<PollingStore>,
) -> Result<HttpResponse, AppError> {
    // Look for tokens in the polling store
    if let Some((_, tokens)) = polling_store.remove(&req.poll_id) {
        // Return the tokens
        return Ok(HttpResponse::Ok().json(TokenResponse {
            id_token: tokens.id_token,
            firebase_uid: tokens.firebase_uid,
        }));
    }
    
    // If no tokens found, return a "not ready" response with a 204 status code
    Ok(HttpResponse::NoContent().finish())
}

#[derive(Serialize)]
pub struct FirebaseIdTokenRefreshResponse {
    firebase_id_token: String,
}

// Refresh Firebase ID token using stored refresh token
pub async fn refresh_firebase_id_token_handler(
    user_id_from_jwt: web::ReqData<crate::middleware::secure_auth::UserId>,
    firebase_oauth: web::Data<FirebaseOAuthService>,
    user_repository: web::Data<UserRepository>,
) -> Result<HttpResponse, AppError> {
    // Extract user ID from JWT
    let app_user_id = user_id_from_jwt.into_inner().0;
    
    // Get the stored refresh token for this app user
    let refresh_token = match user_repository.get_firebase_refresh_token(&app_user_id).await? {
        Some(token) => token,
        None => return Err(AppError::NotFound("No Firebase refresh token found for this user".to_string())),
    };
    
    // Exchange refresh token for new Firebase ID token
    let new_tokens = firebase_oauth.refresh_id_token(&refresh_token).await
        .map_err(|e| {
            error!("Failed to refresh Firebase ID token: {}", e);
            AppError::Unauthorized("Failed to refresh token".to_string())
        })?;
    
    // Store the new refresh token if one was provided
    if let Some(new_refresh_token) = &new_tokens.refresh_token {
        if let Err(e) = user_repository.store_firebase_refresh_token(&app_user_id, new_refresh_token).await {
            error!("Failed to update Firebase refresh token: {}", e);
            // Continue without failing, as this is not critical
        }
    }
    
    // Return the new Firebase ID token
    Ok(HttpResponse::Ok().json(FirebaseIdTokenRefreshResponse {
        firebase_id_token: new_tokens.id_token,
    }))
}

// Serve login.js asset
pub async fn serve_login_js_asset() -> Result<NamedFile, AppError> {
    let path: PathBuf = [env!("CARGO_MANIFEST_DIR"), "src", "web_auth_assets", "login.js"]
        .iter()
        .collect();
    NamedFile::open(path)
        .map_err(|e| AppError::Internal(format!("Failed to serve login.js: {}", e)))
}
