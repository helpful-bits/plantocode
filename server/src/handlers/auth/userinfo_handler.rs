use actix_web::{web, HttpResponse};
use crate::error::AppError;
use crate::middleware::secure_auth::{UserId, UserEmail, UserRole};
use crate::db::repositories::UserRepository;
use crate::db::connection::DatabasePools;

/// Handler for getting user information from a validated JWT token
pub async fn get_user_info(
    user_id: UserId,
    user_email: UserEmail,
    user_role: UserRole,
    db_pools: web::Data<DatabasePools>,
) -> Result<HttpResponse, AppError> {
    // Extract user information from the JWT (already validated by middleware)
    let authenticated_user_id = user_id.0;
    let email = user_email.0;
    let role = user_role.0;
    
    // Create user repository with system pool for basic user lookup
    let user_repo = UserRepository::new(db_pools.system_pool.clone());
    
    // Get user name from database (we still need this as it's not in JWT)
    let user = user_repo.get_by_id(&authenticated_user_id).await?;
    
    // Return user information (excluding sensitive data)
    Ok(HttpResponse::Ok().json(serde_json::json!({
        "id": authenticated_user_id,
        "email": email,
        "name": user.full_name,
        "role": role
    })))
}

