use actix_web::{web, HttpResponse, get, post};
use std::sync::Arc;
use serde::{Deserialize, Serialize};
use crate::error::AppError;
use crate::services::billing_service::BillingService;
use crate::models::AuthenticatedUser;
use crate::models::billing::{AutoTopOffSettings, UpdateAutoTopOffRequest};
use log::{info};
use bigdecimal::{BigDecimal, FromPrimitive};


// ========================================
// AUTO TOP-OFF HANDLERS
// ========================================


/// Get auto top-off settings for the user
#[get("/auto-top-off-settings")]
pub async fn get_auto_top_off_settings_handler(
    user: web::ReqData<AuthenticatedUser>,
    billing_service: web::Data<Arc<BillingService>>,
) -> Result<HttpResponse, AppError> {
    
    let settings = billing_service.get_auto_top_off_settings(&user.user_id).await?;
    
    info!("Successfully retrieved auto top-off settings for user: {}", user.user_id);
    Ok(HttpResponse::Ok().json(settings))
}

/// Update auto top-off settings for the user
#[post("/auto-top-off-settings")]
pub async fn update_auto_top_off_settings_handler(
    user: web::ReqData<AuthenticatedUser>,
    request: web::Json<UpdateAutoTopOffRequest>,
    billing_service: web::Data<Arc<BillingService>>,
) -> Result<HttpResponse, AppError> {
    
    // Validate the request
    let threshold_decimal = if request.enabled {
        if let Some(threshold_str) = &request.threshold {
            let threshold = BigDecimal::parse_bytes(threshold_str.as_bytes(), 10)
                .ok_or_else(|| AppError::BadRequest("Invalid threshold format".to_string()))?;
            if threshold <= BigDecimal::from(0) || threshold > BigDecimal::from(1000) {
                return Err(AppError::BadRequest("Auto top-off threshold must be between $0.01 and $1000.00".to_string()));
            }
            Some(threshold)
        } else {
            return Err(AppError::BadRequest("Auto top-off threshold is required when auto top-off is enabled".to_string()));
        }
    } else {
        request.threshold.as_ref().map(|t| BigDecimal::parse_bytes(t.as_bytes(), 10).unwrap_or_default())
    };
    
    let amount_decimal = if request.enabled {
        if let Some(amount_str) = &request.amount {
            let amount = BigDecimal::parse_bytes(amount_str.as_bytes(), 10)
                .ok_or_else(|| AppError::BadRequest("Invalid amount format".to_string()))?;
            if amount <= BigDecimal::from(0) || amount > BigDecimal::from(1000) {
                return Err(AppError::BadRequest("Auto top-off amount must be between $0.01 and $1000.00".to_string()));
            }
            Some(amount)
        } else {
            return Err(AppError::BadRequest("Auto top-off amount is required when auto top-off is enabled".to_string()));
        }
    } else {
        request.amount.as_ref().map(|a| BigDecimal::parse_bytes(a.as_bytes(), 10).unwrap_or_default())
    };
    
    let settings = billing_service.update_auto_top_off_settings(
        &user.user_id,
        request.enabled,
        threshold_decimal,
        amount_decimal,
    ).await?;
    
    info!("Successfully updated auto top-off settings for user: {}", user.user_id);
    Ok(HttpResponse::Ok().json(settings))
}

