use crate::error::AppError;
use std::env;
use std::sync::OnceLock;

pub struct KeyConfig {
    pub jwt_secret: String,
    pub api_key_hash_secret: String,
    // Add other security keys as needed
}

static KEY_CONFIG: OnceLock<KeyConfig> = OnceLock::new();

fn initialize_key_config() -> Result<KeyConfig, AppError> {
    let jwt_secret = env::var("JWT_SECRET").map_err(|_| {
        AppError::Configuration("JWT_SECRET environment variable is not set".to_string())
    })?;

    if jwt_secret.len() < 32 {
        return Err(AppError::Configuration(
            "JWT_SECRET must be at least 32 characters long".to_string(),
        ));
    }

    let api_key_hash_secret = env::var("API_KEY_HASH_SECRET").map_err(|_| {
        AppError::Configuration("API_KEY_HASH_SECRET environment variable is not set".to_string())
    })?;

    if api_key_hash_secret.len() < 32 {
        return Err(AppError::Configuration(
            "API_KEY_HASH_SECRET must be at least 32 characters long".to_string(),
        ));
    }

    Ok(KeyConfig {
        jwt_secret,
        api_key_hash_secret,
    })
}

pub fn init_global_key_config() -> Result<&'static KeyConfig, AppError> {
    match KEY_CONFIG.get() {
        Some(config) => Ok(config),
        None => {
            let config = initialize_key_config()?;
            match KEY_CONFIG.set(config) {
                Ok(()) => get_key_config(),
                Err(_) => {
                    // Another thread initialized the config
                    get_key_config()
                }
            }
        }
    }
}

pub fn get_key_config() -> Result<&'static KeyConfig, AppError> {
    KEY_CONFIG.get().ok_or_else(|| {
        AppError::Configuration(
            "KeyConfig not initialized. Call init_global_key_config at startup.".to_string(),
        )
    })
}
