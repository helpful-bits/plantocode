use actix_web::{get, web, HttpResponse, Result};
use std::sync::Arc;
use serde::{Deserialize, Serialize};
use log::{info};

use crate::models::AuthenticatedUser;
use crate::error::AppError;
use crate::models::ListInvoicesResponse;
use crate::services::billing_service::BillingService;

#[derive(Debug, Deserialize)]
pub struct InvoiceQueryParams {
    pub limit: Option<i32>,
    pub starting_after: Option<String>,
}

#[get("/invoices")]
pub async fn list_invoices(
    user: web::ReqData<AuthenticatedUser>,
    billing_service: web::Data<Arc<BillingService>>,
    query: web::Query<InvoiceQueryParams>,
) -> Result<HttpResponse, AppError> {
    // Validate and sanitize pagination parameters
    let limit = query.limit.unwrap_or(50).clamp(1, 100); // Limit between 1 and 100
    
    
    let response = billing_service
        .list_invoices_for_user(user.user_id, limit, query.starting_after.clone())
        .await?;
    
    info!("Successfully retrieved {} invoices for user {}", response.invoices.len(), user.user_id);
    Ok(HttpResponse::Ok().json(response))
}