use actix_web::dev::ServiceRequest;
use chrono::Utc;
use log::{debug, error};
use std::collections::HashSet;

use crate::error::AppError;
use crate::models::auth_jwt_claims::Claims;
use crate::security::token_binding::extract_token_binding_hash_from_service_request;

/// Validates token expiry with grace period
pub fn validate_token_expiry(claims: &Claims) -> Result<(), AppError> {
    let now = Utc::now().timestamp() as usize;

    if claims.exp <= now {
        return Err(AppError::Auth(format!(
            "Token expired: {} <= {}",
            claims.exp, now
        )));
    }

    // Check if token is too old (issued more than 24 hours ago)
    let max_age = 24 * 60 * 60; // 24 hours in seconds
    if now > claims.iat && (now - claims.iat) > max_age {
        return Err(AppError::Auth(format!(
            "Token too old: issued {} seconds ago",
            now - claims.iat
        )));
    }

    debug!("Token expiry validation successful");
    Ok(())
}

/// Validates issuer claim
pub fn validate_issuer(claims: &Claims) -> Result<(), AppError> {
    match &claims.iss {
        Some(issuer) => {
            let expected_issuers = vec![
                "https://plantocode.us.auth0.com/",
                "https://api-us.plantocode.com",
                "plantocode",
            ];

            if !expected_issuers.contains(&issuer.as_str()) {
                return Err(AppError::Auth(format!("Invalid issuer: {}", issuer)));
            }
        }
        None => {
            return Err(AppError::Auth("Missing issuer claim".to_string()));
        }
    }

    debug!("Issuer validation successful: {:?}", claims.iss);
    Ok(())
}

/// Validates audience claim
pub fn validate_audience(claims: &Claims) -> Result<(), AppError> {
    match &claims.aud {
        Some(audience) => {
            let expected_audiences = vec![
                "plantocode-api",
                "https://api-us.plantocode.com",
                "https://plantocode.com", // Auth0 audience
            ];

            if !expected_audiences.contains(&audience.as_str()) {
                return Err(AppError::Auth(format!("Invalid audience: {}", audience)));
            }
        }
        None => {
            return Err(AppError::Auth("Missing audience claim".to_string()));
        }
    }

    debug!("Audience validation successful: {:?}", claims.aud);
    Ok(())
}

/// Validates scopes
pub fn validate_scopes(
    claims: &Claims,
    required_scopes: &[&str],
) -> Result<(), AppError> {
    if required_scopes.is_empty() {
        return Ok(());
    }

    let token_scopes = match &claims.scope {
        Some(scope_str) => scope_str.split_whitespace().collect::<HashSet<_>>(),
        None => {
            return Err(AppError::Auth("Missing scope claim".to_string()));
        }
    };

    for required_scope in required_scopes {
        if !token_scopes.contains(required_scope) {
            return Err(AppError::Auth(format!(
                "Missing required scope: {}",
                required_scope
            )));
        }
    }

    debug!("Scope validation successful");
    Ok(())
}

/// Validates device binding and token binding
pub fn validate_device_binding(
    req: &ServiceRequest,
    claims: &Claims,
) -> Result<(), AppError> {
    let request_id = format!(
        "auth_{}_{}",
        chrono::Utc::now().timestamp_millis(),
        uuid::Uuid::new_v4()
    );

    // Device binding validation
    let device_id_header = req
        .headers()
        .get("x-device-id")
        .and_then(|h| h.to_str().ok());

    match (&claims.device_id, device_id_header) {
        (Some(jwt_device_id), Some(header_device_id)) => {
            if jwt_device_id != header_device_id {
                error!(
                    "Device ID mismatch for request_id: {}",
                    request_id
                );
                return Err(AppError::Auth(
                    "Device ID mismatch".to_string()
                ));
            }
            // Device binding validation successful
        }
        (Some(jwt_device_id), None) => {
            error!(
                "Missing X-Device-ID header for device-bound token, request_id: {}",
                request_id
            );
            return Err(AppError::Auth(
                "Missing X-Device-ID header for device-bound token".to_string(),
            ));
        }
        (None, _) => {
            // No device binding required
            debug!(
                "No device binding required for this token, request_id: {}",
                request_id
            );
        }
    }

    // Token binding validation
    if let Some(jwt_token_binding_hash) = &claims.tbh {
        match extract_token_binding_hash_from_service_request(req) {
            Ok(request_token_binding_hash) => {
                if jwt_token_binding_hash != &request_token_binding_hash {
                    error!(
                        "Token binding hash mismatch for request_id: {}",
                        request_id
                    );
                    return Err(AppError::Auth(
                        "Token binding validation failed".to_string(),
                    ));
                }
                // Token binding validation successful
            }
            Err(e) => {
                error!(
                    "Token binding validation failed - rejecting request. request_id: {} - error: {}",
                    request_id, e
                );
                return Err(AppError::Auth(
                    "Token binding validation failed".to_string(),
                ));
            }
        }
    } else {
        debug!(
            "No token binding hash in JWT claims, skipping token binding validation for request_id: {}",
            request_id
        );
    }

    debug!(
        "Device and token binding validation successful for request_id: {}",
        request_id
    );
    Ok(())
}

/// Validates IP binding
pub fn validate_ip_binding(
    req: &ServiceRequest,
    claims: &Claims,
) -> Result<(), AppError> {
    if let Some(bound_ip) = &claims.ip_binding {
        let client_ip = extract_client_ip(req);

        if &client_ip != bound_ip {
            return Err(AppError::Auth(format!(
                "IP binding mismatch: current '{}' vs bound '{}'",
                client_ip, bound_ip
            )));
        }

        debug!("IP binding validation successful: {}", bound_ip);
    }

    Ok(())
}

/// Extracts client IP from request
pub fn extract_client_ip(req: &ServiceRequest) -> String {
    if let Some(forwarded_for) = req.headers().get("x-forwarded-for") {
        if let Ok(forwarded_str) = forwarded_for.to_str() {
            if let Some(first_ip) = forwarded_str.split(',').next() {
                return first_ip.trim().to_string();
            }
        }
    }

    if let Some(real_ip) = req.headers().get("x-real-ip") {
        if let Ok(real_ip_str) = real_ip.to_str() {
            return real_ip_str.to_string();
        }
    }

    if let Some(peer_addr) = req.peer_addr() {
        peer_addr.ip().to_string()
    } else {
        "unknown".to_string()
    }
}
