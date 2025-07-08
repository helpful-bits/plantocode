use actix_web::{web, HttpResponse};
use serde::{Deserialize, Serialize};
use uuid::Uuid;
use log::{error, info};

use crate::error::AppError;
use crate::middleware::secure_auth::UserId;
use crate::services::billing_service::BillingService;


#[derive(Debug, Serialize)]
pub struct FinalCostResponse {
    pub cost: f64,
    pub tokens_input: i64,
    pub tokens_output: i64,
    pub service_name: String,
}

/// GET /api/billing/final-cost/{request_id}
/// 
/// Retrieves the final cost for a streaming request from Redis cache
/// 
/// # Authentication
/// 
/// This endpoint requires authentication via JWT token
/// 
/// # Parameters
/// 
/// * `request_id` - The unique request ID from the streaming request
/// 
/// # Returns
/// 
/// * 200 OK - Final cost data retrieved successfully
/// * 404 Not Found - Cost data not found or expired
/// * 401 Unauthorized - Invalid or missing authentication
/// * 500 Internal Server Error - Server error during retrieval
pub async fn get_final_streaming_cost(
    user_id: UserId,
    path: web::Path<String>,
    billing_service: web::Data<BillingService>,
) -> Result<HttpResponse, AppError> {
    let user_id = user_id.0;
    let request_id = path.into_inner();
    
    info!("Retrieving final streaming cost: user_id={}, request_id={}", user_id, request_id);
    
    match billing_service.get_final_streaming_cost(&request_id).await? {
        Some(cost_data) => {
            let response = FinalCostResponse {
                cost: cost_data.cost.to_string().parse::<f64>()
                    .map_err(|e| AppError::Internal(format!("Failed to convert cost: {}", e)))?,
                tokens_input: cost_data.tokens_input,
                tokens_output: cost_data.tokens_output,
                service_name: cost_data.service_name,
            };
            
            info!("Final cost retrieved successfully: request_id={}, cost={}", request_id, response.cost);
            Ok(HttpResponse::Ok().json(serde_json::json!({
                "status": "success",
                "found": true,
                "request_id": request_id,
                "final_cost": response.cost,
                "tokens_input": response.tokens_input,
                "tokens_output": response.tokens_output,
                "service_name": response.service_name
            })))
        }
        None => {
            info!("Final cost not found or expired: request_id={}", request_id);
            Ok(HttpResponse::Ok().json(serde_json::json!({
                "status": "success",
                "found": false,
                "request_id": request_id,
                "message": "Final cost not yet available or request not found"
            })))
        }
    }
}