use crate::db::connection::DatabasePools;
use crate::db::repositories::UserRepository;
use crate::error::AppError;
use crate::models::AuthenticatedUser;
use actix_web::{HttpResponse, web};

/// Handler for getting user information from a validated JWT token
pub async fn get_user_info(
    user: web::ReqData<AuthenticatedUser>,
    db_pools: web::Data<DatabasePools>,
) -> Result<HttpResponse, AppError> {
    // Extract user information from the JWT (already validated by middleware)
    let authenticated_user_id = user.user_id;
    let email = &user.email;
    let role = &user.role;

    // Create user repository with system pool for basic user lookup
    let user_repo = UserRepository::new(db_pools.system_pool.clone());

    // Get user name from database (we still need this as it's not in JWT)
    let user_record = user_repo.get_by_id(&authenticated_user_id).await?;

    // Return user information (excluding sensitive data)
    Ok(HttpResponse::Ok().json(serde_json::json!({
        "id": authenticated_user_id,
        "email": email,
        "name": user_record.full_name,
        "role": role
    })))
}
