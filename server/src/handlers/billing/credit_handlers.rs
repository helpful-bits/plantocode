use actix_web::{web, HttpResponse, get, post, HttpRequest, HttpMessage};
use serde::{Deserialize, Serialize};
use uuid::Uuid;
use bigdecimal::{BigDecimal, ToPrimitive, FromPrimitive};
use crate::error::AppError;
use crate::services::billing_service::BillingService;
use crate::services::credit_service::CreditService;
use crate::db::repositories::user_credit_repository::UserCreditRepository;
use crate::db::repositories::credit_transaction_repository::CreditTransactionRepository;
use crate::db::repositories::UserCredit;
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
        Some(credit) => credit,
        None => {
            let default_credit = UserCredit {
                user_id: user_id.0,
                balance: BigDecimal::from(0),
                currency: "USD".to_string(),
                created_at: Some(chrono::Utc::now()),
                updated_at: None,
            };
            default_credit
        }
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
    
    let credit_details = credit_service
        .get_credit_details(&user_id.0, Some(limit), Some(offset))
        .await?;
    
    #[derive(Debug, Serialize)]
    #[serde(rename_all = "camelCase")]
    pub struct CreditTransactionEntry {
        pub id: String,
        pub amount: f64,
        pub currency: String,
        pub transaction_type: String,
        pub description: String,
        pub created_at: String,
        pub balance_after: f64,
    }

    #[derive(Debug, Serialize)]
    #[serde(rename_all = "camelCase")]
    pub struct CreditHistoryResponse {
        pub transactions: Vec<CreditTransactionEntry>,
        pub total_count: i64,
        pub has_more: bool,
    }
    
    let transactions: Vec<CreditTransactionEntry> = credit_details.transactions
        .into_iter()
        .map(|transaction| CreditTransactionEntry {
            id: transaction.id.to_string(),
            amount: transaction.amount.to_f64().unwrap_or(0.0),
            currency: transaction.currency,
            transaction_type: transaction.transaction_type,
            description: transaction.description.unwrap_or_default(),
            created_at: transaction.created_at
                .map(|dt| dt.format("%Y-%m-%dT%H:%M:%S%.3fZ").to_string())
                .unwrap_or_default(),
            balance_after: transaction.balance_after.to_f64().unwrap_or(0.0),
        })
        .collect();
    
    let response = CreditHistoryResponse {
        transactions,
        total_count: credit_details.total_transaction_count,
        has_more: credit_details.has_more,
    };
    
    Ok(HttpResponse::Ok().json(response))
}


// ========================================
// MODERN PAYMENT INTENT HANDLERS FOR CREDITS
// ========================================

#[derive(Debug, Deserialize)]
pub struct CreatePaymentIntentRequest {
    pub amount: f64,
    pub currency: String,
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


// Admin-only authorization middleware required
/// Admin endpoint to adjust credits
pub async fn admin_adjust_credits(
    user_id: UserId,
    payload: web::Json<AdminAdjustCreditsRequest>,
    credit_service: web::Data<CreditService>,
) -> Result<HttpResponse, AppError> {
    // User ID is already extracted by authentication middleware
    let _admin_user_id = user_id.0;
    
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


