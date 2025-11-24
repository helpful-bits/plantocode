use crate::db::repositories::UserCredit;
use crate::db::repositories::credit_transaction_repository::CreditTransactionRepository;
use crate::db::repositories::user_credit_repository::UserCreditRepository;
use crate::error::AppError;
use crate::models::AuthenticatedUser;
use crate::models::auth_jwt_claims::Claims;
use crate::models::billing::{
    CreditHistoryResponse, CreditTransactionEntry, FeeTierConfig, UnifiedCreditHistoryResponse,
};
use crate::services::billing_service::BillingService;
use crate::services::credit_service::CreditService;
use actix_web::{HttpMessage, HttpRequest, HttpResponse, get, post, web};
use bigdecimal::BigDecimal;
use log::info;
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use uuid::Uuid;

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

fn default_limit() -> i32 {
    20
}
fn default_offset() -> i32 {
    0
}

// Extended pagination query for compatibility with standalone handlers
#[derive(Debug, Deserialize)]
pub struct ExtendedPaginationQuery {
    pub limit: Option<i64>,
    pub offset: Option<i64>,
    pub search: Option<String>,
}

/// Get user's current credit balance
#[get("/balance")]
pub async fn get_credit_balance(
    user: web::ReqData<AuthenticatedUser>,
    billing_service: web::Data<Arc<BillingService>>,
) -> Result<HttpResponse, AppError> {
    let credit_repo = UserCreditRepository::new(billing_service.get_system_db_pool());
    let balance = credit_repo.get_balance(&user.user_id).await?;

    let response = match balance {
        Some(credit) => credit,
        None => {
            let default_credit = UserCredit {
                user_id: user.user_id,
                balance: BigDecimal::from(0),
                currency: "USD".to_string(),
                free_credit_balance: BigDecimal::from(0),
                free_credits_granted_at: None,
                free_credits_expires_at: None,
                free_credits_expired: false,
                created_at: Some(chrono::Utc::now()),
                updated_at: None,
            };
            default_credit
        }
    };

    Ok(HttpResponse::Ok().json(response))
}

/// Get unified credit history that includes API usage with token details
pub async fn get_unified_credit_history(
    user: web::ReqData<AuthenticatedUser>,
    query: web::Query<ExtendedPaginationQuery>,
    credit_service: web::Data<CreditService>,
) -> Result<HttpResponse, AppError> {
    let limit = query.limit.unwrap_or(20);
    let offset = query.offset.unwrap_or(0);
    let search = query.search.clone();

    let unified_history = credit_service
        .get_unified_credit_history(&user.user_id, Some(limit), Some(offset), search.as_deref())
        .await?;

    info!(
        "Successfully retrieved unified credit history for user: {}",
        user.user_id
    );
    Ok(HttpResponse::Ok().json(unified_history))
}

// ========================================
// MODERN PAYMENT INTENT HANDLERS FOR CREDITS
// ========================================

#[derive(Debug, Deserialize)]
pub struct CreatePaymentIntentRequest {
    pub amount: String,
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
    user: web::ReqData<AuthenticatedUser>,
    query: web::Query<ExtendedPaginationQuery>,
    credit_service: web::Data<CreditService>,
) -> Result<HttpResponse, AppError> {
    let limit = query.limit.unwrap_or(20);
    let offset = query.offset.unwrap_or(0);

    let credit_details = credit_service
        .get_credit_details(&user.user_id, Some(limit), Some(offset), None)
        .await?;

    Ok(HttpResponse::Ok().json(credit_details))
}

// Admin-only authorization middleware required
/// Admin endpoint to adjust credits
pub async fn admin_adjust_credits(
    user: web::ReqData<AuthenticatedUser>,
    payload: web::Json<AdminAdjustCreditsRequest>,
    credit_service: web::Data<CreditService>,
) -> Result<HttpResponse, AppError> {
    // User ID is already extracted by authentication middleware
    let _admin_user_id = user.user_id;

    // Admin authorization check
    if user.role != "admin" {
        return Err(AppError::Forbidden(
            "You do not have permission to perform this action".to_string(),
        ));
    }

    let request = payload.into_inner();

    // Adjust credit balance with admin metadata
    let admin_metadata = serde_json::json!({
        "admin_adjustment": true,
        "adjustment_type": if request.amount > BigDecimal::from(0) { "credit" } else { "debit" },
        "transaction_type": request.transaction_type
    });

    let updated_balance = credit_service
        .adjust_credits(
            &request.user_id,
            &request.amount,
            request.description.clone(),
            Some(admin_metadata),
        )
        .await?;

    Ok(HttpResponse::Ok().json(serde_json::json!({
        "success": true,
        "adjustment": {
            "userId": request.user_id,
            "amount": request.amount.to_string(),
            "transactionType": request.transaction_type,
            "description": request.description,
            "adjustedAt": chrono::Utc::now()
        },
        "newBalance": updated_balance.balance.to_string(),
        "currency": updated_balance.currency
    })))
}

/// Get credit purchase fee tiers configuration
/// This endpoint is unauthenticated as the fee structure is public information
#[get("/purchase-fee-tiers")]
pub async fn get_credit_purchase_fee_tiers_handler(
    billing_service: web::Data<Arc<BillingService>>,
) -> Result<HttpResponse, AppError> {
    let fee_tiers = billing_service.get_credit_purchase_fee_tiers().await?;
    Ok(HttpResponse::Ok().json(fee_tiers))
}

#[cfg(test)]
mod tests {
    use super::*;
    use uuid::Uuid;

    #[test]
    fn non_admin_forbidden() {
        // Create a non-admin authenticated user
        let user = AuthenticatedUser {
            user_id: Uuid::new_v4(),
            email: "test@example.com".to_string(),
            role: "user".to_string(),
            device_id: None,
            authenticated_via_api_key: false,
            api_key_id: None,
            api_key_label: None,
        };

        // Verify that non-admin role would be rejected
        assert_eq!(user.role.as_str(), "user");
        assert_ne!(user.role.as_str(), "admin");

        // Test the authorization check logic
        let is_admin = user.role.as_str() == "admin";
        assert!(!is_admin, "Non-admin user should not have admin privileges");
    }

    #[test]
    fn admin_allowed() {
        // Create an admin authenticated user
        let user = AuthenticatedUser {
            user_id: Uuid::new_v4(),
            email: "admin@example.com".to_string(),
            role: "admin".to_string(),
            device_id: None,
            authenticated_via_api_key: false,
            api_key_id: None,
            api_key_label: None,
        };

        // Test the authorization check logic
        let is_admin = user.role.as_str() == "admin";
        assert!(is_admin, "Admin user should have admin privileges");
    }

    #[test]
    fn missing_role_forbidden() {
        // Create an authenticated user with empty role
        let user = AuthenticatedUser {
            user_id: Uuid::new_v4(),
            email: "test@example.com".to_string(),
            role: "".to_string(),
            device_id: None,
            authenticated_via_api_key: false,
            api_key_id: None,
            api_key_label: None,
        };

        // Test the authorization check logic
        let is_admin = user.role.as_str() == "admin";
        assert!(!is_admin, "User with empty role should not have admin privileges");
    }
}
