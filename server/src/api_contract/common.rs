use actix_web::HttpRequest;
use serde::Deserialize;
use uuid::Uuid;

use crate::error::AppError;

#[derive(Deserialize)]
pub struct PaginationQuery {
    pub limit: Option<u32>,
    pub offset: Option<u32>,
}

impl PaginationQuery {
    pub fn clamp(self, max_limit: u32) -> (u32, u32) {
        let limit = self.limit.unwrap_or(max_limit).min(max_limit);
        let offset = self.offset.unwrap_or(0);
        (limit, offset)
    }
}

pub fn extract_device_id(req: &HttpRequest) -> Result<Uuid, AppError> {
    req.headers()
        .get("X-Device-ID")
        .and_then(|v| v.to_str().ok())
        .and_then(|s| Uuid::parse_str(s).ok())
        .ok_or_else(|| AppError::BadRequest("Missing or invalid X-Device-ID header".to_string()))
}

pub fn extract_idempotency_key(req: &HttpRequest) -> Option<Uuid> {
    req.headers()
        .get("Idempotency-Key")
        .and_then(|v| v.to_str().ok())
        .and_then(|s| Uuid::parse_str(s).ok())
}
