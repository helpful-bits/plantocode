use actix_web::{
    dev::{Service, ServiceRequest, ServiceResponse, Transform},
    http::{header::AUTHORIZATION, StatusCode},
    Error, HttpMessage,
};
use futures_util::future::{ok, ready, Ready};
use std::future::Future;
use std::pin::Pin;
use std::sync::Arc;
use std::task::{Context, Poll};
use log::{debug, error, warn};
use uuid::Uuid;

use crate::error::AppError;
use crate::services::auth::jwt;
use crate::security::token_binding::{extract_token_binding_hash_from_service_request, TOKEN_BINDING_HEADER};
use crate::security::rls_session_manager::RLSSessionManager;
use crate::models::auth_jwt_claims::Claims;

// Marker struct to indicate request has already been processed by auth middleware
#[derive(Debug)]
struct AuthProcessed;

// Define types to extract User ID and Role after successful authentication
#[derive(Debug, Clone, Copy)] pub struct UserId(pub Uuid);
#[derive(Debug, Clone)] pub struct UserRole(pub String);
#[derive(Debug, Clone)] pub struct UserEmail(pub String);

// Implement FromRequest for UserId to extract it in handlers
impl actix_web::FromRequest for UserId {
    type Error = actix_web::Error;
    type Future = std::pin::Pin<Box<dyn std::future::Future<Output = Result<Self, Self::Error>>>>;

    fn from_request(req: &actix_web::HttpRequest, _payload: &mut actix_web::dev::Payload) -> Self::Future {
        let extensions = req.extensions();
        let user_id_opt = extensions.get::<UserId>().copied(); // Use copied() for Copy types
        let request_path = req.path().to_string(); // Clone the path to avoid lifetime issues

        Box::pin(async move {
            user_id_opt.ok_or_else(|| {
                log::error!("UserId not found in request extensions. Auth middleware might not have run or failed for path: {}", request_path);
                actix_web::error::ErrorInternalServerError(
                    "Authentication context not found. Please ensure authentication middleware is correctly configured and has run."
                )
            })
        })
    }
}

// Implement FromRequest for UserRole to extract it in handlers
impl actix_web::FromRequest for UserRole {
    type Error = actix_web::Error;
    type Future = std::pin::Pin<Box<dyn std::future::Future<Output = Result<Self, Self::Error>>>>;

    fn from_request(req: &actix_web::HttpRequest, _payload: &mut actix_web::dev::Payload) -> Self::Future {
        let extensions = req.extensions();
        let user_role_opt = extensions.get::<UserRole>().cloned();
        let request_path = req.path().to_string(); // Clone the path to avoid lifetime issues

        Box::pin(async move {
            user_role_opt.ok_or_else(|| {
                log::error!("UserRole not found in request extensions. Auth middleware might not have run or failed for path: {}", request_path);
                actix_web::error::ErrorInternalServerError(
                    "Authentication context (role) not found. Please ensure authentication middleware is correctly configured and has run."
                )
            })
        })
    }
}

// Implement FromRequest for UserEmail to extract it in handlers
impl actix_web::FromRequest for UserEmail {
    type Error = actix_web::Error;
    type Future = std::pin::Pin<Box<dyn std::future::Future<Output = Result<Self, Self::Error>>>>;

    fn from_request(req: &actix_web::HttpRequest, _payload: &mut actix_web::dev::Payload) -> Self::Future {
        let extensions = req.extensions();
        let user_email_opt = extensions.get::<UserEmail>().cloned();
        let request_path = req.path().to_string(); // Clone the path to avoid lifetime issues

        Box::pin(async move {
            user_email_opt.ok_or_else(|| {
                log::error!("UserEmail not found in request extensions. Auth middleware might not have run or failed for path: {}", request_path);
                actix_web::error::ErrorInternalServerError(
                    "Authentication context (email) not found. Please ensure authentication middleware is correctly configured and has run."
                )
            })
        })
    }
}

/// Authentication middleware using JWT validation and RLS Session Management.
/// 
/// This middleware now uses RLSSessionManager to ensure proper user context isolation
/// and prevent session variable leakage between requests.
#[derive(Clone)]
pub struct SecureAuthentication {
    user_pool: std::sync::Arc<sqlx::PgPool>,
    rls_manager: Arc<RLSSessionManager>,
}

impl SecureAuthentication {
    pub fn new(user_pool: sqlx::PgPool) -> Self {
        debug!("SecureAuthentication::new called - initializing middleware with RLS Session Manager");
        let rls_manager = Arc::new(RLSSessionManager::new(user_pool.clone()));
        
        // Start the cleanup task for stale connections
        rls_manager.start_cleanup_task();
        
        Self { 
            user_pool: std::sync::Arc::new(user_pool),
            rls_manager,
        }
    }
    
    /// Create middleware with an existing RLS manager (for testing)
    pub fn with_rls_manager(user_pool: sqlx::PgPool, rls_manager: RLSSessionManager) -> Self {
        Self {
            user_pool: std::sync::Arc::new(user_pool),
            rls_manager: Arc::new(rls_manager),
        }
    }
}

impl<S, B> Transform<S, ServiceRequest> for SecureAuthentication 
where
    S: Service<ServiceRequest, Response = ServiceResponse<B>, Error = Error> + 'static,
    S::Future: 'static,
    B: 'static,
{
    type Response = ServiceResponse<B>;
    type Error = Error;
    type Transform = SecureAuthenticationMiddleware<S>;
    type InitError = ();
    type Future = Ready<Result<Self::Transform, Self::InitError>>;

    fn new_transform(&self, service: S) -> Self::Future {
        debug!("SecureAuthentication::new_transform called - creating middleware with RLS Session Manager");
        ok(SecureAuthenticationMiddleware { 
            service: Arc::new(service),
            user_pool: self.user_pool.clone(),
            rls_manager: self.rls_manager.clone(),
        })
    }
}

#[derive(Clone)]
pub struct SecureAuthenticationMiddleware<S> {
    service: Arc<S>,
    user_pool: std::sync::Arc<sqlx::PgPool>,
    rls_manager: Arc<RLSSessionManager>,
}


impl<S, B> Service<ServiceRequest> for SecureAuthenticationMiddleware<S>
where
    S: Service<ServiceRequest, Response = ServiceResponse<B>, Error = Error> + 'static,
    S::Future: 'static,
    B: 'static,
{
    type Response = ServiceResponse<B>;
    type Error = Error;
    type Future = Pin<Box<dyn Future<Output = Result<Self::Response, Self::Error>>>>;

    fn poll_ready(&self, cx: &mut Context<'_>) -> Poll<Result<(), Self::Error>> {
        self.service.poll_ready(cx)
    }

    fn call(&self, mut req: ServiceRequest) -> Self::Future {
        let service = self.service.clone();
        
        debug!("SecureAuthentication middleware called for: {} {}", req.method(), req.path());

        // Check if request has already been processed by this middleware
        if req.extensions().get::<AuthProcessed>().is_some() {
            debug!("Request already processed by auth middleware, skipping");
            return Box::pin(service.call(req));
        }

        // Skip auth check for OPTIONS requests (CORS pre-flight)
        let path = req.path().to_string();
        if req.method() == actix_web::http::Method::OPTIONS {
            debug!("Skipping authentication for OPTIONS request to: {}", path);
            // Mark as processed but don't require auth
            req.extensions_mut().insert(AuthProcessed);
            return Box::pin(service.call(req));
        }

        // Mark the request as processed
        req.extensions_mut().insert(AuthProcessed);

        // Extract the token from the Authorization header
        let auth_header = match req.headers().get(AUTHORIZATION) {
            Some(header) => header,
            None => {
                warn!("No Authorization header found for path: {}", path);
                return Box::pin(ready(Err(Error::from(actix_web::error::ErrorUnauthorized(
                    "Missing Authorization header",
                )))));
            }
        };
        
        // Parse the Bearer token
        let auth_str = match auth_header.to_str() {
            Ok(s) => s,
            Err(_) => {
                warn!("Invalid Authorization header encoding for path: {}", path);
                return Box::pin(ready(Err(Error::from(actix_web::error::ErrorUnauthorized(
                    "Invalid Authorization header",
                )))));
            }
        };
        
        // Check for Bearer token format
        if !auth_str.starts_with("Bearer ") {
            warn!("Invalid Authorization header format (not Bearer) for path: {}", path);
            return Box::pin(ready(Err(Error::from(actix_web::error::ErrorUnauthorized(
                "Invalid Authorization format, expected Bearer token",
            )))));
        }
        
        let token = auth_str[7..].trim(); // Strip "Bearer " prefix
        if token.is_empty() {
            warn!("Empty Bearer token for path: {}", path);
            return Box::pin(ready(Err(Error::from(actix_web::error::ErrorUnauthorized(
                "Empty Bearer token",
            )))));
        }
        
        // Clone data needed in the async block to avoid borrowing issues
        let request_path = req.path().to_string();
        let token = token.to_string();
        let user_pool = self.user_pool.clone();
        let rls_manager = self.rls_manager.clone();
        
        // Create a separate async block to verify the token
        Box::pin(async move {
            let verify_result = jwt::verify_token(&token);

            match verify_result {
                Ok(claims) => {
                    // Convert string user_id to UUID
                    let user_id = match Uuid::parse_str(&claims.sub) {
                        Ok(uuid) => uuid,
                        Err(_) => {
                            error!("Invalid user ID format in token: {}", claims.sub);
                            return Err(Error::from(actix_web::error::ErrorUnauthorized("Invalid user ID format in token")));
                        }
                    };
                    
                    let user_role = claims.role;
                    let user_email = claims.email;

                    // Token Binding Verification (if present in token)
                    if let Some(token_binding_hash_claim) = &claims.tbh {
                        match extract_token_binding_hash_from_service_request(&req) {
                            Ok(request_binding_hash) => {
                                if token_binding_hash_claim == &request_binding_hash {
                                    debug!("Token binding verified successfully for user {} on path {}", user_id, request_path);
                                } else {
                                    warn!(
                                        "Token binding mismatch for user {} on path {}. Claim_TBH: '{}', Request_Header_TBH: '{}'",
                                        user_id, request_path, token_binding_hash_claim, request_binding_hash
                                    );
                                    return Err(Error::from(actix_web::error::ErrorUnauthorized("Token binding verification failed: mismatch")));
                                }
                            }
                            Err(AppError::Auth(msg)) if msg.contains(&format!("Missing or invalid {} header", TOKEN_BINDING_HEADER)) => {
                                warn!(
                                    "Token binding verification failed for user {} on path {}. Header '{}' missing or invalid.",
                                    user_id, request_path, TOKEN_BINDING_HEADER
                                );
                                return Err(Error::from(actix_web::error::ErrorUnauthorized("Token binding verification failed: header issue")));
                            }
                            Err(e) => {
                                error!("Unexpected error during token binding hash extraction for user {} on path {}: {}", user_id, request_path, e);
                                return Err(Error::from(actix_web::error::ErrorInternalServerError("Token binding internal error")));
                            }
                        }
                    }

                    debug!("JWT valid for user {} (Role: {}) for route {}", user_id, user_role, request_path);
                    
                    // CRITICAL: Use RLS Session Manager for secure user context setup
                    // This replaces the previous direct session variable setting with comprehensive
                    // validation, monitoring, and explicit failure handling
                    
                    // Generate request ID for tracing
                    let request_id = format!("auth_{}_{}", chrono::Utc::now().timestamp_millis(), uuid::Uuid::new_v4());
                    
                    // Test connection setup using RLS Session Manager
                    // This ensures proper isolation and prevents session variable leakage
                    match rls_manager.get_connection_with_user_context(user_id, Some(request_id.clone())).await {
                        Ok(_conn) => {
                            debug!("RLS Session Manager successfully configured user context for user {} on route {} (request: {})", 
                                   user_id, request_path, request_id);
                            // Connection is automatically returned to pool with proper cleanup
                        },
                        Err(e) => {
                            error!("CRITICAL RLS SETUP FAILURE: RLS Session Manager failed to establish user context for user {}. Path: {}. Request: {}. Error: {}", 
                                   user_id, request_path, request_id, e);
                            error!("This failure prevents secure database access and indicates a critical security issue");
                            return Err(Error::from(actix_web::error::ErrorInternalServerError(
                                format!("Failed to establish secure user context: {}", e)
                            )));
                        }
                    }
                    
                    debug!("Secure user context validated for user {} on route {} (request: {})", 
                           user_id, request_path, request_id);
                    
                    // Insert user information into req.extensions_mut() for handler access
                    req.extensions_mut().insert(UserId(user_id));
                    req.extensions_mut().insert(UserRole(user_role));
                    req.extensions_mut().insert(UserEmail(user_email));
                    
                    // Continue to the next middleware/handler
                    service.call(req).await
                },
                Err(e) => {
                    error!("JWT validation failed for route {}: {}", request_path, e);
                    match e {
                        AppError::Auth(msg) => {
                            Err(Error::from(actix_web::error::ErrorUnauthorized(msg)))
                        },
                        _ => Err(Error::from(actix_web::error::ErrorInternalServerError("Internal authentication error")))
                    }
                }
            }
        })
    }
}