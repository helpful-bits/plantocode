use actix_web::{web, HttpResponse, get, post};
use serde::{Deserialize, Serialize};
use crate::error::AppError;
use crate::services::billing_service::BillingService;
use crate::middleware::secure_auth::UserId;
use crate::stripe_types::*;
use log::{debug, info};

// ========================================
// STRIPE CHECKOUT HANDLERS
// ========================================

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateCustomCreditCheckoutRequest {
    pub amount: f64,
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

/// Create a checkout session for custom credit purchase
#[post("/custom-credit-session")]
pub async fn create_custom_credit_checkout_session_handler(
    user_id: UserId,
    billing_service: web::Data<BillingService>,
    request: web::Json<CreateCustomCreditCheckoutRequest>,
) -> Result<HttpResponse, AppError> {
    info!("Creating custom credit checkout session for user: {} with amount: {}", 
          user_id.0, request.amount);
    
    let session = billing_service.create_credit_purchase_checkout_session(
        &user_id.0,
        request.amount,
    ).await?;
    
    let response = CheckoutSessionResponse {
        session_id: session.id.to_string(),
        url: session.url.unwrap_or_default(),
    };
    
    info!("Successfully created custom credit checkout session for user: {}", user_id.0);
    Ok(HttpResponse::Ok().json(response))
}


/// Create a setup checkout session for payment method addition
#[post("/setup-session")]
pub async fn create_setup_checkout_session_handler(
    user_id: UserId,
    billing_service: web::Data<BillingService>,
) -> Result<HttpResponse, AppError> {
    info!("Creating setup checkout session for user: {}", user_id.0);
    
    let session = billing_service.create_setup_checkout_session(
        &user_id.0,
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
    
    let session_status = session.status.as_deref().unwrap_or(CHECKOUT_SESSION_STATUS_OPEN);
    let payment_status = session.payment_status.as_deref().unwrap_or("unpaid");
    
    let response = CheckoutSessionStatusResponse {
        status: session_status.to_string(),
        payment_status: payment_status.to_string(),
        customer_email: session.customer_email,
    };
    
    info!("Successfully retrieved checkout session status for user: {}", user_id.0);
    Ok(HttpResponse::Ok().json(response))
}