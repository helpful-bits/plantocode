use std::env;
use std::sync::OnceLock;
use crate::error::AppError;

pub struct KeyConfig {
    pub jwt_secret: String,
    // Add other security keys as needed
}

static KEY_CONFIG: OnceLock<KeyConfig> = OnceLock::new();

pub fn get_key_config() -> Result<&'static KeyConfig, AppError> {
    KEY_CONFIG.get_or_try_init(|| {
        let jwt_secret = env::var("JWT_SECRET")
            .map_err(|_| AppError::Configuration("JWT_SECRET environment variable is not set".to_string()))?;
        
        if jwt_secret.len() < 32 {
            return Err(AppError::Configuration("JWT_SECRET must be at least 32 characters long".to_string()));
        }
        
        Ok(KeyConfig {
            jwt_secret,
        })
    })
}