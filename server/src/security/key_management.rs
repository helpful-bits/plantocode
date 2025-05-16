use std::env;
use std::sync::OnceLock;
use crate::error::AppError;

pub struct KeyConfig {
    pub jwt_secret: String,
    // Add other security keys as needed
}

static KEY_CONFIG: OnceLock<KeyConfig> = OnceLock::new();

fn initialize_key_config() -> Result<KeyConfig, AppError> {
    let jwt_secret = env::var("JWT_SECRET")
        .map_err(|_| AppError::Configuration("JWT_SECRET environment variable is not set".to_string()))?;
    
    if jwt_secret.len() < 32 {
        return Err(AppError::Configuration("JWT_SECRET must be at least 32 characters long".to_string()));
    }
    
    Ok(KeyConfig {
        jwt_secret,
    })
}

pub fn init_global_key_config() -> Result<&'static KeyConfig, AppError> {
    match KEY_CONFIG.get() {
        Some(config) => Ok(config),
        None => {
            let config = initialize_key_config()?;
            match KEY_CONFIG.set(config) {
                Ok(()) => Ok(KEY_CONFIG.get().unwrap()),
                Err(_) => {
                    // Another thread initialized the config
                    Ok(KEY_CONFIG.get().unwrap())
                }
            }
        }
    }
}

pub fn get_key_config() -> &'static KeyConfig {
    KEY_CONFIG.get().expect("KeyConfig not initialized. Call init_global_key_config at startup.")
}