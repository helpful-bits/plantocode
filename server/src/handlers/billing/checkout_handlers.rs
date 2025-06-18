use actix_web::{web, HttpResponse, get, post};
use serde::{Deserialize, Serialize};
use crate::error::AppError;
use crate::services::billing_service::BillingService;
use crate::middleware::secure_auth::UserId;
use log::{debug, info};

// ========================================
// STRIPE CHECKOUT HANDLERS
// ========================================

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateCreditCheckoutRequest {
    pub credit_pack_id: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateSubscriptionCheckoutRequest {
    pub plan_id: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CheckoutSessionResponse {
    pub session_id: String,
    pub url: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CheckoutSessionStatusResponse {
    pub status: String,
    pub customer_email: Option<String>,
    pub payment_status: String,
}

/// Create a checkout session for credit purchase
#[post("/credit-session")]
pub async fn create_credit_checkout_session_handler(
    user_id: UserId,
    billing_service: web::Data<BillingService>,
    request: web::Json<CreateCreditCheckoutRequest>,
) -> Result<HttpResponse, AppError> {
    info!("Creating credit checkout session for user: {} with credit pack: {}", 
          user_id.0, request.credit_pack_id);
    
    // Generate success and cancel URLs
    let success_url = "http://localhost:1420/billing/success".to_string();
    let cancel_url = "http://localhost:1420/billing/cancel".to_string();
    
    let session = billing_service.create_credit_checkout_session(
        &user_id.0,
        &request.credit_pack_id,
        &success_url,
        &cancel_url,
    ).await?;
    
    let response = CheckoutSessionResponse {
        session_id: session.id.to_string(),
        url: session.url.unwrap_or_default(),
    };
    
    info!("Successfully created credit checkout session for user: {}", user_id.0);
    Ok(HttpResponse::Ok().json(response))
}

/// Create a checkout session for subscription
#[post("/subscription-session")]
pub async fn create_subscription_checkout_session_handler(
    user_id: UserId,
    billing_service: web::Data<BillingService>,
    request: web::Json<CreateSubscriptionCheckoutRequest>,
) -> Result<HttpResponse, AppError> {
    info!("Creating subscription checkout session for user: {}", user_id.0);
    
    // Generate success and cancel URLs
    let success_url = "http://localhost:1420/billing/success".to_string();
    let cancel_url = "http://localhost:1420/billing/cancel".to_string();
    
    let session = billing_service.create_subscription_checkout_session(
        &user_id.0,
        &request.plan_id,
        &success_url,
        &cancel_url,
    ).await?;
    
    let response = CheckoutSessionResponse {
        session_id: session.id.to_string(),
        url: session.url.unwrap_or_default(),
    };
    
    info!("Successfully created subscription checkout session for user: {}", user_id.0);
    Ok(HttpResponse::Ok().json(response))
}

/// Create a setup checkout session for payment method addition
#[post("/setup-session")]
pub async fn create_setup_checkout_session_handler(
    user_id: UserId,
    billing_service: web::Data<BillingService>,
) -> Result<HttpResponse, AppError> {
    info!("Creating setup checkout session for user: {}", user_id.0);
    
    // Generate success and cancel URLs
    let success_url = "http://localhost:1420/billing/payment-method/success".to_string();
    let cancel_url = "http://localhost:1420/billing/payment-method/cancel".to_string();
    
    let session = billing_service.create_setup_checkout_session(
        &user_id.0,
        &success_url,
        &cancel_url,
    ).await?;
    
    let response = CheckoutSessionResponse {
        session_id: session.id.to_string(),
        url: session.url.unwrap_or_default(),
    };
    
    info!("Successfully created setup checkout session for user: {}", user_id.0);
    Ok(HttpResponse::Ok().json(response))
}

/// Get checkout session status
#[get("/session-status/{session_id}")]
pub async fn get_checkout_session_status_handler(
    user_id: UserId,
    billing_service: web::Data<BillingService>,
    path: web::Path<String>,
) -> Result<HttpResponse, AppError> {
    let session_id = path.into_inner();
    info!("Getting checkout session status {} for user: {}", session_id, user_id.0);
    
    let session = billing_service.get_checkout_session_status(&session_id).await?;
    
    info!("Successfully retrieved checkout session status for user: {}", user_id.0);
    Ok(HttpResponse::Ok().json(session))
}