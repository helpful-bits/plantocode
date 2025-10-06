use crate::auth_stores::{
    Auth0PendingCodeInfo, Auth0StateStore, Auth0StateStoreValue, PollingStore,
};
use crate::error::AppError;
use crate::models::AuthenticatedUser;
use crate::models::runtime_config::AppState;
use crate::security::encryption;
use crate::services::auth::oauth::Auth0OAuthService;
use crate::services::billing_service::BillingService;
use actix_web::{HttpRequest, HttpResponse, Result, web};
use chrono::Utc;
use log::{debug, error, info, warn};
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use uuid::Uuid;

#[derive(Deserialize)]
pub struct InitiateLoginQuery {
    pub pid: String,
    pub csrf_tauri: String,
    pub challenge: String,
    pub challenge_method: String,
    pub client_id: String,
    pub audience: String,
    pub scope: String,
    pub redirect_uri: String,
    pub connection: Option<String>,
}

#[derive(Deserialize)]
pub struct Auth0CallbackQuery {
    pub code: String,
    pub state: String,
}

#[derive(Deserialize)]
pub struct PollStatusQuery {
    pub pid: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PollStatusResponse {
    pub status: String,
    pub authorization_code: String,
    pub tauri_csrf_token: String,
}

#[derive(Deserialize)]
pub struct FinalizeLoginRequest {
    pub auth0_id_token: String,
    pub auth0_refresh_token: Option<String>,
    pub device_id: Option<String>,
}

pub async fn initiate_auth0_login(
    query: web::Query<InitiateLoginQuery>,
    auth0_state_store: web::Data<Auth0StateStore>,
    app_state: web::Data<AppState>,
) -> Result<HttpResponse, AppError> {
    let auth0_server_state = Uuid::new_v4().to_string();

    let auth0_domain = &app_state.settings.api_keys.auth0_domain;

    auth0_state_store.insert(
        auth0_server_state.clone(),
        Auth0StateStoreValue {
            polling_id: query.pid.clone(),
            tauri_csrf_token: query.csrf_tauri.clone(),
            pkce_challenge: query.challenge.clone(),
            created_at: Utc::now(),
        },
    );

    let mut auth0_authorize_url = format!(
        "https://{}/authorize?response_type=code&client_id={}&redirect_uri={}&scope={}&audience={}&state={}&code_challenge={}&code_challenge_method={}",
        auth0_domain,
        query.client_id,
        query.redirect_uri,
        query.scope,
        query.audience,
        auth0_server_state,
        query.challenge,
        query.challenge_method
    );

    if let Some(conn) = &query.connection {
        use url::form_urlencoded;
        let encoded_conn = form_urlencoded::byte_serialize(conn.as_bytes()).collect::<String>();
        auth0_authorize_url.push_str(&format!("&connection={}", encoded_conn));
    }

    info!("Initiating Auth0 login for polling ID: {}", query.pid);

    Ok(HttpResponse::Found()
        .append_header(("Location", auth0_authorize_url))
        .finish())
}

pub async fn handle_auth0_callback(
    query: web::Query<Auth0CallbackQuery>,
    polling_store: web::Data<PollingStore>,
    auth0_state_store: web::Data<Auth0StateStore>,
    app_state: web::Data<AppState>,
) -> Result<HttpResponse, AppError> {
    let state_value = match auth0_state_store.remove(&query.state) {
        Some((_, value)) => value,
        None => {
            warn!("No state value found for Auth0 state: {}", query.state);
            return Err(AppError::Unauthorized(
                "Invalid state or expired session".to_string(),
            ));
        }
    };

    polling_store.insert(
        state_value.polling_id.clone(),
        Auth0PendingCodeInfo {
            authorization_code: query.code.clone(),
            tauri_csrf_token: state_value.tauri_csrf_token,
            created_at: Utc::now(),
        },
    );

    let redirect_url = format!("{}/auth/callback", &app_state.settings.website_base_url);

    info!(
        "Auth0 callback processed for polling ID: {}",
        state_value.polling_id
    );

    Ok(HttpResponse::Found()
        .append_header(("Location", redirect_url))
        .finish())
}

pub async fn poll_auth_status(
    query: web::Query<PollStatusQuery>,
    polling_store: web::Data<PollingStore>,
) -> Result<HttpResponse, AppError> {
    if let Some((_, code_info)) = polling_store.remove(&query.pid) {
        return Ok(HttpResponse::Ok().json(PollStatusResponse {
            status: "ready".to_string(),
            authorization_code: code_info.authorization_code,
            tauri_csrf_token: code_info.tauri_csrf_token,
        }));
    }

    Ok(HttpResponse::NoContent().finish())
}

pub async fn finalize_auth0_login(
    auth_service: web::Data<Auth0OAuthService>,
    billing_service: web::Data<Arc<BillingService>>,
    token_request: web::Json<FinalizeLoginRequest>,
    req: HttpRequest,
) -> Result<HttpResponse, AppError> {
    // Validate the access token first
    let _access_token_claims = auth_service
        .validate_auth0_access_token(&token_request.auth0_id_token)
        .await?;

    // Get user info from Auth0 userinfo endpoint using the access token
    let user_info = auth_service
        .get_user_info_from_access_token(&token_request.auth0_id_token)
        .await?;

    let auth_response = auth_service
        .process_auth0_login(
            user_info,
            token_request.auth0_refresh_token.clone(),
            token_request.device_id.clone(),
        )
        .await?;

    info!(
        "Auth0 login finalized for user: {}",
        auth_response.user.email
    );

    // Grant initial signup credits if this is a new user
    // Parse the user ID from the response
    if let Ok(user_id) = Uuid::parse_str(&auth_response.user.id) {
        // Use the credit service from billing service to grant credits
        match billing_service
            .get_credit_service()
            .grant_initial_signup_credits(&user_id)
            .await
        {
            Ok(granted) => {
                if granted {
                    info!(
                        "Successfully granted signup credits to new user: {}",
                        auth_response.user.email
                    );
                } else {
                    debug!(
                        "User {} already has signup credits",
                        auth_response.user.email
                    );
                }
            }
            Err(e) => {
                // Log the error but don't fail the login
                error!(
                    "Failed to grant signup credits to user {}: {}",
                    auth_response.user.email, e
                );
                // Continue with login even if credit granting fails
            }
        }
    } else {
        error!(
            "Failed to parse user ID for credit granting: {}",
            auth_response.user.id
        );
    }

    Ok(HttpResponse::Ok().json(auth_response))
}

pub async fn refresh_app_token_auth0(
    user: web::ReqData<AuthenticatedUser>,
    auth_service: web::Data<Auth0OAuthService>,
    user_repo: web::Data<std::sync::Arc<crate::db::repositories::user_repository::UserRepository>>,
    app_state: web::Data<AppState>,
    req: HttpRequest,
) -> Result<HttpResponse, AppError> {
    let app_user_id = user.user_id;

    let encrypted_refresh_token = match user_repo.get_auth0_refresh_token(&app_user_id).await? {
        Some(token) => token,
        None => {
            return Err(AppError::NotFound(
                "No Auth0 refresh token found for this user".to_string(),
            ));
        }
    };

    let encryption_key = hex::decode(&app_state.settings.auth.refresh_token_encryption_key)
        .map_err(|_| {
            AppError::Configuration("Invalid refresh token encryption key format".to_string())
        })?;
    let refresh_token = encryption::decrypt(&encrypted_refresh_token, &encryption_key)?;
    let new_tokens = auth_service
        .exchange_auth0_refresh_token(&refresh_token)
        .await?;

    if let Some(new_refresh_token) = &new_tokens.refresh_token {
        let encrypted_new_token = encryption::encrypt(new_refresh_token, &encryption_key)?;
        if let Err(e) = user_repo
            .store_auth0_refresh_token(&app_user_id, &encrypted_new_token)
            .await
        {
            error!("Failed to update Auth0 refresh token: {}", e);
        }
    }

    // For refresh token flow, we can use the access token to get user info
    let _access_token_claims = auth_service
        .validate_auth0_access_token(&new_tokens.access_token)
        .await?;
    let user_info = auth_service
        .get_user_info_from_access_token(&new_tokens.access_token)
        .await?;

    // Extract device_id from header
    let device_id_from_header = req
        .headers()
        .get("x-device-id")
        .and_then(|v| v.to_str().ok())
        .map(|s| s.to_string());

    let auth_response = auth_service
        .process_auth0_login(user_info, new_tokens.refresh_token, device_id_from_header)
        .await?;

    Ok(HttpResponse::Ok().json(auth_response))
}
