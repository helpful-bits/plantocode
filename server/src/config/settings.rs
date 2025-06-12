use std::env;
use crate::error::AppError;
use serde::{Deserialize, Serialize};


#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct AppSettings {
    pub app: AppConfig,
    pub database: DatabaseConfig,
    pub server: ServerConfig,
    pub api_keys: ApiKeysConfig,
    pub auth: AuthConfig,
    pub rate_limit: RateLimitConfig,
    pub subscription: SubscriptionConfig,
    pub stripe: StripeConfig,
    pub auth_stores: AuthStoreConfig,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct AppConfig {
    pub name: String,
    pub environment: String,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct DatabaseConfig {
    pub url: String,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct ServerConfig {
    pub host: String,
    pub port: u16,
    pub cors_origins: Vec<String>,
    pub url: String,
    pub auth0_callback_url: String,
    pub auth0_logged_out_url: String,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct ApiKeysConfig {
    pub openrouter_api_key: Option<String>,
    pub replicate_api_token: Option<String>,
    pub auth0_domain: String,
    pub auth0_api_audience: String,
    pub auth0_server_client_id: Option<String>,
    pub auth0_server_client_secret: Option<String>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct AuthConfig {
    pub jwt_secret: String,
    pub token_duration_days: i64,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct RateLimitConfig {
    pub window_ms: u64,
    pub max_requests: u64,
    pub use_redis: bool,
    pub redis_url: Option<String>,
    pub redis_key_prefix: Option<String>,
    pub cleanup_interval_secs: Option<u64>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct SubscriptionConfig {
    pub default_trial_days: u32,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct StripeConfig {
    pub secret_key: String,
    pub webhook_secret: String,
    pub success_url: String,
    pub cancel_url: String,
    pub portal_return_url: String,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct AuthStoreConfig {
    pub polling_store_expiry_mins: i64,
    pub auth0_state_store_expiry_mins: i64,
    pub cleanup_interval_secs: u64,
}

impl AppSettings {
    pub fn from_env() -> Result<Self, AppError> {
        // App config
        let app_name = env::var("APP_NAME").unwrap_or_else(|_| "vibe-manager".to_string());
        let environment = env::var("ENVIRONMENT").unwrap_or_else(|_| "development".to_string());
        
        // Database config
        let database_url = env::var("DATABASE_URL")
            .map_err(|_| AppError::Configuration("DATABASE_URL must be set".to_string()))?;
        
        // Server config
        let server_host = env::var("SERVER_HOST").unwrap_or_else(|_| "0.0.0.0".to_string());
        let server_port = env::var("SERVER_PORT")
            .unwrap_or_else(|_| "8080".to_string())
            .parse::<u16>()
            .map_err(|_| AppError::Configuration("SERVER_PORT must be a valid port number".to_string()))?;
        
        // CORS origins
        let cors_origins = env::var("CORS_ORIGINS")
            .unwrap_or_else(|_| "*".to_string())
            .split(',')
            .map(|s| s.trim().to_string())
            .collect();

        // Server URL
        let server_url = env::var("SERVER_URL")
            .unwrap_or_else(|_| format!("http://{}:{}", server_host, server_port));
        
        // Auth0 callback URLs
        let auth0_callback_url = env::var("SERVER_AUTH0_CALLBACK_URL")
            .map_err(|_| AppError::Configuration("SERVER_AUTH0_CALLBACK_URL must be set".to_string()))?;
        
        let auth0_logged_out_url = env::var("SERVER_AUTH0_LOGGED_OUT_URL")
            .map_err(|_| AppError::Configuration("SERVER_AUTH0_LOGGED_OUT_URL must be set".to_string()))?;
        
        // API keys
        let openrouter_api_key = env::var("OPENROUTER_API_KEY").ok();
        let replicate_api_token = env::var("REPLICATE_API_TOKEN").ok();
        
        let auth0_domain = env::var("AUTH0_DOMAIN")
            .map_err(|_| AppError::Configuration("AUTH0_DOMAIN must be set".to_string()))?;
        
        let auth0_api_audience = env::var("AUTH0_API_AUDIENCE")
            .map_err(|_| AppError::Configuration("AUTH0_API_AUDIENCE must be set".to_string()))?;
        
        let auth0_server_client_id = env::var("AUTH0_SERVER_CLIENT_ID").ok();
        let auth0_server_client_secret = env::var("AUTH0_SERVER_CLIENT_SECRET").ok();
        
        // Auth config
        let jwt_secret = env::var("JWT_SECRET")
            .map_err(|_| AppError::Configuration("JWT_SECRET must be set".to_string()))?;
        
        let token_duration_days = env::var("JWT_ACCESS_TOKEN_DURATION_DAYS")
            .unwrap_or_else(|_| "30".to_string())
            .parse::<i64>()
            .map_err(|_| AppError::Configuration("JWT_ACCESS_TOKEN_DURATION_DAYS must be a valid number".to_string()))?;
        
        // Rate limiting
        let rate_limit_window_ms = env::var("RATE_LIMIT_WINDOW_MS")
            .unwrap_or_else(|_| "60000".to_string())
            .parse::<u64>()
            .map_err(|_| AppError::Configuration("RATE_LIMIT_WINDOW_MS must be a valid number".to_string()))?;
        
        let rate_limit_max_requests = env::var("RATE_LIMIT_MAX_REQUESTS")
            .unwrap_or_else(|_| "60".to_string())
            .parse::<u64>()
            .map_err(|_| AppError::Configuration("RATE_LIMIT_MAX_REQUESTS must be a valid number".to_string()))?;
        
        let rate_limit_use_redis = env::var("RATE_LIMIT_USE_REDIS")
            .unwrap_or_else(|_| "false".to_string())
            .parse::<bool>()
            .map_err(|_| AppError::Configuration("RATE_LIMIT_USE_REDIS must be true or false".to_string()))?;
        
        let rate_limit_redis_url = env::var("RATE_LIMIT_REDIS_URL").ok();
        
        let rate_limit_redis_key_prefix = env::var("RATE_LIMIT_REDIS_KEY_PREFIX").ok();
        
        let rate_limit_cleanup_interval_secs = env::var("RATE_LIMIT_CLEANUP_INTERVAL_SECS")
            .ok()
            .and_then(|s| s.parse().ok());
        
        // Subscription defaults
        let default_trial_days = env::var("DEFAULT_TRIAL_DAYS")
            .unwrap_or_else(|_| "7".to_string())
            .parse::<u32>()
            .map_err(|_| AppError::Configuration("DEFAULT_TRIAL_DAYS must be a valid number".to_string()))?;

        // Stripe configuration
        let stripe_secret_key = env::var("STRIPE_SECRET_KEY")
            .map_err(|_| AppError::Configuration("STRIPE_SECRET_KEY must be set".to_string()))?;
            
        let stripe_webhook_secret = env::var("STRIPE_WEBHOOK_SECRET")
            .map_err(|_| AppError::Configuration("STRIPE_WEBHOOK_SECRET must be set".to_string()))?;
            
        let stripe_success_url = env::var("STRIPE_CHECKOUT_SUCCESS_URL")
            .map_err(|_| AppError::Configuration("STRIPE_CHECKOUT_SUCCESS_URL must be set".to_string()))?;
            
        let stripe_cancel_url = env::var("STRIPE_CHECKOUT_CANCEL_URL")
            .map_err(|_| AppError::Configuration("STRIPE_CHECKOUT_CANCEL_URL must be set".to_string()))?;
            
        let stripe_portal_return_url = env::var("STRIPE_PORTAL_RETURN_URL")
            .map_err(|_| AppError::Configuration("STRIPE_PORTAL_RETURN_URL must be set".to_string()))?;
            
        
        // Auth Store configuration
        let polling_store_expiry_mins = env::var("POLLING_STORE_EXPIRY_MINS")
            .unwrap_or_else(|_| "30".to_string())
            .parse::<i64>()
            .map_err(|_| AppError::Configuration("POLLING_STORE_EXPIRY_MINS must be a valid number".to_string()))?;
            
        let auth0_state_store_expiry_mins = env::var("AUTH0_STATE_STORE_EXPIRY_MINS")
            .unwrap_or_else(|_| "30".to_string())
            .parse::<i64>()
            .map_err(|_| AppError::Configuration("AUTH0_STATE_STORE_EXPIRY_MINS must be a valid number".to_string()))?;
            
        let auth_store_cleanup_interval_secs = env::var("AUTH_STORE_CLEANUP_INTERVAL_SECS")
            .unwrap_or_else(|_| "300".to_string())
            .parse::<u64>()
            .map_err(|_| AppError::Configuration("AUTH_STORE_CLEANUP_INTERVAL_SECS must be a valid number".to_string()))?;
        
        Ok(Self {
            app: AppConfig {
                name: app_name,
                environment,
            },
            database: DatabaseConfig {
                url: database_url,
            },
            server: ServerConfig {
                host: server_host,
                port: server_port,
                cors_origins,
                url: server_url,
                auth0_callback_url,
                auth0_logged_out_url,
            },
            api_keys: ApiKeysConfig {
                openrouter_api_key,
                replicate_api_token,
                auth0_domain,
                auth0_api_audience,
                auth0_server_client_id,
                auth0_server_client_secret,
            },
            auth: AuthConfig {
                jwt_secret,
                token_duration_days,
            },
            rate_limit: RateLimitConfig {
                window_ms: rate_limit_window_ms,
                max_requests: rate_limit_max_requests,
                use_redis: rate_limit_use_redis,
                redis_url: rate_limit_redis_url,
                redis_key_prefix: rate_limit_redis_key_prefix,
                cleanup_interval_secs: rate_limit_cleanup_interval_secs,
            },
            subscription: SubscriptionConfig {
                default_trial_days,
            },
            stripe: StripeConfig {
                secret_key: stripe_secret_key,
                webhook_secret: stripe_webhook_secret,
                success_url: stripe_success_url,
                cancel_url: stripe_cancel_url,
                portal_return_url: stripe_portal_return_url,
            },
            auth_stores: AuthStoreConfig {
                polling_store_expiry_mins,
                auth0_state_store_expiry_mins,
                cleanup_interval_secs: auth_store_cleanup_interval_secs,
            },
        })
    }
}