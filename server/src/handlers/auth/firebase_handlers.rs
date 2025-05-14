use actix_web::{web, HttpResponse, Responder, post, get, HttpRequest};
use serde::{Deserialize, Serialize};
use crate::error::AppError;
use crate::models::auth_jwt_claims::Claims;
use crate::services::auth::jwt;
use crate::services::auth::oauth::firebase_oauth::{FirebaseOAuthService, TokenExchangeResponse};
use log::{debug, error, info};

#[derive(Debug, Deserialize)]
pub struct TokenAuthRequest {
    pub id_token: String,
    pub provider: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct UserInfoResponse {
    pub id: String,
    pub email: String,
    pub name: Option<String>,
    pub role: String,
}

/// Exchange a Firebase ID token for a JWT token
#[post("/firebase/token")]
pub async fn exchange_firebase_token(
    req: HttpRequest,
    auth_service: web::Data<FirebaseOAuthService>,
    token_request: web::Json<TokenAuthRequest>,
) -> impl Responder {
    debug!("Received Firebase token exchange request");
    
    // Get the client IP for logging
    let client_ip = req.peer_addr()
        .map(|addr| addr.ip().to_string())
        .unwrap_or_else(|| "unknown".to_string());
    
    info!("Firebase authentication attempt from IP: {}", client_ip);
    
    // Extract the Firebase ID token
    let firebase_token = &token_request.id_token;
    
    // Generate a JWT token
    match auth_service.generate_token_from_firebase(firebase_token).await {
        Ok(token_response) => {
            HttpResponse::Ok().json(token_response)
        },
        Err(e) => {
            error!("Firebase authentication failed: {}", e);
            match e {
                AppError::Auth(_) => HttpResponse::Unauthorized().json("Invalid Firebase token"),
                _ => HttpResponse::InternalServerError().json("Authentication processing failed"),
            }
        }
    }
}

/// Get user information from the JWT token
#[get("/validate")]
pub async fn validate_token(req: HttpRequest) -> impl Responder {
    // Extract the Bearer token from the Authorization header
    let auth_header = match req.headers().get("Authorization") {
        Some(header) => header.to_str().unwrap_or_default(),
        None => return HttpResponse::Unauthorized().json("Missing Authorization header"),
    };
    
    // Check if the header starts with "Bearer "
    if !auth_header.starts_with("Bearer ") {
        return HttpResponse::Unauthorized().json("Invalid Authorization header format");
    }
    
    // Extract the token
    let token = &auth_header[7..]; // Skip "Bearer " prefix
    
    // Validate the token
    match jwt::verify_token(token) {
        Ok(claims) => {
            // Create a user info response
            let user_info = UserInfoResponse {
                id: claims.sub.clone(),
                email: claims.email.clone(),
                name: None, // User name is not stored in the token
                role: claims.role.clone(),
            };
            
            HttpResponse::Ok().json(user_info)
        },
        Err(e) => {
            error!("Token validation failed: {}", e);
            HttpResponse::Unauthorized().json("Invalid token")
        },
    }
}

/// Get the current user's information
#[get("/userinfo")]
pub async fn get_user_info(req: HttpRequest) -> impl Responder {
    // This middleware assumes the secure_auth middleware has already verified the token
    // and added the user ID as an extension to the request
    
    // Extract the Bearer token from the Authorization header
    let auth_header = match req.headers().get("Authorization") {
        Some(header) => header.to_str().unwrap_or_default(),
        None => return HttpResponse::Unauthorized().json("Missing Authorization header"),
    };
    
    // Check if the header starts with "Bearer "
    if !auth_header.starts_with("Bearer ") {
        return HttpResponse::Unauthorized().json("Invalid Authorization header format");
    }
    
    // Extract the token
    let token = &auth_header[7..]; // Skip "Bearer " prefix
    
    // Validate the token
    match jwt::verify_token(token) {
        Ok(claims) => {
            // Create a user info response
            let user_info = UserInfoResponse {
                id: claims.sub.clone(),
                email: claims.email.clone(),
                name: None, // User name is not stored in the token
                role: claims.role.clone(),
            };
            
            HttpResponse::Ok().json(user_info)
        },
        Err(e) => {
            error!("Token validation failed: {}", e);
            HttpResponse::Unauthorized().json("Invalid token")
        },
    }
}