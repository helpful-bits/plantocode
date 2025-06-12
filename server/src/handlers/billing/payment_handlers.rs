use actix_web::{web, HttpResponse, get, post};
use serde::{Deserialize, Serialize};
use crate::error::AppError;
use crate::services::billing_service::BillingService;
use crate::middleware::secure_auth::UserId;
use crate::models::runtime_config::AppState;
use crate::db::repositories::subscription_plan_repository::{PlanFeatures, SpendingDetails};
use log::{debug, info, error};
use bigdecimal::{BigDecimal, ToPrimitive};
use std::collections::HashMap;

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
    
    // Get customer ID from database
    let customer_id = billing_service.get_or_create_stripe_customer(&user_id.0).await?;
    
    // Get payment methods from Stripe
    let stripe_service = billing_service.get_stripe_service()?;
    let payment_methods = stripe_service.list_payment_methods(&customer_id).await
        .map_err(|e| AppError::External(format!("Failed to get payment methods: {}", e)))?;
    
    // Convert to frontend format
    let methods: Vec<serde_json::Value> = payment_methods.into_iter().map(|pm| {
        serde_json::json!({
            "id": pm.id,
            "type": format!("{:?}", pm.type_),
            "card": pm.card.as_ref().map(|card| serde_json::json!({
                "brand": card.brand,
                "last4": card.last4,
                "exp_month": card.exp_month,
                "exp_year": card.exp_year,
            })),
            "created": pm.created,
        })
    }).collect();
    
    let response = serde_json::json!({
        "totalMethods": methods.len(),
        "hasDefault": !methods.is_empty(), // Simplified - first method is considered default
        "methods": methods
    });
    
    Ok(HttpResponse::Ok().json(response))
}

/// Get invoice history from Stripe with portal redirect
#[get("/invoices")]
pub async fn get_invoice_history(
    user_id: UserId,
    billing_service: web::Data<BillingService>,
    query: web::Query<InvoiceFilterQuery>,
) -> Result<HttpResponse, AppError> {
    debug!("Getting invoice history from Stripe for user: {}", user_id.0);
    
    // Get user's Stripe customer ID
    let customer_id = billing_service.get_or_create_stripe_customer(&user_id.0).await?;
    
    // Get invoices from Stripe
    let stripe_service = billing_service.get_stripe_service()?;
    let invoices = stripe_service.list_invoices(&customer_id).await
        .map_err(|e| AppError::External(format!("Failed to get invoices: {}", e)))?;
    
    // Create billing portal session for full invoice management
    let return_url = "https://app.vibemanager.com/billing";
    let portal_session = stripe_service.create_billing_portal_session(
        &customer_id,
        return_url,
    ).await?;
    
    #[derive(Debug, Serialize)]
    #[serde(rename_all = "camelCase")]
    pub struct InvoiceSummary {
        pub id: String,
        pub amount: f64,
        pub status: String,
        pub created_date: String,
    }
    
    // Convert invoices to frontend format
    let recent_summaries: Vec<InvoiceSummary> = invoices.into_iter().take(10).map(|invoice| {
        InvoiceSummary {
            id: invoice.id.to_string(),
            amount: invoice.amount_due.unwrap_or(0) as f64 / 100.0, // Stripe amounts in cents
            status: format!("{:?}", invoice.status.unwrap_or(stripe::InvoiceStatus::Draft)),
            created_date: invoice.created.and_then(|timestamp| {
                chrono::DateTime::from_timestamp(timestamp, 0)
                    .map(|dt| dt.to_rfc3339())
            }).unwrap_or_else(|| chrono::Utc::now().to_rfc3339()),
        }
    }).collect();
    
    let response = serde_json::json!({
        "redirectToPortal": true,
        "portalUrl": portal_session.url,
        "summary": {
            "recentInvoices": recent_summaries,
            "totalCount": recent_summaries.len()
        },
        "message": "Full invoice history and downloads are available via Stripe Customer Portal."
    });
    
    Ok(HttpResponse::Ok().json(response))
}

// ========================================
// MODERN PAYMENT INTENT HANDLERS (2024)
// ========================================

#[derive(Debug, Deserialize)]
pub struct CreateSubscriptionIntentRequest {
    pub plan_id: String,
    pub trial_days: Option<u32>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SubscriptionIntentResponse {
    pub subscription_id: String,
    pub client_secret: Option<String>, // For SetupIntent or PaymentIntent
    pub publishable_key: String,
    pub status: String,
    pub trial_end: Option<String>,
}

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

/// Create a subscription with SetupIntent for trial (modern embedded payment flow)
#[post("/api/billing/subscriptions/create-with-intent")]
pub async fn create_subscription_with_intent(
    billing_service: web::Data<BillingService>,
    user_id: UserId,
    req: web::Json<CreateSubscriptionIntentRequest>,
) -> Result<HttpResponse, AppError> {
    info!("Creating subscription with intent for plan: {} for user: {}", req.plan_id, user_id.0);
    
    let subscription = billing_service.create_subscription_with_trial(
        &user_id.0,
        &req.plan_id,
    ).await?;
    
    let publishable_key = billing_service.get_stripe_publishable_key()?;
    
    let response = SubscriptionIntentResponse {
        subscription_id: subscription.id.to_string(),
        client_secret: subscription.latest_invoice
            .and_then(|invoice| match invoice {
                stripe::Expandable::Id(_) => None,
                stripe::Expandable::Object(invoice_obj) => {
                    invoice_obj.payment_intent.and_then(|pi| match pi {
                        stripe::Expandable::Id(_) => None,
                        stripe::Expandable::Object(pi_obj) => pi_obj.client_secret,
                    })
                }
            }),
        publishable_key,
        status: format!("{:?}", subscription.status),
        trial_end: subscription.trial_end.and_then(|t| {
            chrono::DateTime::from_timestamp(t, 0)
                .map(|dt| dt.to_rfc3339())
        }),
    };
    
    info!("Successfully created subscription with intent for user: {}", user_id.0);
    Ok(HttpResponse::Ok().json(response))
}

/// Create a SetupIntent for saving payment method without charging
#[post("/api/billing/setup-intents")]
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
#[get("/api/billing/payment-intents/{payment_intent_id}/status")]
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
#[get("/api/billing/stripe/publishable-key")]
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
// SUBSCRIPTION PLAN HANDLERS
// ========================================

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PlanLimits {
    pub monthly_allowance: f64,
    pub overage_rate: f64,
    pub hard_limit_multiplier: f64,
    pub models: Vec<String>,
    pub support: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PlanDetails {
    pub name: String,
    pub price: String,
    pub period: String,
    pub features: Vec<String>,
    pub limits: PlanLimits,
}

/// Get available subscription plans
#[get("/plans")]
pub async fn get_available_plans(
    app_state: web::Data<crate::models::runtime_config::AppState>,
) -> Result<HttpResponse, AppError> {
    debug!("Getting available subscription plans");
    
    let plans = app_state.subscription_plan_repository.get_all_plans().await?;
    
    let mut response: HashMap<String, PlanDetails> = HashMap::new();
    
    for plan in plans {
        let price = if plan.base_price_monthly == BigDecimal::from(0) {
            "$0".to_string()
        } else {
            format!("${}", plan.base_price_monthly.to_i32().unwrap_or(0))
        };
        
        let period = if plan.base_price_monthly == BigDecimal::from(0) {
            "forever".to_string()
        } else {
            "month".to_string()
        };
        
        // Get typed features (fallback to defaults if parsing fails)
        let typed_features = plan.get_typed_features().unwrap_or_else(|e| {
            error!("Failed to parse features for plan '{}': {}", plan.id, e);
            PlanFeatures {
                core_features: vec!["Basic features".to_string()],
                allowed_models: vec!["basic".to_string()],
                support_level: "Standard".to_string(),
                api_access: false,
                analytics_level: "Basic".to_string(),
                spending_details: SpendingDetails {
                    overage_policy: "none".to_string(),
                    hard_cutoff: true,
                },
            }
        });
        
        let features = typed_features.core_features;
        let models = typed_features.allowed_models;
        let support = typed_features.support_level;
        
        response.insert(plan.id.clone(), PlanDetails {
            name: plan.name,
            price,
            period,
            features,
            limits: PlanLimits {
                monthly_allowance: plan.included_spending_monthly.to_f64().unwrap_or(0.0),
                overage_rate: plan.overage_rate.to_f64().unwrap_or(0.0),
                hard_limit_multiplier: plan.hard_limit_multiplier.to_f64().unwrap_or(0.0),
                models,
                support,
            },
        });
    }
    
    Ok(HttpResponse::Ok().json(response))
}

// ========================================
// PAYMENT METHOD MANAGEMENT HANDLERS
// ========================================

/// Delete/detach a payment method
#[actix_web::delete("/payment-methods/{payment_method_id}")]
pub async fn delete_payment_method(
    user_id: UserId,
    billing_service: web::Data<BillingService>,
    path: web::Path<String>,
) -> Result<HttpResponse, AppError> {
    let payment_method_id = path.into_inner();
    debug!("Deleting payment method {} for user: {}", payment_method_id, user_id.0);
    
    // Use billing service to delete payment method
    billing_service.delete_payment_method(&user_id.0, &payment_method_id).await?;
    
    Ok(HttpResponse::Ok().json(serde_json::json!({
        "success": true,
        "message": "Payment method deleted successfully"
    })))
}

/// Set default payment method
#[actix_web::post("/payment-methods/{payment_method_id}/set-default")]
pub async fn set_default_payment_method(
    user_id: UserId,
    billing_service: web::Data<BillingService>,
    path: web::Path<String>,
) -> Result<HttpResponse, AppError> {
    let payment_method_id = path.into_inner();
    debug!("Setting payment method {} as default for user: {}", payment_method_id, user_id.0);
    
    // Use billing service to set default payment method
    billing_service.set_default_payment_method(&user_id.0, &payment_method_id).await?;
    
    Ok(HttpResponse::Ok().json(serde_json::json!({
        "success": true,
        "message": "Default payment method updated successfully"
    })))
}