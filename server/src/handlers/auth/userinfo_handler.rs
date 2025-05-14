use actix_web::{web, HttpResponse};
use crate::error::AppError;
use crate::middleware::UserId;
use crate::db::repositories::UserRepository;
use sqlx::PgPool;

/// Handler for getting user information from a validated JWT token
pub async fn get_user_info(
    user_id: web::ReqData<UserId>,
    db_pool: web::Data<PgPool>,
) -> Result<HttpResponse, AppError> {
    // Extract user ID from the JWT (already validated by middleware)
    let user_id = user_id.into_inner().0;
    
    // Create user repository
    let user_repo = UserRepository::new(db_pool.get_ref().clone());
    
    // Get user details from database
    let user = user_repo.get_by_id(&user_id).await?;
    
    // Return user information (excluding sensitive data)
    Ok(HttpResponse::Ok().json(serde_json::json!({
        "id": user.id,
        "email": user.email,
        "name": user.full_name,
        "role": user.role
    })))
}

/// Handler for validating a JWT token
/// This handler simply returns a success response if the request passes the SecureAuthentication middleware
/// The middleware handles the JWT validation, so if this handler is reached, the token is valid
pub async fn validate_token(
    user_id: web::ReqData<UserId>,
) -> Result<HttpResponse, AppError> {
    // Extract user ID from the JWT (already validated by middleware)
    let user_id = user_id.into_inner().0;
    
    // Return simple validation response with user ID
    Ok(HttpResponse::Ok().json(serde_json::json!({
        "valid": true,
        "user_id": user_id
    })))
}