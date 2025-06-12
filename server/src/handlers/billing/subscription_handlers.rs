use actix_web::{web, HttpResponse, get, post};
use serde::{Deserialize, Serialize};
use crate::error::AppError;
use crate::services::billing_service::BillingService;
use crate::middleware::secure_auth::UserId;
use log::{debug, info, error};
use uuid::Uuid;

// ========================================
// SUBSCRIPTION MANAGEMENT HANDLERS
// ========================================

/// Get subscription info for the current user
#[get("/subscription")]
pub async fn get_subscription(
    user_id: UserId,
    billing_service: web::Data<BillingService>,
) -> Result<HttpResponse, AppError> {
    debug!("Getting subscription for user: {}", user_id.0);
    
    // Get subscription details
    let subscription = billing_service.get_subscription_details(&user_id.0).await?;
    
    // Return the subscription details
    Ok(HttpResponse::Ok().json(subscription))
}

/// Get subscription with pending payment status for failed proration handling
#[get("/api/billing/subscription/pending-payment")]
pub async fn get_subscription_pending_payment(
    billing_service: web::Data<BillingService>,
    user_id: UserId,
) -> Result<HttpResponse, AppError> {
    debug!("Getting subscription pending payment status for user: {}", user_id.0);
    
    let sub_repo = crate::db::repositories::SubscriptionRepository::new(billing_service.get_db_pool().clone());
    
    if let Some(subscription) = sub_repo.get_by_user_id(&user_id.0).await? {
        // Check if subscription has pending plan change (simplified without payment intent)
        if subscription.pending_plan_id.is_some() {
            let publishable_key = billing_service.get_stripe_publishable_key()?;
            
            let response = serde_json::json!({
                "hasPendingPayment": true,
                "publishableKey": publishable_key,
                "pendingPlanId": subscription.pending_plan_id,
                "currentStatus": subscription.status
            });
            
            Ok(HttpResponse::Ok().json(response))
        } else {
            let response = serde_json::json!({
                "hasPendingPayment": false
            });
            
            Ok(HttpResponse::Ok().json(response))
        }
    } else {
        Err(AppError::NotFound("Subscription not found".to_string()))
    }
}

/// Complete pending payment and apply plan change
#[post("/api/billing/subscription/complete-pending-payment")]
pub async fn complete_pending_payment(
    billing_service: web::Data<BillingService>,
    user_id: UserId,
) -> Result<HttpResponse, AppError> {
    info!("Completing pending payment for user: {}", user_id.0);
    
    let mut tx = billing_service.get_db_pool().begin().await
        .map_err(|e| AppError::Database(format!("Failed to begin transaction: {}", e)))?;
    
    let sub_repo = crate::db::repositories::SubscriptionRepository::new(billing_service.get_db_pool().clone());
    
    if let Some(mut subscription) = sub_repo.get_by_user_id_with_executor(&user_id.0, &mut tx).await? {
        // Apply pending plan change
        if let Some(pending_plan_id) = subscription.pending_plan_id.clone() {
            let old_plan_id = subscription.plan_id.clone();
            subscription.plan_id = pending_plan_id.clone();
            subscription.pending_plan_id = None;
            subscription.status = "active".to_string();
            
            sub_repo.update_with_executor(&subscription, &mut tx).await?;
            
            // Update spending limits for the new plan
            let cost_based_service = billing_service.get_cost_based_billing_service();
            if let Err(e) = cost_based_service.update_spending_limits_for_plan_change(&user_id.0, &pending_plan_id).await {
                error!("Failed to update spending limits after manual payment completion for user {}: {}", user_id.0, e);
            } else {
                info!("Successfully updated spending limits for user {} after manual payment completion", user_id.0);
            }
            
            tx.commit().await.map_err(|e| AppError::Database(format!("Failed to commit transaction: {}", e)))?;
            
            info!("Successfully completed pending payment and applied plan change for user: {} from {} to {}", user_id.0, old_plan_id, pending_plan_id);
            
            let response = serde_json::json!({
                "success": true,
                "newPlanId": pending_plan_id,
                "previousPlanId": old_plan_id,
                "message": "Plan change completed successfully"
            });
            
            Ok(HttpResponse::Ok().json(response))
        } else {
            tx.rollback().await.map_err(|e| AppError::Database(format!("Failed to rollback transaction: {}", e)))?;
            Err(AppError::InvalidArgument("No pending plan change found".to_string()))
        }
    } else {
        tx.rollback().await.map_err(|e| AppError::Database(format!("Failed to rollback transaction: {}", e)))?;
        Err(AppError::NotFound("Subscription not found".to_string()))
    }
}

#[derive(Debug, Deserialize)]
pub struct PreviewSubscriptionChangeRequest {
    pub new_plan_id: String,
    #[serde(default = "default_proration_behavior")]
    pub proration_behavior: String, // "create_prorations", "none", "always_invoice"
}

#[derive(Debug, Deserialize)]
pub struct ChangeSubscriptionPlanRequest {
    pub new_plan_id: String,
    #[serde(default = "default_proration_behavior")]
    pub proration_behavior: String, // "create_prorations", "none", "always_invoice"
    #[serde(default)]
    pub billing_cycle_anchor: Option<String>, // "now", "unchanged"
}

#[derive(Debug, Deserialize)]
pub struct CancelSubscriptionRequest {
    #[serde(default = "default_at_period_end")]
    pub at_period_end: bool,
    pub cancellation_reason: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct ResumeSubscriptionRequest {
    // No fields needed for resuming - we just resume the existing subscription
}

#[derive(Debug, Deserialize)]
pub struct ReactivateSubscriptionRequest {
    pub plan_id: Option<String>,
}


fn default_proration_behavior() -> String {
    "create_prorations".to_string()
}

fn default_at_period_end() -> bool {
    true
}

fn parse_proration_behavior(behavior: &str) -> Result<crate::services::stripe_service::ProrationBehavior, AppError> {
    match behavior.to_lowercase().as_str() {
        "create_prorations" => Ok(crate::services::stripe_service::ProrationBehavior::CreateProrations),
        "none" => Ok(crate::services::stripe_service::ProrationBehavior::None),
        "always_invoice" => Ok(crate::services::stripe_service::ProrationBehavior::AlwaysInvoice),
        _ => Err(AppError::InvalidArgument(format!("Invalid proration behavior: {}", behavior))),
    }
}

fn parse_billing_cycle_anchor(anchor: Option<&str>) -> Result<Option<crate::services::stripe_service::BillingCycleAnchor>, AppError> {
    match anchor {
        Some("now") => Ok(Some(crate::services::stripe_service::BillingCycleAnchor::Now)),
        Some("unchanged") => Ok(Some(crate::services::stripe_service::BillingCycleAnchor::Unchanged)),
        None => Ok(None),
        Some(other) => Err(AppError::InvalidArgument(format!("Invalid billing cycle anchor: {}", other))),
    }
}





/// Cancel a subscription for a user
pub async fn cancel_subscription(
    billing_service: web::Data<BillingService>,
    user_id: UserId,
    req: web::Json<CancelSubscriptionRequest>,
) -> Result<HttpResponse, AppError> {
    info!("Canceling subscription for user: {} (at_period_end: {})", user_id.0, req.at_period_end);
    
    let updated_subscription = billing_service.cancel_subscription(
        &user_id.0,
        req.at_period_end,
    ).await?;
    
    info!("Successfully canceled subscription for user: {}", user_id.0);
    Ok(HttpResponse::Ok().json(updated_subscription))
}

/// Resume a subscription that was set to cancel at period end
pub async fn resume_subscription(
    billing_service: web::Data<BillingService>,
    user_id: UserId,
    _req: web::Json<ResumeSubscriptionRequest>,
) -> Result<HttpResponse, AppError> {
    info!("Resuming subscription for user: {}", user_id.0);
    
    let updated_subscription = billing_service.resume_subscription(
        &user_id.0,
    ).await?;
    
    info!("Successfully resumed subscription for user: {}", user_id.0);
    Ok(HttpResponse::Ok().json(updated_subscription))
}

/// Reactivate a subscription for a user (creates new subscription)
pub async fn reactivate_subscription(
    billing_service: web::Data<BillingService>,
    user_id: UserId,
    req: web::Json<ReactivateSubscriptionRequest>,
) -> Result<HttpResponse, AppError> {
    info!("Recreating subscription for user: {}", user_id.0);
    
    let updated_subscription = billing_service.reactivate_subscription(
        &user_id.0,
        req.plan_id.clone(),
    ).await?;
    
    info!("Successfully reactivated subscription for user: {}", user_id.0);
    Ok(HttpResponse::Ok().json(updated_subscription))
}


/// Get API usage summary
#[get("/usage")]
pub async fn get_usage_summary(
    user_id: UserId,
    billing_service: web::Data<BillingService>,
) -> Result<HttpResponse, AppError> {
    debug!("Getting API usage for user: {}", user_id.0);
    
    // Get subscription details which includes usage
    let details = billing_service.get_subscription_details(&user_id.0).await?;
    
    // Extract just the usage part
    let usage = details.get("usage").ok_or(AppError::Internal("Failed to get usage from subscription details".to_string()))?;
    
    // Return the usage summary
    Ok(HttpResponse::Ok().json(usage))
}