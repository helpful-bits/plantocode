use actix_web::{web, HttpResponse, Responder, post, get, HttpRequest};
use serde::{Deserialize, Serialize};
use crate::error::AppError;
use crate::models::auth_jwt_claims::Claims;
use crate::services::auth::jwt;
use crate::services::auth::oauth::firebase_oauth::{FirebaseOAuthService, FullAuthDetailsResponse};
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
/// Returns a standardized OAuth-compliant response with:
/// - access_token: the application JWT
/// - token_type: "Bearer"
/// - expires_in: token lifetime in seconds
/// - user_id, email, name, role: user details
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
    
    // Extract the client ID for token binding if present
    use crate::security::token_binding::TOKEN_BINDING_HEADER;
    let client_id_header_value: Option<String> = req.headers()
        .get(TOKEN_BINDING_HEADER)
        .and_then(|hv| hv.to_str().ok().map(String::from));
        
    // Generate a JWT token and get full auth details
    match auth_service.generate_token_from_firebase(firebase_token, client_id_header_value.as_deref()).await {
        Ok(auth_details) => {
            // Map Firebase OAuth response to desktop app format
            let response = FullAuthDetailsResponse {
                access_token: auth_details.access_token,
                token_type: "Bearer".to_string(), // Always set token_type to Bearer
                expires_in: auth_details.expires_in,
                user_id: auth_details.user_id.clone(),
                email: auth_details.email,
                name: auth_details.name,
                role: auth_details.role,
                firebase_uid: auth_details.user_id,
            };
            
            HttpResponse::Ok().json(response)
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


// The userinfo endpoint has been consolidated in userinfo_handler.rs
// which uses middleware-extracted UserId and provides user details from the database