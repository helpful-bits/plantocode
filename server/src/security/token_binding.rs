use actix_web::{dev::ServiceRequest, HttpRequest};
use sha2::{Digest, Sha256};
use crate::error::AppError;

// Header used for token binding
pub const TOKEN_BINDING_HEADER: &str = "X-Token-Binding";

/// Hashes a token binding value using SHA-256
pub fn hash_token_binding_value(value: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(value.as_bytes());
    let result = hasher.finalize();
    format!("{:x}", result)
}

/// Extracts the token binding value from a request header and hashes it
pub fn extract_token_binding_hash_from_request(req: &HttpRequest) -> Result<String, AppError> {
    match req.headers().get(TOKEN_BINDING_HEADER) {
        Some(header_value) => {
            match header_value.to_str() {
                Ok(binding_value) => {
                    if binding_value.is_empty() {
                        return Err(AppError::Auth("Empty token binding header value".to_string()));
                    }
                    Ok(hash_token_binding_value(binding_value))
                }
                Err(_) => Err(AppError::Auth("Invalid token binding header value encoding".to_string()))
            }
        }
        None => Err(AppError::Auth("Missing X-Token-Binding header".to_string()))
    }
}

/// Extracts the token binding value from a ServiceRequest and hashes it
pub fn extract_token_binding_hash_from_service_request(req: &ServiceRequest) -> Result<String, AppError> {
    match req.headers().get(TOKEN_BINDING_HEADER) {
        Some(header_value) => {
            match header_value.to_str() {
                Ok(binding_value) => {
                    if binding_value.is_empty() {
                        return Err(AppError::Auth("Empty token binding header value".to_string()));
                    }
                    Ok(hash_token_binding_value(binding_value))
                }
                Err(_) => Err(AppError::Auth("Invalid token binding header value encoding".to_string()))
            }
        }
        None => Err(AppError::Auth("Missing X-Token-Binding header".to_string()))
    }
}