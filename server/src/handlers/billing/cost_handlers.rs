use actix_web::{web, HttpResponse};
use std::sync::Arc;
use crate::{
    error::AppError,
    models::AuthenticatedUser,
    services::billing_service::BillingService,
};

pub async fn get_final_streaming_cost(
    user: web::ReqData<AuthenticatedUser>,
    path: web::Path<String>,
    billing_service: web::Data<Arc<BillingService>>,
) -> Result<HttpResponse, AppError> {
    let request_id = path.into_inner();
    
    let final_cost = billing_service
        .get_final_streaming_cost(&request_id)
        .await?;
    
    match final_cost {
        Some(cost) => {
            // Verify user owns this request
            if cost.user_id != user.user_id {
                return Err(AppError::Forbidden("Access denied to this cost data".to_string()));
            }
            Ok(HttpResponse::Ok().json(cost))
        }
        None => Ok(HttpResponse::NotFound().json(serde_json::json!({
            "error": "Cost data not found for this request"
        })))
    }
}