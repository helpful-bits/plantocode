use actix_web::{web, HttpResponse, Result, HttpRequest};
use crate::error::AppError;
use crate::models::AuthenticatedUser;
use crate::services::auth::jwt;
use crate::db::repositories::RevokedTokenRepository;
use crate::db::connection::DatabasePools;
use log::{info, error};
use chrono::{DateTime, Utc};

pub async fn logout(
    user: web::ReqData<AuthenticatedUser>,
    req: HttpRequest,
    db_pools: web::Data<DatabasePools>,
) -> Result<HttpResponse, AppError> {
    let user_id = user.user_id;
    
    // Extract JWT token from Authorization header
    let auth_header = req.headers().get("Authorization")
        .ok_or_else(|| AppError::Unauthorized("No authorization header found".to_string()))?;
    
    let auth_header_str = auth_header.to_str()
        .map_err(|_| AppError::Unauthorized("Invalid authorization header format".to_string()))?;
    
    if !auth_header_str.starts_with("Bearer ") {
        return Err(AppError::Unauthorized("Invalid authorization header format".to_string()));
    }
    
    let token = &auth_header_str[7..]; // Remove "Bearer " prefix
    
    // Verify token and extract claims
    let claims = jwt::verify_token(token)?;
    
    // Calculate expiration time from claims
    let expires_at = DateTime::from_timestamp(claims.exp as i64, 0)
        .ok_or_else(|| AppError::Internal("Invalid token expiration time".to_string()))?;
    
    // Create revoked token repository
    let revoked_token_repo = RevokedTokenRepository::new(db_pools.system_pool.clone());
    
    // Revoke the token
    revoked_token_repo.revoke(&claims.jti, &user_id, expires_at).await?;
    
    info!("User {} logged out successfully, token jti: {}", user_id, claims.jti);
    
    Ok(HttpResponse::Ok().json(serde_json::json!({
        "message": "Logged out successfully"
    })))
}