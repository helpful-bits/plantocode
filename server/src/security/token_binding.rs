use actix_web::{dev::ServiceRequest, HttpRequest};
use sha2::{Digest, Sha256};
use crate::error::AppError;

// Header used for token binding
pub const TOKEN_BINDING_HEADER: &str = "X-Client-ID";

/// Hashes a token binding value using SHA-256
pub fn hash_token_binding_value(value: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(value.as_bytes());
    let result = hasher.finalize();
    format!("{:x}", result)
}

/// Extracts the token binding value from a request header and hashes it
pub fn extract_token_binding_hash_from_request(req: &HttpRequest) -> Result<String, AppError> {
    if let Some(binding_value) = req.headers().get(TOKEN_BINDING_HEADER) {
        if let Ok(binding_str) = binding_value.to_str() {
            return Ok(hash_token_binding_value(binding_str));
        }
    }
    
    Err(AppError::Auth(format!("Missing or invalid {} header", TOKEN_BINDING_HEADER)))
}

/// Extracts the token binding value from a ServiceRequest and hashes it
pub fn extract_token_binding_hash_from_service_request(req: &ServiceRequest) -> Result<String, AppError> {
    if let Some(binding_value) = req.headers().get(TOKEN_BINDING_HEADER) {
        if let Ok(binding_str) = binding_value.to_str() {
            return Ok(hash_token_binding_value(binding_str));
        }
    }
    
    Err(AppError::Auth(format!("Missing or invalid {} header", TOKEN_BINDING_HEADER)))
}