use std::env;
use std::collections::HashMap;
use crate::error::AppError;
use serde::{Deserialize, Serialize};
use bigdecimal::BigDecimal;


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
    pub ai_models: AIModelSettings,
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
    pub groq_api_key: Option<String>,
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
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct SubscriptionConfig {
    pub default_trial_days: u32,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct StripeConfig {
    pub secret_key: String,
    pub webhook_secret: String,
    pub price_id_free: Option<String>,
    pub price_id_pro: Option<String>,
    pub price_id_enterprise: Option<String>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct DeepLinkConfig {
    pub scheme: String,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct TaskSpecificModelConfigEntry {
    pub model: String,
    pub max_tokens: u32,
    pub temperature: f32,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct ModelInfoEntry {
    pub id: String,
    pub name: String,
    pub provider: String,
    pub description: Option<String>,
    pub context_window: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub price_input_per_1k_tokens: Option<BigDecimal>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub price_output_per_1k_tokens: Option<BigDecimal>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct PathFinderSettingsEntry {
    pub max_files_with_content: Option<u32>,
    pub include_file_contents: Option<bool>,
    pub max_content_size_per_file: Option<u32>,
    pub max_file_count: Option<u32>,
    pub file_content_truncation_chars: Option<u32>,
    pub token_limit_buffer: Option<u32>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct AIModelSettings {
    pub default_llm_model_id: String,
    pub default_voice_model_id: String,
    pub default_transcription_model_id: String,
    pub task_specific_configs: HashMap<String, TaskSpecificModelConfigEntry>,
    pub available_models: Vec<ModelInfoEntry>,
    pub path_finder_settings: PathFinderSettingsEntry,
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
        let groq_api_key = env::var("GROQ_API_KEY").ok();
        
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
            
        let stripe_price_id_free = env::var("STRIPE_PRICE_ID_FREE").ok();
        let stripe_price_id_pro = env::var("STRIPE_PRICE_ID_PRO").ok();
        let stripe_price_id_enterprise = env::var("STRIPE_PRICE_ID_ENTERPRISE").ok();

        // Deep link configuration
        let app_deep_link_scheme = env::var("APP_DEEP_LINK_SCHEME")
            .unwrap_or_else(|_| "vibe-manager".to_string());
            
        // AI model settings - placeholder values that will be replaced during app initialization
        // The actual values will be loaded from the database
        let ai_models = AIModelSettings {
            default_llm_model_id: String::new(),
            default_voice_model_id: String::new(),
            default_transcription_model_id: String::new(),
            task_specific_configs: HashMap::new(),
            available_models: Vec::new(),
            path_finder_settings: PathFinderSettingsEntry {
                max_files_with_content: None,
                include_file_contents: None,
                max_content_size_per_file: None,
                max_file_count: None,
                file_content_truncation_chars: None,
                token_limit_buffer: None,
            },
        };
        
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
                groq_api_key,
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
            },
            subscription: SubscriptionConfig {
                default_trial_days,
            },
            stripe: StripeConfig {
                secret_key: stripe_secret_key,
                webhook_secret: stripe_webhook_secret,
                price_id_free: stripe_price_id_free,
                price_id_pro: stripe_price_id_pro,
                price_id_enterprise: stripe_price_id_enterprise,
            },
            deep_link: DeepLinkConfig {
                scheme: app_deep_link_scheme,
            },
            ai_models,
        })
    }
}