use actix_web::{HttpResponse, Responder};
use serde::{Serialize, Deserialize};

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HealthResponse {
    status: String,
    version: String,
}

pub async fn health_check() -> impl Responder {
    // Public health endpoint - only return basic status, no sensitive metrics
    let response = HealthResponse {
        status: "ok".to_string(),
        version: env!("CARGO_PKG_VERSION").to_string(),
    };

    HttpResponse::Ok().json(response)
}