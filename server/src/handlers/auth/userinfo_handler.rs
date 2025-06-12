use actix_web::{web, HttpResponse};
use crate::error::AppError;
use crate::middleware::secure_auth::UserId;
use crate::db::repositories::UserRepository;
use sqlx::PgPool;

/// Handler for getting user information from a validated JWT token
pub async fn get_user_info(
    user_id: UserId,
    db_pool: web::Data<PgPool>,
) -> Result<HttpResponse, AppError> {
    // Extract user ID from the JWT (already validated by middleware)
    let authenticated_user_id = user_id.0;
    
    // Use a transaction to ensure RLS context is set on the same connection
    let mut tx = db_pool.begin().await
        .map_err(|_| AppError::Internal("Database transaction error".to_string()))?;
    
    // SECURITY: Set RLS context to the authenticated user from JWT, not any requested user
    sqlx::query("SELECT set_config('app.current_user_id', $1, false)")
        .bind(authenticated_user_id.to_string())
        .execute(&mut *tx)
        .await
        .map_err(|_| AppError::Internal("Failed to set security context".to_string()))?;
    
    // Create user repository with transaction
    let user_repo = UserRepository::new(db_pool.get_ref().clone());
    
    // Get user details using the transaction - this will only work if authenticated_user_id exists due to RLS
    let user = user_repo.get_by_id_with_executor(&authenticated_user_id, &mut tx).await?;
    
    // Commit transaction
    tx.commit().await
        .map_err(|_| AppError::Internal("Database commit error".to_string()))?;
    
    // Return user information (excluding sensitive data)
    Ok(HttpResponse::Ok().json(serde_json::json!({
        "id": user.id,
        "email": user.email,
        "name": user.full_name,
        "role": user.role
    })))
}

