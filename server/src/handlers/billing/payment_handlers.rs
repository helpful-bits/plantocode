use actix_web::{web, HttpResponse, get, post};
use serde::{Deserialize, Serialize};
use crate::error::AppError;
use crate::services::billing_service::BillingService;
use crate::middleware::secure_auth::UserId;
use log::{debug, info};

// ========================================
// PAYMENT METHOD AND BILLING HANDLERS
// ========================================


#[derive(Debug, Deserialize)]
pub struct PaginationQuery {
    #[serde(default = "default_limit")]
    pub limit: i32,
    #[serde(default = "default_offset")]
    pub offset: i32,
}


fn default_limit() -> i32 { 20 }
fn default_offset() -> i32 { 0 }


#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PortalResponse {
    pub url: String,
}


/// Create a billing portal session for managing subscription
#[post("/create-portal-session")]
pub async fn create_billing_portal_session(
    user_id: UserId,
    billing_service: web::Data<BillingService>,
) -> Result<HttpResponse, AppError> {
    debug!("Creating billing portal for user: {}", user_id.0);
    
    let url = billing_service.create_billing_portal_session(&user_id.0).await?;
    
    Ok(HttpResponse::Ok().json(PortalResponse { url }))
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PaymentMethodsResponse {
    pub total_methods: usize,
    pub has_default: bool,
    pub methods: Vec<serde_json::Value>,
}

/// Get payment methods from Stripe
#[get("/payment-methods")]
pub async fn get_payment_methods(
    user_id: UserId,
    billing_service: web::Data<BillingService>,
    pagination: web::Query<PaginationQuery>,
) -> Result<HttpResponse, AppError> {
    debug!("Getting payment methods from Stripe for user: {}", user_id.0);
    
    // Get detailed payment methods with default flag from billing service
    let methods = billing_service.get_detailed_payment_methods(&user_id.0).await?;
    
    let response = PaymentMethodsResponse {
        total_methods: methods.len(),
        has_default: methods.iter().any(|m| m["isDefault"].as_bool().unwrap_or(false)),
        methods,
    };
    
    Ok(HttpResponse::Ok().json(response))
}


// ========================================
// MODERN PAYMENT INTENT HANDLERS (2024)
// ========================================



#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PublishableKeyResponse {
    pub publishable_key: String,
}




/// Get Stripe publishable key for frontend
#[get("/stripe/publishable-key")]
pub async fn get_stripe_publishable_key(
    billing_service: web::Data<BillingService>,
    _user_id: UserId, // Authentication required but user-agnostic
) -> Result<HttpResponse, AppError> {
    debug!("Getting Stripe publishable key");
    
    let publishable_key = billing_service.get_stripe_publishable_key()?;
    
    let response = PublishableKeyResponse {
        publishable_key,
    };
    
    Ok(HttpResponse::Ok().json(response))
}


// ========================================
// PAYMENT METHOD MANAGEMENT HANDLERS
// ========================================


