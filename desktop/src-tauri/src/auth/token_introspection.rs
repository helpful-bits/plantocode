use chrono::Utc;
use log::warn;

/// Decode the exp (expiration) claim from a JWT token
/// Returns the expiration timestamp in seconds since Unix epoch
pub fn decode_exp(token: &str) -> Option<i64> {
    let parts: Vec<&str> = token.split('.').collect();
    if parts.len() != 3 {
        warn!("Invalid JWT format: expected 3 parts");
        return None;
    }

    let payload = parts[1];

    // Decode base64url
    let decoded = match base64_url_decode(payload) {
        Ok(d) => d,
        Err(e) => {
            warn!("Failed to decode JWT payload: {}", e);
            return None;
        }
    };

    // Parse JSON
    let json: serde_json::Value = match serde_json::from_slice(&decoded) {
        Ok(j) => j,
        Err(e) => {
            warn!("Failed to parse JWT payload JSON: {}", e);
            return None;
        }
    };

    json.get("exp")?.as_i64()
}

/// Calculate seconds until token expiry
/// Returns None if token is invalid or already expired
pub fn seconds_until_expiry(token: &str) -> Option<i64> {
    let exp = decode_exp(token)?;
    let now = Utc::now().timestamp();
    let seconds = exp - now;

    if seconds <= 0 {
        None
    } else {
        Some(seconds)
    }
}

/// Check if token is expiring within the specified threshold
pub fn is_expiring_within(token: &str, threshold_secs: i64) -> bool {
    match seconds_until_expiry(token) {
        Some(secs) => secs <= threshold_secs,
        None => true, // Treat invalid/expired as "expiring"
    }
}

/// Decode base64url string (JWT uses base64url, not standard base64)
fn base64_url_decode(input: &str) -> Result<Vec<u8>, String> {
    use base64::{Engine as _, engine::general_purpose::URL_SAFE_NO_PAD};

    URL_SAFE_NO_PAD
        .decode(input)
        .map_err(|e| format!("Base64 decode error: {}", e))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_decode_exp() {
        // This is a sample JWT (not a real one, just for testing structure)
        // Header: {"alg":"HS256","typ":"JWT"}
        // Payload: {"exp":1234567890,"sub":"test"}
        let token = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJleHAiOjEyMzQ1Njc4OTAsInN1YiI6InRlc3QifQ.signature";

        let exp = decode_exp(token);
        assert_eq!(exp, Some(1234567890));
    }
}
