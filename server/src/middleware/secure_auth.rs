use actix_web::{Error, HttpMessage, dev::ServiceRequest};
use actix_web_httpauth::{extractors::bearer::BearerAuth, middleware::HttpAuthentication};
use chrono::{DateTime, Utc};
use log::{debug, error, info, warn};
use std::collections::HashSet;
use std::sync::{
    Arc, OnceLock,
    atomic::{AtomicBool, Ordering},
};
use uuid::Uuid;

use crate::db::repositories::RevokedTokenRepository;
use crate::db::repositories::user_repository::UserRepository;
use crate::error::AppError;
use crate::models::AuthenticatedUser;
use crate::security::rls_session_manager::RLSSessionManager;
use crate::security::token_binding::extract_token_binding_hash_from_service_request;
use crate::services::auth::jwt;

static RLS_MANAGER: OnceLock<Arc<RLSSessionManager>> = OnceLock::new();
static REVOKED_TOKEN_REPO: OnceLock<Arc<RevokedTokenRepository>> = OnceLock::new();
static USER_REPO: OnceLock<Arc<UserRepository>> = OnceLock::new();
static AUTH_INIT_LOGGED: AtomicBool = AtomicBool::new(false);

fn get_rls_manager() -> Option<Arc<RLSSessionManager>> {
    RLS_MANAGER.get().cloned()
}

fn set_rls_manager(manager: Arc<RLSSessionManager>) {
    let _ = RLS_MANAGER.set(manager);
}

fn get_revoked_token_repo() -> Option<Arc<RevokedTokenRepository>> {
    REVOKED_TOKEN_REPO.get().cloned()
}

fn set_revoked_token_repo(repo: Arc<RevokedTokenRepository>) {
    let _ = REVOKED_TOKEN_REPO.set(repo);
}

fn set_user_repo(repo: Arc<UserRepository>) {
    let _ = USER_REPO.set(repo);
}

fn get_user_repo() -> Option<Arc<UserRepository>> {
    USER_REPO.get().cloned()
}

/// Validates token expiry with grace period
fn validate_token_expiry(claims: &crate::models::auth_jwt_claims::Claims) -> Result<(), AppError> {
    let now = Utc::now().timestamp() as usize;

    if claims.exp <= now {
        return Err(AppError::Auth(format!(
            "Token expired: {} <= {}",
            claims.exp, now
        )));
    }

    // Check if token is too old (issued more than 24 hours ago)
    let max_age = 24 * 60 * 60; // 24 hours in seconds
    if now > claims.iat && (now - claims.iat) > max_age {
        return Err(AppError::Auth(format!(
            "Token too old: issued {} seconds ago",
            now - claims.iat
        )));
    }

    debug!("Token expiry validation successful");
    Ok(())
}

/// Validates issuer claim
fn validate_issuer(claims: &crate::models::auth_jwt_claims::Claims) -> Result<(), AppError> {
    match &claims.iss {
        Some(issuer) => {
            let expected_issuers = vec![
                "https://plantocode.us.auth0.com/",
                "https://api-us.plantocode.com",
                "plantocode",
            ];

            if !expected_issuers.contains(&issuer.as_str()) {
                return Err(AppError::Auth(format!("Invalid issuer: {}", issuer)));
            }
        }
        None => {
            return Err(AppError::Auth("Missing issuer claim".to_string()));
        }
    }

    debug!("Issuer validation successful: {:?}", claims.iss);
    Ok(())
}

/// Validates audience claim
fn validate_audience(claims: &crate::models::auth_jwt_claims::Claims) -> Result<(), AppError> {
    match &claims.aud {
        Some(audience) => {
            let expected_audiences = vec![
                "plantocode-api",
                "https://api-us.plantocode.com",
                "https://plantocode.com", // Auth0 audience
            ];

            if !expected_audiences.contains(&audience.as_str()) {
                return Err(AppError::Auth(format!("Invalid audience: {}", audience)));
            }
        }
        None => {
            return Err(AppError::Auth("Missing audience claim".to_string()));
        }
    }

    debug!("Audience validation successful: {:?}", claims.aud);
    Ok(())
}

/// Validates scopes
fn validate_scopes(
    claims: &crate::models::auth_jwt_claims::Claims,
    required_scopes: &[&str],
) -> Result<(), AppError> {
    if required_scopes.is_empty() {
        return Ok(());
    }

    let token_scopes = match &claims.scope {
        Some(scope_str) => scope_str.split_whitespace().collect::<HashSet<_>>(),
        None => {
            return Err(AppError::Auth("Missing scope claim".to_string()));
        }
    };

    for required_scope in required_scopes {
        if !token_scopes.contains(required_scope) {
            return Err(AppError::Auth(format!(
                "Missing required scope: {}",
                required_scope
            )));
        }
    }

    debug!("Scope validation successful");
    Ok(())
}

/// Validates device binding and token binding
fn validate_device_binding(
    req: &ServiceRequest,
    claims: &crate::models::auth_jwt_claims::Claims,
) -> Result<(), AppError> {
    let request_id = format!(
        "auth_{}_{}",
        chrono::Utc::now().timestamp_millis(),
        uuid::Uuid::new_v4()
    );

    // Device binding validation
    let device_id_header = req
        .headers()
        .get("x-device-id")
        .and_then(|h| h.to_str().ok());

    match (&claims.device_id, device_id_header) {
        (Some(jwt_device_id), Some(header_device_id)) => {
            if jwt_device_id != header_device_id {
                error!(
                    "Device ID mismatch for request_id: {}",
                    request_id
                );
                return Err(AppError::Auth(
                    "Device ID mismatch".to_string()
                ));
            }
            // Device binding validation successful
        }
        (Some(jwt_device_id), None) => {
            error!(
                "Missing X-Device-ID header for device-bound token, request_id: {}",
                request_id
            );
            return Err(AppError::Auth(
                "Missing X-Device-ID header for device-bound token".to_string(),
            ));
        }
        (None, _) => {
            // No device binding required
            debug!(
                "No device binding required for this token, request_id: {}",
                request_id
            );
        }
    }

    // Token binding validation
    if let Some(jwt_token_binding_hash) = &claims.tbh {
        match extract_token_binding_hash_from_service_request(req) {
            Ok(request_token_binding_hash) => {
                if jwt_token_binding_hash != &request_token_binding_hash {
                    error!(
                        "Token binding hash mismatch for request_id: {}",
                        request_id
                    );
                    return Err(AppError::Auth(
                        "Token binding validation failed".to_string(),
                    ));
                }
                // Token binding validation successful
            }
            Err(e) => {
                error!(
                    "Token binding validation failed - rejecting request. request_id: {} - error: {}",
                    request_id, e
                );
                return Err(AppError::Auth(
                    "Token binding validation failed".to_string(),
                ));
            }
        }
    } else {
        debug!(
            "No token binding hash in JWT claims, skipping token binding validation for request_id: {}",
            request_id
        );
    }

    debug!(
        "Device and token binding validation successful for request_id: {}",
        request_id
    );
    Ok(())
}

/// Validates IP binding
fn validate_ip_binding(
    req: &ServiceRequest,
    claims: &crate::models::auth_jwt_claims::Claims,
) -> Result<(), AppError> {
    if let Some(bound_ip) = &claims.ip_binding {
        let client_ip = extract_client_ip(req);

        if &client_ip != bound_ip {
            return Err(AppError::Auth(format!(
                "IP binding mismatch: current '{}' vs bound '{}'",
                client_ip, bound_ip
            )));
        }

        debug!("IP binding validation successful: {}", bound_ip);
    }

    Ok(())
}

/// Extracts client IP from request
fn extract_client_ip(req: &ServiceRequest) -> String {
    if let Some(forwarded_for) = req.headers().get("x-forwarded-for") {
        if let Ok(forwarded_str) = forwarded_for.to_str() {
            if let Some(first_ip) = forwarded_str.split(',').next() {
                return first_ip.trim().to_string();
            }
        }
    }

    if let Some(real_ip) = req.headers().get("x-real-ip") {
        if let Ok(real_ip_str) = real_ip.to_str() {
            return real_ip_str.to_string();
        }
    }

    if let Some(peer_addr) = req.peer_addr() {
        peer_addr.ip().to_string()
    } else {
        "unknown".to_string()
    }
}

pub async fn validator(
    req: ServiceRequest,
    credentials: BearerAuth,
) -> Result<ServiceRequest, (Error, ServiceRequest)> {
    let token = credentials.token();
    let path = req.path().to_string();

    if req.method() == actix_web::http::Method::OPTIONS {
        debug!("Skipping authentication for OPTIONS request to: {}", path);
        return Ok(req);
    }

    debug!("Validating Bearer token for path: {}", path);

    let verify_result = jwt::verify_token(token);

    match verify_result {
        Ok(claims) => {
            // Comprehensive validation chain
            if let Err(e) = validate_token_expiry(&claims) {
                error!("Token expiry validation failed for path {}: {}", path, e);
                return Err((
                    Error::from(actix_web::error::ErrorUnauthorized("Token expired")),
                    req,
                ));
            }

            if let Err(e) = validate_issuer(&claims) {
                error!("Issuer validation failed for path {}: {}", path, e);
                return Err((
                    Error::from(actix_web::error::ErrorUnauthorized("Invalid issuer")),
                    req,
                ));
            }

            if let Err(e) = validate_audience(&claims) {
                error!("Audience validation failed for path {}: {}", path, e);
                return Err((
                    Error::from(actix_web::error::ErrorUnauthorized("Invalid audience")),
                    req,
                ));
            }

            // Device binding validation
            if let Err(e) = validate_device_binding(&req, &claims) {
                error!("Device binding validation failed for path {}: {}", path, e);
                return Err((
                    Error::from(actix_web::error::ErrorUnauthorized(
                        "Device binding validation failed",
                    )),
                    req,
                ));
            }

            // IP binding validation
            if let Err(e) = validate_ip_binding(&req, &claims) {
                error!("IP binding validation failed for path {}: {}", path, e);
                return Err((
                    Error::from(actix_web::error::ErrorUnauthorized(
                        "IP binding validation failed",
                    )),
                    req,
                ));
            }

            // Required scopes: GET -> ["read"]; non-GET -> ["read","write"]; admin routes -> ["admin"]
            let required_scopes = if path.starts_with("/api/v1/admin") {
                vec!["admin"]
            } else if req.method() == actix_web::http::Method::GET {
                vec!["read"]
            } else {
                vec!["read", "write"]
            };

            if let Err(e) = validate_scopes(&claims, &required_scopes) {
                log::error!("Authorization error: missing required scopes: {:?}, required={:?}", e, required_scopes);
                return Err((
                    Error::from(actix_web::error::ErrorUnauthorized("Missing required scope(s)")),
                    req,
                ));
            }

            let user_id = match Uuid::parse_str(&claims.sub) {
                Ok(uuid) => uuid,
                Err(_) => {
                    error!("Invalid user ID format in token: {}", claims.sub);
                    return Err((
                        Error::from(actix_web::error::ErrorUnauthorized(
                            "Invalid user ID format in token",
                        )),
                        req,
                    ));
                }
            };

            let user_role = claims.role.clone();
            let user_email = claims.email.clone();

            // Check if token is revoked
            if let Some(revoked_token_repo) = get_revoked_token_repo() {
                match revoked_token_repo.is_revoked(&claims.jti).await {
                    Ok(true) => {
                        warn!(
                            "Revoked token access attempt for user {} with jti: {}",
                            user_id, claims.jti
                        );
                        return Err((
                            Error::from(actix_web::error::ErrorUnauthorized(
                                "Token has been revoked",
                            )),
                            req,
                        ));
                    }
                    Ok(false) => {
                        debug!("Token jti {} is not revoked", claims.jti);
                    }
                    Err(e) => {
                        error!("Failed to check token revocation status: {}", e);
                        return Err((
                            Error::from(actix_web::error::ErrorInternalServerError(
                                "Failed to verify token status",
                            )),
                            req,
                        ));
                    }
                }
            }

            // Token binding validation is now handled in validate_device_binding function

            // Auto-provision user for cross-region support
            let original_user_id = Uuid::parse_str(&claims.sub).ok();
            let user_repo = match get_user_repo() {
                Some(repo) => repo,
                None => {
                    error!("User repository not initialized");
                    return Err((
                        Error::from(actix_web::error::ErrorInternalServerError(
                            "User repository not initialized",
                        )),
                        req,
                    ));
                }
            };

            let effective_user_id = if let Some(id) = original_user_id {
                if user_repo.get_by_id(&id).await.is_ok() {
                    id
                } else if let Some(auth0_sub) = &claims.auth0_sub {
                    match user_repo
                        .find_or_create_by_auth0_details(auth0_sub, &claims.email, None)
                        .await
                    {
                        Ok(user) => user.id,
                        Err(e) => {
                            error!("Failed to find/create user by auth0_sub: {}", e);
                            return Err((
                                Error::from(actix_web::error::ErrorInternalServerError(
                                    "Failed to establish user context",
                                )),
                                req,
                            ));
                        }
                    }
                } else {
                    match user_repo.get_by_email(&claims.email).await {
                        Ok(user) => user.id,
                        Err(_) => {
                            match user_repo
                                .create(&claims.email, None, None, None, Some(&claims.role))
                                .await
                            {
                                Ok(user_id) => user_id,
                                Err(e) => {
                                    error!("Failed to create user: {}", e);
                                    return Err((
                                        Error::from(actix_web::error::ErrorInternalServerError(
                                            "Failed to create user",
                                        )),
                                        req,
                                    ));
                                }
                            }
                        }
                    }
                }
            } else if let Some(auth0_sub) = &claims.auth0_sub {
                match user_repo
                    .find_or_create_by_auth0_details(auth0_sub, &claims.email, None)
                    .await
                {
                    Ok(user) => user.id,
                    Err(e) => {
                        error!("Failed to find/create user by auth0_sub: {}", e);
                        return Err((
                            Error::from(actix_web::error::ErrorInternalServerError(
                                "Failed to establish user context",
                            )),
                            req,
                        ));
                    }
                }
            } else {
                match user_repo.get_by_email(&claims.email).await {
                    Ok(user) => user.id,
                    Err(_) => {
                        match user_repo
                            .create(&claims.email, None, None, None, Some(&claims.role))
                            .await
                        {
                            Ok(user_id) => user_id,
                            Err(e) => {
                                error!("Failed to create user: {}", e);
                                return Err((
                                    Error::from(actix_web::error::ErrorInternalServerError(
                                        "Failed to create user",
                                    )),
                                    req,
                                ));
                            }
                        }
                    }
                }
            };

            debug!(
                "JWT valid for user {} (Role: {}) for route {}",
                user_id, user_role, path
            );

            if let Some(rls_manager) = get_rls_manager() {
                let request_id = format!(
                    "auth_{}_{}",
                    chrono::Utc::now().timestamp_millis(),
                    uuid::Uuid::new_v4()
                );

                match rls_manager
                    .get_connection_with_user_context(effective_user_id, Some(request_id.clone()))
                    .await
                {
                    Ok(_conn) => {
                        debug!(
                            "RLS Session Manager successfully configured user context for user {} on route {} (request: {})",
                            user_id, path, request_id
                        );
                    }
                    Err(e) => {
                        error!(
                            "CRITICAL RLS SETUP FAILURE: RLS Session Manager failed to establish user context for user {}. Path: {}. Request: {}. Error: {}",
                            user_id, path, request_id, e
                        );
                        error!(
                            "This failure prevents secure database access and indicates a critical security issue"
                        );
                        return Err((
                            Error::from(actix_web::error::ErrorInternalServerError(format!(
                                "Failed to establish secure user context: {}",
                                e
                            ))),
                            req,
                        ));
                    }
                }
            }

            let authenticated_user = AuthenticatedUser {
                user_id: effective_user_id,
                email: user_email,
                role: user_role,
                device_id: claims.device_id.clone(),
                authenticated_via_api_key: false,
                api_key_id: None,
                api_key_label: None,
            };

            req.extensions_mut().insert(authenticated_user);

            Ok(req)
        }
        Err(e) => {
            error!("JWT validation failed for route {}: {}", path, e);
            match e {
                AppError::Auth(msg) => {
                    Err((Error::from(actix_web::error::ErrorUnauthorized(msg)), req))
                }
                _ => Err((
                    Error::from(actix_web::error::ErrorInternalServerError(
                        "Internal authentication error",
                    )),
                    req,
                )),
            }
        }
    }
}

pub fn auth_middleware(
    user_pool: sqlx::PgPool,
    system_pool: sqlx::PgPool,
) -> HttpAuthentication<
    actix_web_httpauth::extractors::bearer::BearerAuth,
    fn(
        ServiceRequest,
        BearerAuth,
    ) -> std::pin::Pin<
        Box<dyn std::future::Future<Output = Result<ServiceRequest, (Error, ServiceRequest)>>>,
    >,
> {
    if AUTH_INIT_LOGGED
        .compare_exchange(false, true, Ordering::SeqCst, Ordering::SeqCst)
        .is_ok()
    {
        debug!(
            "Initializing auth middleware with RLS Session Manager and Revoked Token Repository"
        );
    }
    let rls_manager = Arc::new(RLSSessionManager::new(user_pool.clone()));
    rls_manager.start_cleanup_task();
    set_rls_manager(rls_manager);

    // Use system pool for revoked tokens table access (requires elevated permissions)
    let revoked_token_repo = Arc::new(RevokedTokenRepository::new(system_pool.clone()));
    set_revoked_token_repo(revoked_token_repo);

    let user_repo = Arc::new(UserRepository::new(system_pool.clone()));
    set_user_repo(user_repo);

    HttpAuthentication::bearer(|req, creds| Box::pin(validator(req, creds)))
}
