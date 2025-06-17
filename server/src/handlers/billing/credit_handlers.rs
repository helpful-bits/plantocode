use actix_web::{web, HttpResponse, get, post, HttpRequest, HttpMessage};
use serde::{Deserialize, Serialize};
use uuid::Uuid;
use bigdecimal::{BigDecimal, ToPrimitive};
use crate::error::AppError;
use crate::services::billing_service::BillingService;
use crate::services::credit_service::CreditService;
use crate::db::repositories::user_credit_repository::UserCreditRepository;
use crate::db::repositories::credit_transaction_repository::CreditTransactionRepository;
use crate::middleware::secure_auth::UserId;
use crate::models::auth_jwt_claims::Claims;
use log::{debug, info};

// ========================================
// CREDIT SYSTEM HANDLERS
// ========================================

#[derive(Debug, Deserialize)]
pub struct PaginationQuery {
    #[serde(default = "default_limit")]
    pub limit: i32,
    #[serde(default = "default_offset")]
    pub offset: i32,
}

#[derive(Debug, Deserialize)]
pub struct AdminAdjustCreditsRequest {
    pub user_id: Uuid,
    pub amount: BigDecimal,
    pub transaction_type: String,
    pub description: String,
}

fn default_limit() -> i32 { 20 }
fn default_offset() -> i32 { 0 }

// Extended pagination query for compatibility with standalone handlers
#[derive(Debug, Deserialize)]
pub struct ExtendedPaginationQuery {
    pub limit: Option<i64>,
    pub offset: Option<i64>,
}


/// Get available credit packs
#[get("/packs")]
pub async fn get_credit_packs(
    credit_service: web::Data<CreditService>,
) -> Result<HttpResponse, AppError> {
    debug!("Getting available credit packs");
    
    let credit_packs = credit_service.get_available_credit_packs().await?;
    
    let client_packs: Vec<ClientCreditPack> = credit_packs.into_iter().map(|pack| {
        ClientCreditPack {
            id: pack.id,
            name: pack.name,
            value_credits: pack.value_credits.to_string(),
            price_amount: pack.price_amount.to_string(),
            currency: pack.currency,
            description: pack.description,
            recommended: pack.recommended,
            bonus_percentage: pack.bonus_percentage.map(|bp| bp.to_string()),
            is_popular: pack.is_popular,
            is_active: pack.is_active,
            display_order: pack.display_order,
            stripe_price_id: pack.stripe_price_id,
        }
    }).collect();
    
    let response = CreditPacksResponse {
        packs: client_packs,
    };
    
    Ok(HttpResponse::Ok().json(response))
}

/// Get user's current credit balance
#[get("/balance")]
pub async fn get_credit_balance(
    user_id: UserId,
    billing_service: web::Data<BillingService>,
) -> Result<HttpResponse, AppError> {
    debug!("Getting credit balance for user: {}", user_id.0);
    
    let credit_repo = UserCreditRepository::new(billing_service.get_system_db_pool());
    let balance = credit_repo.get_balance(&user_id.0).await?;
    
    let response = match balance {
        Some(credit) => serde_json::json!({
            "userId": user_id.0,
            "balance": credit.balance.to_f64().unwrap_or(0.0),
            "currency": credit.currency,
            "lastUpdated": credit.updated_at.map(|dt| dt.to_rfc3339())
        }),
        None => serde_json::json!({
            "userId": user_id.0,
            "balance": 0.0,
            "currency": "USD",
            "lastUpdated": Option::<String>::None
        })
    };
    
    Ok(HttpResponse::Ok().json(response))
}

/// Get user's credit transaction history (replaces get_credit_history)
pub async fn get_credit_transaction_history(
    user_id: UserId,
    query: web::Query<ExtendedPaginationQuery>,
    credit_service: web::Data<CreditService>,
) -> Result<HttpResponse, AppError> {
    let limit = query.limit.unwrap_or(20);
    let offset = query.offset.unwrap_or(0);
    
    let transactions = credit_service
        .get_transaction_history(&user_id.0, Some(limit), Some(offset))
        .await?;
    
    // Get total count for pagination
    let total_count = credit_service.get_transaction_count(&user_id.0).await?;
    
    // Get current balance for enhanced response
    let balance = credit_service.get_user_balance(&user_id.0).await?;
    
    #[derive(Debug, Serialize)]
    #[serde(rename_all = "camelCase")]
    pub struct CreditHistoryResponse {
        pub transactions: Vec<serde_json::Value>,
        pub total_count: i64,
        pub has_more: bool,
        pub current_balance: BigDecimal,
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
        current_balance: balance.balance,
    };
    
    Ok(HttpResponse::Ok().json(response))
}


// ========================================
// MODERN PAYMENT INTENT HANDLERS FOR CREDITS
// ========================================

#[derive(Debug, Deserialize)]
pub struct CreatePaymentIntentRequest {
    pub credit_pack_id: String,
    pub save_payment_method: Option<bool>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PaymentIntentResponse {
    pub client_secret: String,
    pub publishable_key: String,
    pub amount: i64,
    pub currency: String,
    pub description: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ClientCreditPack {
    pub id: String,
    pub name: String,
    pub value_credits: String,
    pub price_amount: String,
    pub currency: String,
    pub description: Option<String>,
    pub recommended: bool,
    pub bonus_percentage: Option<String>,
    pub is_popular: Option<bool>,
    pub is_active: bool,
    pub display_order: i32,
    pub stripe_price_id: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CreditPacksResponse {
    pub packs: Vec<ClientCreditPack>,
}

/// Get comprehensive credit details with stats, balance, and transaction history
pub async fn get_credit_details(
    user_id: UserId,
    query: web::Query<ExtendedPaginationQuery>,
    credit_service: web::Data<CreditService>,
) -> Result<HttpResponse, AppError> {
    let limit = query.limit.unwrap_or(20);
    let offset = query.offset.unwrap_or(0);
    
    let credit_details = credit_service
        .get_credit_details(&user_id.0, Some(limit), Some(offset))
        .await?;
    
    Ok(HttpResponse::Ok().json(credit_details))
}

/// Get specific credit pack by ID
pub async fn get_credit_pack_by_id(
    path: web::Path<String>,
    credit_service: web::Data<CreditService>,
) -> Result<HttpResponse, AppError> {
    let pack_id = path.into_inner();
    let pack = credit_service.get_credit_pack_by_id(&pack_id).await?
        .ok_or_else(|| AppError::NotFound(format!("Credit pack not found: {}", pack_id)))?;
    
    Ok(HttpResponse::Ok().json(pack))
}

// Admin-only authorization middleware required
/// Admin endpoint to adjust credits
pub async fn admin_adjust_credits(
    req: HttpRequest,
    payload: web::Json<AdminAdjustCreditsRequest>,
    credit_service: web::Data<CreditService>,
) -> Result<HttpResponse, AppError> {
    let _claims = req.extensions().get::<Claims>().ok_or_else(|| {
        AppError::Unauthorized("Missing authentication claims".to_string())
    })?.clone();
    
    let request = payload.into_inner();
    
    // Adjust credit balance with admin metadata
    let admin_metadata = serde_json::json!({
        "admin_adjustment": true,
        "adjustment_type": if request.amount > BigDecimal::from(0) { "credit" } else { "debit" },
        "transaction_type": request.transaction_type
    });
    
    let updated_balance = credit_service.adjust_credits(
        &request.user_id,
        &request.amount,
        request.description.clone(),
        Some(admin_metadata),
    ).await?;
    
    Ok(HttpResponse::Ok().json(serde_json::json!({
        "success": true,
        "adjustment": {
            "userId": request.user_id,
            "amount": request.amount.to_string(),
            "transactionType": request.transaction_type,
            "description": request.description,
            "adjustedAt": chrono::Utc::now()
        },
        "newBalance": updated_balance.balance,
        "currency": updated_balance.currency
    })))
}

/// Create a PaymentIntent for credit purchase (modern embedded payment flow)
#[post("/payment-intent")]
pub async fn create_credit_payment_intent(
    billing_service: web::Data<BillingService>,
    user_id: UserId,
    req: web::Json<CreatePaymentIntentRequest>,
) -> Result<HttpResponse, AppError> {
    info!("Creating PaymentIntent for credit pack: {} for user: {}", req.credit_pack_id, user_id.0);
    
    let payment_intent = billing_service.create_credit_payment_intent(
        &user_id.0,
        &req.credit_pack_id,
        req.save_payment_method.unwrap_or(false)
    ).await?;
    
    let publishable_key = billing_service.get_stripe_publishable_key()?;
    
    let response = PaymentIntentResponse {
        client_secret: payment_intent.client_secret.unwrap_or_default(),
        publishable_key,
        amount: payment_intent.amount,
        currency: payment_intent.currency.to_string(),
        description: payment_intent.description.unwrap_or_else(|| "Credit purchase".to_string()),
    };
    
    info!("Successfully created PaymentIntent for user: {}", user_id.0);
    Ok(HttpResponse::Ok().json(response))
}