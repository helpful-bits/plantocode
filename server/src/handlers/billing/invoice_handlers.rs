use actix_web::{get, web, HttpResponse, Result};
use serde::{Deserialize, Serialize};

use crate::error::AppError;
use crate::middleware::secure_auth::UserId;
use crate::models::{Invoice, ListInvoicesResponse};
use crate::services::billing_service::BillingService;

#[derive(Debug, Deserialize)]
pub struct InvoiceQueryParams {
    pub limit: Option<i32>,
    pub offset: Option<i32>,
}

#[get("/invoices")]
pub async fn list_invoices(
    user_id: UserId,
    billing_service: web::Data<BillingService>,
    query: web::Query<InvoiceQueryParams>,
) -> Result<HttpResponse, AppError> {
    let limit = query.limit.unwrap_or(50);
    let offset = query.offset.unwrap_or(0);
    
    let response = billing_service
        .list_invoices_for_user(user_id.0, limit, offset)
        .await?;
    
    Ok(HttpResponse::Ok().json(response))
}