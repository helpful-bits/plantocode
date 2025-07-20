use actix_web::{dev::ServiceRequest, Error, HttpMessage};
use actix_web_httpauth::{
    extractors::bearer::BearerAuth,
    middleware::HttpAuthentication,
};
use log::{debug, error, warn};
use std::sync::{Arc, OnceLock, atomic::{AtomicBool, Ordering}};
use uuid::Uuid;

use crate::error::AppError;
use crate::models::AuthenticatedUser;
use crate::security::rls_session_manager::RLSSessionManager;
use crate::security::token_binding::{extract_token_binding_hash_from_service_request, TOKEN_BINDING_HEADER};
use crate::services::auth::jwt;
use crate::db::repositories::RevokedTokenRepository;

static RLS_MANAGER: OnceLock<Arc<RLSSessionManager>> = OnceLock::new();
static REVOKED_TOKEN_REPO: OnceLock<Arc<RevokedTokenRepository>> = OnceLock::new();
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

pub async fn validator(req: ServiceRequest, credentials: BearerAuth) -> Result<ServiceRequest, (Error, ServiceRequest)> {
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
            let user_id = match Uuid::parse_str(&claims.sub) {
                Ok(uuid) => uuid,
                Err(_) => {
                    error!("Invalid user ID format in token: {}", claims.sub);
                    return Err((Error::from(actix_web::error::ErrorUnauthorized("Invalid user ID format in token")), req));
                }
            };
            
            let user_role = claims.role.clone();
            let user_email = claims.email.clone();
            
            // Check if token is revoked
            if let Some(revoked_token_repo) = get_revoked_token_repo() {
                match revoked_token_repo.is_revoked(&claims.jti).await {
                    Ok(true) => {
                        warn!("Revoked token access attempt for user {} with jti: {}", user_id, claims.jti);
                        return Err((Error::from(actix_web::error::ErrorUnauthorized("Token has been revoked")), req));
                    },
                    Ok(false) => {
                        debug!("Token jti {} is not revoked", claims.jti);
                    },
                    Err(e) => {
                        error!("Failed to check token revocation status: {}", e);
                        return Err((Error::from(actix_web::error::ErrorInternalServerError("Failed to verify token status")), req));
                    }
                }
            }

            if let Some(token_binding_hash_claim) = &claims.tbh {
                match extract_token_binding_hash_from_service_request(&req) {
                    Ok(request_binding_hash) => {
                        if token_binding_hash_claim == &request_binding_hash {
                            debug!("Token binding verified successfully for user {} on path {}", user_id, path);
                        } else {
                            warn!(
                                "Token binding mismatch for user {} on path {}. Claim_TBH: '{}', Request_Header_TBH: '{}'",
                                user_id, path, token_binding_hash_claim, request_binding_hash
                            );
                            return Err((Error::from(actix_web::error::ErrorUnauthorized("Token binding verification failed: mismatch")), req));
                        }
                    }
                    Err(AppError::Auth(msg)) if msg.contains(&format!("Missing or invalid {} header", TOKEN_BINDING_HEADER)) => {
                        warn!(
                            "Token binding verification failed for user {} on path {}. Header '{}' missing or invalid.",
                            user_id, path, TOKEN_BINDING_HEADER
                        );
                        return Err((Error::from(actix_web::error::ErrorUnauthorized("Token binding verification failed: header issue")), req));
                    }
                    Err(e) => {
                        error!("Unexpected error during token binding hash extraction for user {} on path {}: {}", user_id, path, e);
                        return Err((Error::from(actix_web::error::ErrorInternalServerError("Token binding internal error")), req));
                    }
                }
            }

            debug!("JWT valid for user {} (Role: {}) for route {}", user_id, user_role, path);
            
            if let Some(rls_manager) = get_rls_manager() {
                let request_id = format!("auth_{}_{}", chrono::Utc::now().timestamp_millis(), uuid::Uuid::new_v4());
                
                match rls_manager.get_connection_with_user_context(user_id, Some(request_id.clone())).await {
                    Ok(_conn) => {
                        debug!("RLS Session Manager successfully configured user context for user {} on route {} (request: {})", 
                               user_id, path, request_id);
                    },
                    Err(e) => {
                        error!("CRITICAL RLS SETUP FAILURE: RLS Session Manager failed to establish user context for user {}. Path: {}. Request: {}. Error: {}", 
                               user_id, path, request_id, e);
                        error!("This failure prevents secure database access and indicates a critical security issue");
                        return Err((Error::from(actix_web::error::ErrorInternalServerError(
                            format!("Failed to establish secure user context: {}", e)
                        )), req));
                    }
                }
            }
            
            let authenticated_user = AuthenticatedUser {
                user_id,
                email: user_email,
                role: user_role,
            };
            
            req.extensions_mut().insert(authenticated_user);
            
            Ok(req)
        },
        Err(e) => {
            error!("JWT validation failed for route {}: {}", path, e);
            match e {
                AppError::Auth(msg) => {
                    Err((Error::from(actix_web::error::ErrorUnauthorized(msg)), req))
                },
                _ => Err((Error::from(actix_web::error::ErrorInternalServerError("Internal authentication error")), req))
            }
        }
    }
}

pub fn auth_middleware(user_pool: sqlx::PgPool, system_pool: sqlx::PgPool) -> HttpAuthentication<actix_web_httpauth::extractors::bearer::BearerAuth, fn(ServiceRequest, BearerAuth) -> std::pin::Pin<Box<dyn std::future::Future<Output = Result<ServiceRequest, (Error, ServiceRequest)>>>>> {
    if AUTH_INIT_LOGGED.compare_exchange(false, true, Ordering::SeqCst, Ordering::SeqCst).is_ok() {
        debug!("Initializing auth middleware with RLS Session Manager and Revoked Token Repository");
    }
    let rls_manager = Arc::new(RLSSessionManager::new(user_pool.clone()));
    rls_manager.start_cleanup_task();
    set_rls_manager(rls_manager);
    
    // Use system pool for revoked tokens table access (requires elevated permissions)
    let revoked_token_repo = Arc::new(RevokedTokenRepository::new(system_pool));
    set_revoked_token_repo(revoked_token_repo);
    
    HttpAuthentication::bearer(|req, creds| Box::pin(validator(req, creds)))
}