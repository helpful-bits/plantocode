use actix_web::{web, HttpResponse};
use crate::error::AppError;
use crate::services::billing_service::BillingService;
use crate::models::AuthenticatedUser;

pub async fn get_final_streaming_cost(
    path: web::Path<String>,
    billing_service: web::Data<BillingService>,
    user: web::ReqData<AuthenticatedUser>,
) -> Result<HttpResponse, AppError> {
    let request_id = path.into_inner();
    let requesting_user_id = user.user_id;
    
    // Get the cost data
    let cost_data = billing_service.get_final_streaming_cost(&request_id).await?;
    
    match cost_data {
        Some(data) => {
            // Validate that the requesting user owns this request
            if data.user_id != requesting_user_id {
                return Err(AppError::Forbidden(
                    "You are not authorized to access this cost data".to_string()
                ));
            }
            Ok(HttpResponse::Ok().json(data))
        },
        None => Err(AppError::NotFound(
            format!("No final cost data found for request_id: {}", request_id)
        )),
    }
}