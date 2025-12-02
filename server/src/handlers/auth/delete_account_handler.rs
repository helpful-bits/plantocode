use crate::db::connection::DatabasePools;
use crate::error::AppError;
use crate::models::AuthenticatedUser;
use crate::services::billing_service::BillingService;
use actix_web::{HttpResponse, web};
use log::{error, info};
use std::sync::Arc;

/// Handler for deleting a user account
/// This will delete all user data including devices, API keys, credit transactions,
/// user credits, consents, and billing data
pub async fn delete_account(
    user: web::ReqData<AuthenticatedUser>,
    db_pools: web::Data<DatabasePools>,
    billing_service: web::Data<Arc<BillingService>>,
) -> Result<HttpResponse, AppError> {
    let user_id = user.user_id;

    info!("Account deletion requested for user_id: {}", user_id);

    // Check if the user has any blocking billing state
    let has_blocking_state = match billing_service.has_blocking_billing_state(&user_id).await {
        Ok(state) => state,
        Err(e) => {
            error!("Failed to check billing state for user {}: {:?}", user_id, e);
            return Err(e);
        }
    };

    if has_blocking_state {
        error!("Account deletion blocked for user_id: {} due to active billing state", user_id);
        return Err(AppError::BillingConflict(
            "Cannot delete account with active billing. Please cancel your subscription first.".to_string()
        ));
    }

    // Begin a transaction to ensure all deletions happen atomically
    let mut tx = db_pools.system_pool.begin().await
        .map_err(|e| AppError::Database(format!("Failed to begin transaction: {}", e)))?;

    // Delete billing data first (before user deletion)
    // This includes Stripe customer information and billing metadata
    billing_service.delete_user_billing_data(&user_id, &mut tx).await?;

    // Most related data will be deleted automatically via ON DELETE CASCADE:
    // - refresh_tokens (CASCADE)
    // - api_keys (CASCADE)
    // - customer_billing (CASCADE)
    // - api_usage (CASCADE)
    // - api_quotas (CASCADE)
    // - audit_logs (CASCADE)
    // - invoices (CASCADE)
    // - user_credits (CASCADE)
    // - credit_transactions (CASCADE)
    // - devices (CASCADE)
    // - device_pairing_requests (CASCADE)
    // - user_consent_events (CASCADE)
    // - user_consents (CASCADE)

    // Delete the user (this triggers CASCADE deletions)
    sqlx::query!(
        r#"
        DELETE FROM users
        WHERE id = $1
        "#,
        user_id
    )
    .execute(&mut *tx)
    .await
    .map_err(|e| {
        error!("Failed to delete user {}: {}", user_id, e);
        AppError::Database(format!("Failed to delete user: {}", e))
    })?;

    // Commit the transaction
    tx.commit().await
        .map_err(|e| AppError::Database(format!("Failed to commit transaction: {}", e)))?;

    info!("Successfully deleted account for user_id: {}", user_id);

    Ok(HttpResponse::Ok().json(serde_json::json!({
        "status": "deleted"
    })))
}
