use actix_web::{Error, HttpMessage, dev::ServiceRequest};
use log::{debug, error, warn};
use std::sync::{Arc, OnceLock, atomic::{AtomicBool, Ordering}};
use uuid::Uuid;

use crate::db::repositories::api_key_repository::ApiKeyRepository;
use crate::db::repositories::user_repository::UserRepository;
use crate::error::AppError;
use crate::models::AuthenticatedUser;
use crate::security::rls_session_manager::RLSSessionManager;

static RLS_MANAGER: OnceLock<Arc<RLSSessionManager>> = OnceLock::new();
static API_KEY_REPO: OnceLock<Arc<ApiKeyRepository>> = OnceLock::new();
static USER_REPO: OnceLock<Arc<UserRepository>> = OnceLock::new();
static API_KEY_AUTH_INIT_LOGGED: AtomicBool = AtomicBool::new(false);

fn get_rls_manager() -> Option<Arc<RLSSessionManager>> {
    RLS_MANAGER.get().cloned()
}

fn set_rls_manager(manager: Arc<RLSSessionManager>) {
    let _ = RLS_MANAGER.set(manager);
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

/// Identity information for API key-authenticated requests
#[derive(Clone, Debug)]
pub struct ApiKeyIdentity {
    pub api_key_id: Uuid,
    pub label: Option<String>,
}

/// Extract API key from request headers
/// Priority: X-API-Key header, then Authorization: ApiKey header
fn extract_api_key(req: &ServiceRequest) -> Option<String> {
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

pub async fn api_key_validator(req: ServiceRequest) -> Result<ServiceRequest, (Error, ServiceRequest)> {
    let path = req.path().to_string();

    // Skip authentication for OPTIONS requests (CORS preflight)
    if req.method() == actix_web::http::Method::OPTIONS {
        debug!("Skipping API key authentication for OPTIONS request to: {}", path);
        return Ok(req);
    }

    debug!("Validating API key for path: {}", path);

    // Extract API key from headers
    let api_key = match extract_api_key(&req) {
        Some(key) => key,
        None => {
            error!("No API key found in request headers for path: {}", path);
            return Err((
                Error::from(actix_web::error::ErrorUnauthorized("Missing API key")),
                req,
            ));
        }
    };

    // Hash the API key
    let api_key_hash = match crate::security::api_key_hashing::hash_api_key(&api_key) {
        Ok(hash) => hash,
        Err(e) => {
            error!("Failed to hash API key: {}", e);
            return Err((
                Error::from(actix_web::error::ErrorInternalServerError("Authentication error")),
                req,
            ));
        }
    };

    // Get API key repository
    let api_key_repo = match get_api_key_repo() {
        Some(repo) => repo,
        None => {
            error!("API key repository not initialized");
            return Err((
                Error::from(actix_web::error::ErrorInternalServerError(
                    "API key repository not initialized",
                )),
                req,
            ));
        }
    };

    // Look up API key by hash
    let api_key_record = match api_key_repo.find_active_by_hash(&api_key_hash).await {
        Ok(Some(record)) => record,
        Ok(None) => {
            warn!("Invalid or inactive API key attempted for path: {}", path);
            return Err((
                Error::from(actix_web::error::ErrorUnauthorized("Invalid or inactive API key")),
                req,
            ));
        }
        Err(e) => {
            error!("Failed to look up API key: {}", e);
            return Err((
                Error::from(actix_web::error::ErrorInternalServerError(
                    "Failed to authenticate API key",
                )),
                req,
            ));
        }
    };

    // Get user repository
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

    // Load user by ID
    let user = match user_repo.get_by_id(&api_key_record.user_id).await {
        Ok(user) => user,
        Err(e) => {
            error!(
                "Failed to load user {} for API key: {}",
                api_key_record.user_id, e
            );
            return Err((
                Error::from(actix_web::error::ErrorInternalServerError(
                    "Failed to load user for API key",
                )),
                req,
            ));
        }
    };

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

    // Fire-and-forget update usage (spawned task)
    let api_key_id = api_key_record.id;
    let api_key_repo_clone = api_key_repo.clone();
    tokio::spawn(async move {
        if let Err(e) = api_key_repo_clone.touch_usage(&api_key_id).await {
            warn!("Failed to update API key usage for {}: {}", api_key_id, e);
        }
    });

    // Construct AuthenticatedUser
    let authenticated_user = AuthenticatedUser {
        user_id: user.id,
        email: user.email.clone(),
        role: effective_role,
        device_id: None,
        authenticated_via_api_key: true,
        api_key_id: Some(api_key_record.id),
        api_key_label: api_key_record.label.clone(),
    };

    // Insert AuthenticatedUser into request extensions
    req.extensions_mut().insert(authenticated_user);

    // Also insert ApiKeyIdentity for rate limiting
    let api_key_identity = ApiKeyIdentity {
        api_key_id: api_key_record.id,
        label: api_key_record.label.clone(),
    };
    req.extensions_mut().insert(api_key_identity);

    Ok(req)
}

/// Middleware factory function for API key authentication
pub fn api_key_middleware(
    user_pool: sqlx::PgPool,
    system_pool: sqlx::PgPool,
) -> actix_web_httpauth::middleware::HttpAuthentication<
    actix_web_httpauth::extractors::bearer::BearerAuth,
    fn(
        ServiceRequest,
        actix_web_httpauth::extractors::bearer::BearerAuth,
    ) -> std::pin::Pin<
        Box<dyn std::future::Future<Output = Result<ServiceRequest, (Error, ServiceRequest)>>>,
    >,
> {
    use actix_web_httpauth::middleware::HttpAuthentication;

    if API_KEY_AUTH_INIT_LOGGED
        .compare_exchange(false, true, Ordering::SeqCst, Ordering::SeqCst)
        .is_ok()
    {
        debug!("Initializing API key auth middleware with RLS Session Manager and API Key Repository");
    }

    // Initialize RLS manager with user pool
    let rls_manager = Arc::new(RLSSessionManager::new(user_pool.clone()));
    rls_manager.start_cleanup_task();
    set_rls_manager(rls_manager);

    // Initialize repositories with system pool
    let api_key_repo = Arc::new(ApiKeyRepository::new(system_pool.clone()));
    set_api_key_repo(api_key_repo);

    let user_repo = Arc::new(UserRepository::new(system_pool.clone()));
    set_user_repo(user_repo);

    // Use a wrapper that ignores the BearerAuth parameter since we extract from headers directly
    HttpAuthentication::bearer(|req, _creds| Box::pin(api_key_validator(req)))
}
