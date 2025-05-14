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
    pub deep_link: DeepLinkConfig,
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
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct ApiKeysConfig {
    pub gemini_api_key: String,
    pub anthropic_api_key: String,
    pub groq_api_key: String,
    pub firebase_api_key: String,
    pub firebase_project_id: String,
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
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct SubscriptionConfig {
    pub default_trial_days: u32,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct StripeConfig {
    pub secret_key: String,
    pub webhook_secret: String,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct DeepLinkConfig {
    pub scheme: String,
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
        
        // API keys
        let gemini_api_key = env::var("GEMINI_API_KEY")
            .map_err(|_| AppError::Configuration("GEMINI_API_KEY must be set".to_string()))?;
        
        let anthropic_api_key = env::var("ANTHROPIC_API_KEY")
            .map_err(|_| AppError::Configuration("ANTHROPIC_API_KEY must be set".to_string()))?;
        
        let groq_api_key = env::var("GROQ_API_KEY")
            .map_err(|_| AppError::Configuration("GROQ_API_KEY must be set".to_string()))?;
        
        let firebase_api_key = env::var("FIREBASE_API_KEY")
            .map_err(|_| AppError::Configuration("FIREBASE_API_KEY must be set".to_string()))?;
        
        let firebase_project_id = env::var("FIREBASE_PROJECT_ID")
            .map_err(|_| AppError::Configuration("FIREBASE_PROJECT_ID must be set".to_string()))?;
        
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

        // Deep link configuration
        let app_deep_link_scheme = env::var("APP_DEEP_LINK_SCHEME")
            .unwrap_or_else(|_| "vibe-manager".to_string());
        
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
            },
            api_keys: ApiKeysConfig {
                gemini_api_key,
                anthropic_api_key,
                groq_api_key,
                firebase_api_key,
                firebase_project_id,
            },
            auth: AuthConfig {
                jwt_secret,
                token_duration_days,
            },
            rate_limit: RateLimitConfig {
                window_ms: rate_limit_window_ms,
                max_requests: rate_limit_max_requests,
            },
            subscription: SubscriptionConfig {
                default_trial_days,
            },
            stripe: StripeConfig {
                secret_key: stripe_secret_key,
                webhook_secret: stripe_webhook_secret,
            },
            deep_link: DeepLinkConfig {
                scheme: app_deep_link_scheme,
            },
        })
    }
}