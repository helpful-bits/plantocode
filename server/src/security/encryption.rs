use crate::error::AppError;
use aes_gcm::{Aes256Gcm, Key, KeyInit, Nonce, aead::Aead};
use std::env;

/// Encrypt data using AES-256-GCM
pub fn encrypt(data: &str, key: &[u8]) -> Result<Vec<u8>, AppError> {
    if key.len() != 32 {
        return Err(AppError::Configuration(
            "Encryption key must be 32 bytes".to_string(),
        ));
    }

    let key = Key::<Aes256Gcm>::from_slice(key);
    let cipher = Aes256Gcm::new(key);

    // Generate a random nonce
    let nonce_bytes = rand::random::<[u8; 12]>();
    let nonce = Nonce::from_slice(&nonce_bytes);

    let ciphertext = cipher
        .encrypt(nonce, data.as_bytes())
        .map_err(|_| AppError::Internal("Encryption failed".to_string()))?;

    // Prepend nonce to ciphertext
    let mut result = Vec::with_capacity(12 + ciphertext.len());
    result.extend_from_slice(&nonce_bytes);
    result.extend_from_slice(&ciphertext);

    Ok(result)
}

/// Decrypt data using AES-256-GCM
pub fn decrypt(encrypted_data: &[u8], key: &[u8]) -> Result<String, AppError> {
    if key.len() != 32 {
        return Err(AppError::Configuration(
            "Decryption key must be 32 bytes".to_string(),
        ));
    }

    let key = Key::<Aes256Gcm>::from_slice(key);
    let cipher = Aes256Gcm::new(key);

    if encrypted_data.len() < 12 {
        return Err(AppError::Internal(
            "Invalid encrypted data length".to_string(),
        ));
    }

    // Extract nonce and ciphertext
    let nonce = Nonce::from_slice(&encrypted_data[..12]);
    let ciphertext = &encrypted_data[12..];

    let decrypted_bytes = cipher
        .decrypt(nonce, ciphertext)
        .map_err(|_| AppError::Internal("Decryption failed".to_string()))?;

    String::from_utf8(decrypted_bytes)
        .map_err(|_| AppError::Internal("Invalid UTF-8 in decrypted data".to_string()))
}
