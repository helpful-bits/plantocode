use crate::error::AppError;
use crate::security::key_management::get_key_config;
use hmac::{Hmac, Mac};
use rand::RngCore;
use sha2::Sha256;
use subtle::ConstantTimeEq;

type HmacSha256 = Hmac<Sha256>;

/// Hashes an API key using HMAC-SHA256 with the secret from KeyConfig
///
/// # Arguments
/// * `raw_key` - The raw API key to hash
///
/// # Returns
/// * `Result<String, AppError>` - Hex-encoded hash or error
pub fn hash_api_key(raw_key: &str) -> Result<String, AppError> {
    let config = get_key_config()?;

    let mut mac = HmacSha256::new_from_slice(config.api_key_hash_secret.as_bytes())
        .map_err(|e| AppError::Internal(format!("Failed to create HMAC: {}", e)))?;

    mac.update(raw_key.as_bytes());

    let result = mac.finalize();
    let hash_bytes = result.into_bytes();

    Ok(hex::encode(hash_bytes))
}

/// Generates a new API key using cryptographically secure random bytes
///
/// # Returns
/// * `String` - A 64-character hex-encoded string (32 random bytes)
pub fn generate_api_key() -> String {
    let mut key_bytes = [0u8; 32];
    rand::thread_rng().fill_bytes(&mut key_bytes);
    hex::encode(key_bytes)
}

/// Compares two strings in constant time to prevent timing attacks
///
/// # Arguments
/// * `a` - First string to compare
/// * `b` - Second string to compare
///
/// # Returns
/// * `bool` - True if strings are equal, false otherwise
pub fn constant_time_equal(a: &str, b: &str) -> bool {
    a.as_bytes().ct_eq(b.as_bytes()).into()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_generate_api_key_length() {
        let key = generate_api_key();
        assert_eq!(key.len(), 64, "Generated key should be 64 characters long");
    }

    #[test]
    fn test_generate_api_key_uniqueness() {
        let key1 = generate_api_key();
        let key2 = generate_api_key();
        assert_ne!(key1, key2, "Generated keys should be unique");
    }

    #[test]
    fn test_generate_api_key_is_hex() {
        let key = generate_api_key();
        assert!(
            key.chars().all(|c| c.is_ascii_hexdigit()),
            "Generated key should only contain hex characters"
        );
    }

    #[test]
    fn test_constant_time_equal_same_strings() {
        let a = "test_string";
        let b = "test_string";
        assert!(constant_time_equal(a, b));
    }

    #[test]
    fn test_constant_time_equal_different_strings() {
        let a = "test_string_1";
        let b = "test_string_2";
        assert!(!constant_time_equal(a, b));
    }

    #[test]
    fn test_constant_time_equal_different_lengths() {
        let a = "short";
        let b = "much_longer_string";
        assert!(!constant_time_equal(a, b));
    }

    #[test]
    fn test_constant_time_equal_empty_strings() {
        let a = "";
        let b = "";
        assert!(constant_time_equal(a, b));
    }
}
