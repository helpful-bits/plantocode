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

    fn from_request(req: &actix_web::HttpRequest, _: &mut actix_web::dev::Payload) -> Self::Future {
        let req = req.clone();
        Box::pin(async move {
            // Get UserId from extensions (set by SecureAuthentication middleware)
            req.extensions()
                .get::<UserId>()
                .cloned()
                .ok_or_else(|| actix_web::error::ErrorUnauthorized("User not authenticated"))
        })
    }
}

// Implement FromRequest for UserRole to extract it in handlers
impl actix_web::FromRequest for UserRole {
    type Error = actix_web::Error;
    type Future = std::pin::Pin<Box<dyn std::future::Future<Output = Result<Self, Self::Error>>>>;

    fn from_request(req: &actix_web::HttpRequest, _: &mut actix_web::dev::Payload) -> Self::Future {
        let req = req.clone();
        Box::pin(async move {
            // Get UserRole from extensions (set by SecureAuthentication middleware)
            req.extensions()
                .get::<UserRole>()
                .cloned()
                .ok_or_else(|| actix_web::error::ErrorUnauthorized("User role not available"))
        })
    }
}

// Implement FromRequest for UserEmail to extract it in handlers
impl actix_web::FromRequest for UserEmail {
    type Error = actix_web::Error;
    type Future = std::pin::Pin<Box<dyn std::future::Future<Output = Result<Self, Self::Error>>>>;

    fn from_request(req: &actix_web::HttpRequest, _: &mut actix_web::dev::Payload) -> Self::Future {
        let req = req.clone();
        Box::pin(async move {
            // Get UserEmail from extensions (set by SecureAuthentication middleware)
            req.extensions()
                .get::<UserEmail>()
                .cloned()
                .ok_or_else(|| actix_web::error::ErrorUnauthorized("User email not available"))
        })
    }
}

/// Authentication middleware using JWT validation.
#[derive(Clone)]
pub struct SecureAuthentication;

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
        ok(SecureAuthenticationMiddleware { service: Arc::new(service) })
    }
}

#[derive(Clone)]
pub struct SecureAuthenticationMiddleware<S> {
    service: Arc<S>,
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

    fn call(&self, req: ServiceRequest) -> Self::Future {
        let service = self.service.clone();

        // Check if request has already been processed by this middleware
        if req.extensions().get::<AuthProcessed>().is_some() {
            // Already processed, skip auth logic
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
                            Ok(request_binding_hash) if token_binding_hash_claim == &request_binding_hash => {
                                debug!("Token binding verified successfully for user {}", user_id);
                            }
                            _ => {
                                warn!("Token binding verification failed for user {}. Request header '{}' missing, mismatched, or hashing failed.", 
                                    user_id, TOKEN_BINDING_HEADER);
                                return Err(Error::from(actix_web::error::ErrorUnauthorized("Token binding verification failed")));
                            }
                        }
                    }

                    debug!("JWT valid for user {} (Role: {}) for route {}", user_id, user_role, request_path);
                    
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