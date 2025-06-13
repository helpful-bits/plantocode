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

#[derive(Debug, Deserialize)]
pub struct InvoiceFilterQuery {
    #[serde(default = "default_limit")]
    pub limit: i32,
    #[serde(default = "default_offset")]
    pub offset: i32,
    pub status: Option<String>,
    pub search: Option<String>,
    pub sort_field: Option<String>,
    pub sort_direction: Option<String>, // 'asc' or 'desc'
}

fn default_limit() -> i32 { 20 }
fn default_offset() -> i32 { 0 }


#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PortalResponse {
    pub url: String,
}


/// Create a billing portal session for managing subscription
#[get("/portal")]
pub async fn create_billing_portal(
    user_id: UserId,
    billing_service: web::Data<BillingService>,
) -> Result<HttpResponse, AppError> {
    debug!("Creating billing portal for user: {}", user_id.0);
    
    // Create the billing portal session
    let url = billing_service.create_billing_portal_session(&user_id.0).await?;
    
    // Return the billing portal URL
    Ok(HttpResponse::Ok().json(PortalResponse { url }))
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
    
    let response = serde_json::json!({
        "paymentMethods": methods,
        "hasDefault": methods.iter().any(|m| m["isDefault"].as_bool().unwrap_or(false))
    });
    
    Ok(HttpResponse::Ok().json(response))
}

/// Get invoice history from Stripe
#[get("/invoices")]
pub async fn get_invoice_history(
    user_id: UserId,
    billing_service: web::Data<BillingService>,
    query: web::Query<InvoiceFilterQuery>,
) -> Result<HttpResponse, AppError> {
    debug!("Getting invoice history from Stripe for user: {}", user_id.0);
    
    // Get structured invoice history with summary from billing service
    let invoice_response = billing_service.get_invoice_history(&user_id.0, query.into_inner()).await?;
    
    // The response now includes both invoices list and summary calculated on the backend
    Ok(HttpResponse::Ok().json(invoice_response))
}

// ========================================
// MODERN PAYMENT INTENT HANDLERS (2024)
// ========================================


#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SetupIntentResponse {
    pub client_secret: String,
    pub publishable_key: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PublishableKeyResponse {
    pub publishable_key: String,
}


/// Create a SetupIntent for saving payment method without charging
#[post("/setup-intents")]
pub async fn create_setup_intent(
    billing_service: web::Data<BillingService>,
    user_id: UserId,
) -> Result<HttpResponse, AppError> {
    info!("Creating SetupIntent for user: {}", user_id.0);
    
    // Get or create Stripe customer
    let customer_id = billing_service.get_or_create_stripe_customer(&user_id.0).await?;
    
    // Create SetupIntent via the Stripe service
    let stripe_service = billing_service.get_stripe_service()?;
    let mut metadata = std::collections::HashMap::new();
    metadata.insert("user_id".to_string(), user_id.0.to_string());
    
    let setup_intent = stripe_service.create_setup_intent(&customer_id, metadata).await
        .map_err(|e| AppError::External(format!("Failed to create SetupIntent: {}", e)))?;
    
    let publishable_key = billing_service.get_stripe_publishable_key()?;
    
    let response = SetupIntentResponse {
        client_secret: setup_intent.client_secret.unwrap_or_default(),
        publishable_key,
    };
    
    info!("Successfully created SetupIntent for user: {}", user_id.0);
    Ok(HttpResponse::Ok().json(response))
}

/// Get payment intent status after client-side confirmation
#[get("/payment-intents/{payment_intent_id}/status")]
pub async fn get_payment_intent_status(
    billing_service: web::Data<BillingService>,
    user_id: UserId,
    path: web::Path<String>,
) -> Result<HttpResponse, AppError> {
    let payment_intent_id = path.into_inner();
    info!("Getting payment intent status for: {} for user: {}", payment_intent_id, user_id.0);
    
    let stripe_service = billing_service.get_stripe_service()?;
    let payment_intent = stripe_service.get_payment_intent(&payment_intent_id).await
        .map_err(|e| AppError::External(format!("Failed to get PaymentIntent: {}", e)))?;
    
    let status = serde_json::json!({
        "id": payment_intent.id,
        "status": format!("{:?}", payment_intent.status),
        "amount": payment_intent.amount,
        "currency": payment_intent.currency.to_string(),
        "description": payment_intent.description,
        "metadata": payment_intent.metadata
    });
    
    info!("Successfully retrieved payment intent status for user: {}", user_id.0);
    Ok(HttpResponse::Ok().json(status))
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

