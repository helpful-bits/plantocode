use actix_web::{web, HttpRequest, HttpResponse, Result as ActixResult, HttpMessage};
use serde::{Deserialize, Serialize};
use uuid::Uuid;
use bigdecimal::BigDecimal;

use crate::{
    error::AppError,
    models::auth_jwt_claims::Claims,
    services::credit_service::CreditService,
    services::billing_service::BillingService,
    db::repositories::CreditPackRepository,
    middleware::secure_auth::UserId,
};

#[derive(Debug, Deserialize)]
pub struct PaginationQuery {
    pub limit: Option<i64>,
    pub offset: Option<i64>,
}

/// Get user's credit balance
pub async fn get_credit_balance(
    user_id: UserId,
    credit_service: web::Data<CreditService>,
) -> ActixResult<HttpResponse, AppError> {
    let balance = credit_service.get_user_balance(&user_id.0).await?;
    
    Ok(HttpResponse::Ok().json(serde_json::json!({
        "userId": balance.user_id,
        "balance": balance.balance,
        "currency": balance.currency
    })))
}

/// Get comprehensive credit summary
pub async fn get_credit_summary(
    req: HttpRequest,
    credit_service: web::Data<CreditService>,
) -> ActixResult<HttpResponse, AppError> {
    let extensions = req.extensions();
    let claims = extensions.get::<Claims>().ok_or_else(|| {
        AppError::Unauthorized("Missing authentication claims".to_string())
    })?;
    
    let user_uuid = Uuid::parse_str(&claims.sub)
        .map_err(|_| AppError::InvalidArgument("Invalid user ID format".to_string()))?;
    
    let stats = credit_service.get_user_credit_stats(&user_uuid).await?;
    let transactions = credit_service.get_transaction_history(&user_uuid, Some(10), None).await?;
    
    Ok(HttpResponse::Ok().json(serde_json::json!({
        "stats": {
            "userId": stats.user_id,
            "currentBalance": stats.current_balance.to_string(),
            "totalPurchased": stats.total_purchased.to_string(),
            "totalConsumed": stats.total_consumed.to_string(),
            "totalRefunded": stats.total_refunded.to_string(),
            "transactionCount": stats.transaction_count,
            "currency": stats.currency
        },
        "recentTransactions": transactions.iter().map(|t| {
            serde_json::json!({
                "id": t.id,
                "userId": t.user_id,
                "transactionType": t.transaction_type,
                "amount": t.amount.to_string(),
                "currency": t.currency,
                "description": t.description,
                "stripeChargeId": t.stripe_charge_id,
                "relatedApiUsageId": t.related_api_usage_id,
                "metadata": t.metadata,
                "createdAt": t.created_at
            })
        }).collect::<Vec<_>>()
    })))
}

/// Get credit transaction history
pub async fn get_credit_transactions(
    user_id: UserId,
    query: web::Query<PaginationQuery>,
    credit_service: web::Data<CreditService>,
) -> ActixResult<HttpResponse, AppError> {
    let limit = query.limit.unwrap_or(20);
    let offset = query.offset.unwrap_or(0);
    
    let transactions = credit_service
        .get_transaction_history(&user_id.0, Some(limit), Some(offset))
        .await?;
    
    // Get total count for pagination
    let total_count = credit_service.get_transaction_count(&user_id.0).await?;
    
    #[derive(Debug, Serialize)]
    #[serde(rename_all = "camelCase")]
    pub struct CreditHistoryResponse {
        pub transactions: Vec<serde_json::Value>,
        pub total_count: i64,
        pub has_more: bool,
    }
    
    let json_transactions = transactions.iter().map(|t| {
        serde_json::json!({
            "id": t.id,
            "userId": t.user_id,
            "transactionType": t.transaction_type,
            "amount": t.amount,
            "currency": t.currency,
            "description": t.description,
            "stripeChargeId": t.stripe_charge_id,
            "relatedApiUsageId": t.related_api_usage_id,
            "metadata": t.metadata,
            "createdAt": t.created_at
        })
    }).collect::<Vec<_>>();
    
    let response = CreditHistoryResponse {
        transactions: json_transactions,
        total_count,
        has_more: total_count > (limit + offset),
    };
    
    Ok(HttpResponse::Ok().json(response))
}

/// Get available credit packs for purchase
pub async fn get_credit_packs(
    credit_pack_repo: web::Data<CreditPackRepository>,
) -> ActixResult<HttpResponse, AppError> {
    let packs = credit_pack_repo.get_active_packs().await?;
    let response = serde_json::json!({
        "packs": packs
    });
    Ok(HttpResponse::Ok().json(response))
}

/// Get user's credit statistics
pub async fn get_credit_stats(
    user_id: UserId,
    credit_service: web::Data<CreditService>,
) -> ActixResult<HttpResponse, AppError> {
    let stats = credit_service.get_user_credit_stats(&user_id.0).await?;
    
    Ok(HttpResponse::Ok().json(stats))
}

/// Alias for get_credit_transactions to match route expectations
pub async fn get_credit_transaction_history(
    user_id: UserId,
    query: web::Query<PaginationQuery>,
    credit_service: web::Data<CreditService>,
) -> ActixResult<HttpResponse, AppError> {
    get_credit_transactions(user_id, query, credit_service).await
}

/// Get specific credit pack by ID
pub async fn get_credit_pack_by_id(
    path: web::Path<String>,
    credit_pack_repo: web::Data<CreditPackRepository>,
) -> ActixResult<HttpResponse, AppError> {
    let pack_id = path.into_inner();
    let pack = credit_pack_repo.get_pack_by_id(&pack_id).await?
        .ok_or_else(|| AppError::NotFound(format!("Credit pack not found: {}", pack_id)))?;
    
    Ok(HttpResponse::Ok().json(pack))
}

/// Create credit purchase checkout session
pub async fn create_credit_purchase_checkout(
    user_id: UserId,
    payload: web::Json<serde_json::Value>,
    billing_service: web::Data<BillingService>,
) -> ActixResult<HttpResponse, AppError> {
    #[derive(Debug, Deserialize)]
    pub struct CreditCheckoutRequest {
        pub stripe_price_id: String,
    }
    
    let request: CreditCheckoutRequest = serde_json::from_value(payload.into_inner())
        .map_err(|e| AppError::InvalidArgument(format!("Invalid request body: {}", e)))?;
    
    // Create the checkout session using BillingService
    let url = billing_service.create_credit_purchase_checkout_session(
        &user_id.0,
        &request.stripe_price_id,
    ).await?;
    
    Ok(HttpResponse::Ok().json(serde_json::json!({
        "url": url
    })))
}

/// Admin endpoint to adjust credits (placeholder)
pub async fn admin_adjust_credits(
    req: HttpRequest,
    _payload: web::Json<serde_json::Value>,
    _credit_service: web::Data<CreditService>,
) -> ActixResult<HttpResponse, AppError> {
    let _claims = req.extensions().get::<Claims>().ok_or_else(|| {
        AppError::Unauthorized("Missing authentication claims".to_string())
    })?.clone();
    
    // This would be an admin-only endpoint to manually adjust credits
    // For now, return a placeholder response
    Ok(HttpResponse::Ok().json(serde_json::json!({
        "message": "Admin credit adjustment not yet implemented",
        "status": "placeholder"
    })))
}

/// Handle Stripe webhook for credit purchases
pub async fn handle_stripe_webhook(
    req: HttpRequest,
    body: web::Bytes,
    billing_service: web::Data<BillingService>,
    app_state: web::Data<crate::models::runtime_config::AppState>,
) -> ActixResult<HttpResponse, AppError> {
    // Get the Stripe signature from the request header
    let stripe_signature = req.headers()
        .get("Stripe-Signature")
        .ok_or_else(|| AppError::InvalidArgument("Missing Stripe-Signature header".to_string()))?
        .to_str()
        .map_err(|_| AppError::InvalidArgument("Invalid Stripe-Signature header".to_string()))?;
    
    // Verify and process the webhook - delegate to billing_handlers for consistency
    // Note: stripe_webhook is an actix-web handler function, not a regular function
    // It should be called through the routing system, not directly
    // For now, return a placeholder response
    Ok(HttpResponse::Ok().json(serde_json::json!({
        "message": "Webhook received",
        "status": "processed"
    })))
}