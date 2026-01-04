use actix_web::{
    Error, HttpMessage,
    dev::{Service, ServiceRequest, ServiceResponse, Transform},
    error::ErrorUnauthorized,
};
use futures_util::future::{LocalBoxFuture, ok, Ready};
use log::{debug, error, info, warn};
use std::sync::{
    Arc, OnceLock,
    atomic::{AtomicBool, Ordering},
};
use std::task::{Context, Poll};
use uuid::Uuid;

use crate::db::repositories::api_key_repository::ApiKeyRepository;
use crate::db::repositories::user_repository::UserRepository;
use crate::db::repositories::RevokedTokenRepository;
use crate::error::AppError;
use crate::models::AuthenticatedUser;
use crate::models::auth_jwt_claims::Claims;
use crate::security::rls_session_manager::RLSSessionManager;
use crate::services::auth::jwt;

// Re-export validation helpers for use in other modules
pub use crate::middleware::jwt_validation::{
    validate_token_expiry, validate_issuer, validate_audience,
    validate_scopes, validate_device_binding, validate_ip_binding, extract_client_ip,
};
pub use crate::middleware::auth_types::ApiKeyIdentity;

// Static state shared across all requests
static RLS_MANAGER: OnceLock<Arc<RLSSessionManager>> = OnceLock::new();
static REVOKED_TOKEN_REPO: OnceLock<Arc<RevokedTokenRepository>> = OnceLock::new();
static API_KEY_REPO: OnceLock<Arc<ApiKeyRepository>> = OnceLock::new();
static USER_REPO: OnceLock<Arc<UserRepository>> = OnceLock::new();
static UNIFIED_AUTH_INIT_LOGGED: AtomicBool = AtomicBool::new(false);

// Getter/setter functions for static state
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

fn get_api_key_repo() -> Option<Arc<ApiKeyRepository>> {
    API_KEY_REPO.get().cloned()
}

fn set_api_key_repo(repo: Arc<ApiKeyRepository>) {
    let _ = API_KEY_REPO.set(repo);
}

fn get_user_repo() -> Option<Arc<UserRepository>> {
    USER_REPO.get().cloned()
}

fn set_user_repo(repo: Arc<UserRepository>) {
    let _ = USER_REPO.set(repo);
}

/// Extract API key from request headers
/// Priority: X-API-Key header first, then Authorization: ApiKey <key>
pub fn extract_api_key(req: &ServiceRequest) -> Option<String> {
    // Check X-API-Key header first (primary)
    if let Some(api_key_header) = req.headers().get("x-api-key") {
        if let Ok(api_key_str) = api_key_header.to_str() {
            return Some(api_key_str.to_string());
        }
    }

    // Check Authorization: ApiKey <value> header (secondary)
    if let Some(auth_header) = req.headers().get("authorization") {
        if let Ok(auth_str) = auth_header.to_str() {
            if auth_str.starts_with("ApiKey ") {
                return Some(auth_str[7..].to_string());
            }
        }
    }

    None
}

/// Extract Bearer token from Authorization header
pub fn extract_bearer_token(req: &ServiceRequest) -> Option<String> {
    if let Some(auth_header) = req.headers().get("authorization") {
        if let Ok(auth_str) = auth_header.to_str() {
            if auth_str.starts_with("Bearer ") {
                return Some(auth_str[7..].to_string());
            }
        }
    }

    None
}

/// Authenticate request using JWT Bearer token
async fn authenticate_via_jwt(
    req: &ServiceRequest,
    token: &str,
) -> Result<(), AppError> {
    let path = req.path().to_string();
    debug!("Authenticating via JWT for path: {}", path);

    // Verify and decode JWT
    let claims = jwt::verify_token(token)?;

    // Comprehensive validation chain
    validate_token_expiry(&claims)?;
    validate_issuer(&claims)?;
    validate_audience(&claims)?;
    validate_device_binding(req, &claims)?;
    validate_ip_binding(req, &claims)?;

    // Scope validation based on path and method
    let required_scopes = if path.starts_with("/api/v1/admin") {
        vec!["admin"]
    } else if req.method() == actix_web::http::Method::GET {
        vec!["read"]
    } else {
        vec!["read", "write"]
    };

    validate_scopes(&claims, &required_scopes)?;

    // Parse user ID from claims
    let user_id = Uuid::parse_str(&claims.sub)
        .map_err(|_| AppError::Auth("Invalid user ID format in token".to_string()))?;

    // Check if token is revoked
    if let Some(revoked_token_repo) = get_revoked_token_repo() {
        if revoked_token_repo.is_revoked(&claims.jti).await? {
            warn!(
                "Revoked token access attempt for user {} with jti: {}",
                user_id, claims.jti
            );
            return Err(AppError::Auth("Token has been revoked".to_string()));
        }
        debug!("Token jti {} is not revoked", claims.jti);
    }

    // Auto-provision user for cross-region support
    let user_repo = get_user_repo()
        .ok_or_else(|| AppError::Internal("User repository not initialized".to_string()))?;

    let effective_user_id = if user_repo.get_by_id(&user_id).await.is_ok() {
        user_id
    } else if let Some(auth0_sub) = &claims.auth0_sub {
        match user_repo
            .find_or_create_by_auth0_details(auth0_sub, &claims.email, None)
            .await
        {
            Ok(user) => user.id,
            Err(e) => {
                error!("Failed to find/create user by auth0_sub: {}", e);
                return Err(AppError::Internal("Failed to establish user context".to_string()));
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
                        return Err(AppError::Internal("Failed to create user".to_string()));
                    }
                }
            }
        }
    };

    debug!(
        "JWT valid for user {} (Role: {}) for route {}",
        user_id, claims.role, path
    );

    // Establish RLS context
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
                return Err(AppError::Internal(format!(
                    "Failed to establish secure user context: {}",
                    e
                )));
            }
        }
    }

    // Construct AuthenticatedUser with JWT authentication flag
    let authenticated_user = AuthenticatedUser {
        user_id: effective_user_id,
        email: claims.email.clone(),
        role: claims.role.clone(),
        device_id: claims.device_id.clone(),
        authenticated_via_api_key: false,
        api_key_id: None,
        api_key_label: None,
    };

    // Insert Claims into request extensions for handlers that need them for auditing
    req.extensions_mut().insert(claims);

    // Insert AuthenticatedUser into request extensions
    req.extensions_mut().insert(authenticated_user);

    Ok(())
}

/// Authenticate request using API key
async fn authenticate_via_api_key(
    req: &ServiceRequest,
    api_key: &str,
) -> Result<(), AppError> {
    let path = req.path().to_string();
    debug!("Authenticating via API key for path: {}", path);

    // Hash the API key
    let api_key_hash = crate::security::api_key_hashing::hash_api_key(api_key)?;

    // Get API key repository
    let api_key_repo = get_api_key_repo()
        .ok_or_else(|| AppError::Internal("API key repository not initialized".to_string()))?;

    // Look up API key by hash
    let api_key_record = match api_key_repo.find_active_by_hash(&api_key_hash).await? {
        Some(record) => record,
        None => {
            warn!("Invalid or inactive API key attempted for path: {}", path);
            return Err(AppError::Auth("Invalid or inactive API key".to_string()));
        }
    };

    // Get user repository
    let user_repo = get_user_repo()
        .ok_or_else(|| AppError::Internal("User repository not initialized".to_string()))?;

    // Load user by ID
    let user = user_repo.get_by_id(&api_key_record.user_id).await
        .map_err(|e| {
            error!(
                "Failed to load user {} for API key: {}",
                api_key_record.user_id, e
            );
            AppError::Internal("Failed to load user for API key".to_string())
        })?;

    // Determine effective role (use role_override if present, else user.role)
    let effective_role = api_key_record
        .role_override
        .clone()
        .unwrap_or_else(|| user.role.clone());

    debug!(
        "API key valid for user {} (Role: {}) for route {}",
        user.id, effective_role, path
    );

    // Establish RLS context
    if let Some(rls_manager) = get_rls_manager() {
        let request_id = format!(
            "api_key_auth_{}_{}",
            chrono::Utc::now().timestamp_millis(),
            uuid::Uuid::new_v4()
        );

        match rls_manager
            .get_connection_with_user_context(user.id, Some(request_id.clone()))
            .await
        {
            Ok(_conn) => {
                debug!(
                    "RLS Session Manager successfully configured user context for API key user {} on route {} (request: {})",
                    user.id, path, request_id
                );
            }
            Err(e) => {
                error!(
                    "CRITICAL RLS SETUP FAILURE: RLS Session Manager failed to establish user context for API key user {}. Path: {}. Request: {}. Error: {}",
                    user.id, path, request_id, e
                );
                return Err(AppError::Internal(format!(
                    "Failed to establish secure user context: {}",
                    e
                )));
            }
        }
    }

    // Fire-and-forget update usage (spawned task)
    let api_key_id = api_key_record.id;
    let api_key_repo_clone = api_key_repo.clone();
    tokio::spawn(async move {
        if let Err(e) = api_key_repo_clone.touch_usage(&api_key_id).await {
            warn!("Failed to update API key usage for {}: {}", api_key_id, e);
        }
    });

    // Construct AuthenticatedUser with API key authentication flag
    let authenticated_user = AuthenticatedUser {
        user_id: user.id,
        email: user.email.clone(),
        role: effective_role.clone(),
        device_id: None,
        authenticated_via_api_key: true,
        api_key_id: Some(api_key_record.id),
        api_key_label: api_key_record.label.clone(),
    };

    // Construct synthetic Claims for handlers that need them for auditing
    let now = chrono::Utc::now().timestamp() as usize;
    let synthetic_claims = Claims {
        sub: user.id.to_string(),
        exp: now + 3600,
        iat: now,
        iss: Some("api_key".to_string()),
        email: user.email.clone(),
        role: effective_role,
        auth0_sub: None,
        tbh: None,
        jti: format!("api_key_{}", api_key_record.id),
        aud: None,
        device_id: None,
        scope: Some("read write".to_string()),
        session_id: None,
        ip_binding: None,
    };

    // Insert Claims into request extensions
    req.extensions_mut().insert(synthetic_claims);

    // Insert AuthenticatedUser into request extensions
    req.extensions_mut().insert(authenticated_user);

    // Also insert ApiKeyIdentity for rate limiting
    let api_key_identity = ApiKeyIdentity {
        api_key_id: api_key_record.id,
        label: api_key_record.label.clone(),
    };
    req.extensions_mut().insert(api_key_identity);

    Ok(())
}

/// Main unified authentication validator
async fn unified_validator(req: ServiceRequest) -> Result<ServiceRequest, (Error, ServiceRequest)> {
    let path = req.path().to_string();

    // Skip authentication for OPTIONS requests (CORS preflight)
    if req.method() == actix_web::http::Method::OPTIONS {
        debug!("Skipping authentication for OPTIONS request to: {}", path);
        return Ok(req);
    }

    debug!("Validating credentials for path: {}", path);

    // Authentication precedence:
    // 1. API key (X-API-Key or Authorization: ApiKey)
    // 2. Bearer token (Authorization: Bearer)
    // 3. Error if neither present

    if let Some(api_key) = extract_api_key(&req) {
        // Authenticate via API key
        match authenticate_via_api_key(&req, &api_key).await {
            Ok(()) => {
                info!("API key authentication successful for path: {}", path);
                Ok(req)
            }
            Err(e) => {
                error!("API key authentication failed for path {}: {}", path, e);
                let error_message = match e {
                    AppError::Auth(msg) => msg,
                    _ => "API key authentication failed".to_string(),
                };
                Err((
                    Error::from(ErrorUnauthorized(
                        serde_json::json!({
                            "error": error_message
                        })
                        .to_string()
                    )),
                    req,
                ))
            }
        }
    } else if let Some(bearer_token) = extract_bearer_token(&req) {
        // Authenticate via JWT
        match authenticate_via_jwt(&req, &bearer_token).await {
            Ok(()) => {
                info!("JWT authentication successful for path: {}", path);
                Ok(req)
            }
            Err(e) => {
                error!("JWT authentication failed for path {}: {}", path, e);
                let error_message = match e {
                    AppError::Auth(msg) => msg,
                    _ => "JWT authentication failed".to_string(),
                };
                Err((
                    Error::from(ErrorUnauthorized(
                        serde_json::json!({
                            "error": error_message
                        })
                        .to_string()
                    )),
                    req,
                ))
            }
        }
    } else {
        // No credentials provided
        error!("No authentication credentials found for path: {}", path);
        Err((
            Error::from(ErrorUnauthorized(
                serde_json::json!({
                    "error": "Missing credentials"
                })
                .to_string()
            )),
            req,
        ))
    }
}

// Middleware transform implementation
pub struct UnifiedAuthMiddleware;

impl<S, B> Transform<S, ServiceRequest> for UnifiedAuthMiddleware
where
    S: Service<ServiceRequest, Response = ServiceResponse<B>, Error = Error> + 'static,
    S::Future: 'static,
    B: 'static,
{
    type Response = ServiceResponse<B>;
    type Error = Error;
    type Transform = UnifiedAuthMiddlewareService<S>;
    type InitError = ();
    type Future = Ready<Result<Self::Transform, Self::InitError>>;

    fn new_transform(&self, service: S) -> Self::Future {
        ok(UnifiedAuthMiddlewareService {
            service: std::rc::Rc::new(service)
        })
    }
}

pub struct UnifiedAuthMiddlewareService<S> {
    service: std::rc::Rc<S>,
}

impl<S, B> Service<ServiceRequest> for UnifiedAuthMiddlewareService<S>
where
    S: Service<ServiceRequest, Response = ServiceResponse<B>, Error = Error> + 'static,
    S::Future: 'static,
    B: 'static,
{
    type Response = ServiceResponse<B>;
    type Error = Error;
    type Future = LocalBoxFuture<'static, Result<Self::Response, Self::Error>>;

    fn poll_ready(&self, ctx: &mut Context<'_>) -> Poll<Result<(), Self::Error>> {
        self.service.poll_ready(ctx)
    }

    fn call(&self, req: ServiceRequest) -> Self::Future {
        let service = self.service.clone();

        Box::pin(async move {
            let req = unified_validator(req).await.map_err(|(err, _req)| err)?;
            let res = service.call(req).await?;
            Ok(res)
        })
    }
}

/// Middleware factory function for unified authentication
///
/// Handles both JWT (Bearer) and API key authentication based on headers.
/// Authentication precedence:
/// 1. If API key header is present → use API key authentication
/// 2. Else if Bearer token is present → use JWT authentication
/// 3. Else → return 401 "Missing credentials"
pub fn unified_auth_middleware(
    user_pool: sqlx::PgPool,
    system_pool: sqlx::PgPool,
) -> UnifiedAuthMiddleware {
    // Initialize static repositories and managers on first call
    if UNIFIED_AUTH_INIT_LOGGED
        .compare_exchange(false, true, Ordering::SeqCst, Ordering::SeqCst)
        .is_ok()
    {
        debug!("Initializing unified auth middleware with RLS Session Manager, API Key Repository, Revoked Token Repository, and User Repository");
    }

    // Initialize RLS manager with user pool
    let rls_manager = Arc::new(RLSSessionManager::new(user_pool.clone()));
    rls_manager.start_cleanup_task();
    set_rls_manager(rls_manager);

    // Initialize repositories with system pool
    let revoked_token_repo = Arc::new(RevokedTokenRepository::new(system_pool.clone()));
    set_revoked_token_repo(revoked_token_repo);

    let api_key_repo = Arc::new(ApiKeyRepository::new(system_pool.clone()));
    set_api_key_repo(api_key_repo);

    let user_repo = Arc::new(UserRepository::new(system_pool.clone()));
    set_user_repo(user_repo);

    UnifiedAuthMiddleware
}
