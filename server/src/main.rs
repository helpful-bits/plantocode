use actix_web::{web, App, HttpServer, middleware::Logger};
use actix_cors::Cors;
use dotenv::dotenv;
use std::env;
use std::net::TcpListener;
use reqwest::Client;

mod auth_stores;
mod clients;
mod db;
mod handlers;
mod services;
mod middleware;
mod error;
mod models;
mod routes;
mod config;
mod security;
mod utils;

use crate::auth_stores::{PollingStore, StateStore};
use crate::auth_stores::store_utils;
use crate::config::AppSettings;
use crate::db::connection::{create_pool, verify_connection};
use crate::db::{ApiUsageRepository, SubscriptionRepository, UserRepository, SettingsRepository, ModelRepository, SubscriptionPlanRepository};
use crate::middleware::SecureAuthentication;
use crate::models::runtime_config::AppState;
use crate::services::auth::jwt;
use crate::services::auth::oauth::FirebaseOAuthService;
use crate::services::billing_service::BillingService;
use crate::services::proxy_service::ProxyService;
use crate::routes::{configure_routes, configure_hybrid_auth_api_routes};

#[actix_web::main]
async fn main() -> std::io::Result<()> {
    // Load environment variables from .env file
    dotenv().ok();
    
    // Initialize logger
    env_logger::init_from_env(env_logger::Env::new().default_filter_or("info"));
    
    // Load application settings from environment (as initial defaults)
    let env_app_settings = match AppSettings::from_env() {
        Ok(settings) => settings,
        Err(e) => {
            log::error!("Failed to load application settings from environment: {}", e);
            log::error!("Cannot start server without valid settings");
            std::process::exit(1);
        }
    };
    
    // Initialize global key config
    if let Err(e) = security::key_management::init_global_key_config() {
        log::error!("Failed to initialize global key config: {}", e);
        std::process::exit(1);
    }
    log::info!("Global key config initialized successfully");
    
    // Initialize JWT keys with app settings
    if let Err(e) = jwt::init_jwt_keys(&env_app_settings) {
        log::error!("Failed to initialize JWT keys: {}", e);
        log::error!("Cannot start server without working JWT keys");
        std::process::exit(1);
    }
    log::info!("JWT keys initialized successfully");
    
    // Database connection setup
    let db_pool = match create_pool().await {
        Ok(pool) => {
            // Verify the database connection
            if let Err(e) = verify_connection(&pool).await {
                log::error!("Database connection verification failed: {}", e);
                log::error!("Cannot start server without a working database connection");
                std::process::exit(1);
            }
            log::info!("Database connection established successfully");
            pool
        },
        Err(e) => {
            log::error!("Failed to create database connection pool: {}", e);
            log::error!("Cannot start server without a working database connection");
            std::process::exit(1);
        }
    };
    
    // Initialize SettingsRepository
    let settings_repo = SettingsRepository::new(db_pool.clone());
    
    // Initialize database with default settings if needed (using environment values as fallback)
    if let Err(e) = settings_repo.initialize_default_settings(&env_app_settings.ai_models).await {
        log::error!("Failed to initialize default settings in database: {}", e);
        log::warn!("Will attempt to continue with environment-based settings, but database-stored settings are preferred");
    }
    
    // Load AI model settings from the database - this should now work since we've initialized if needed
    let loaded_ai_model_settings = match settings_repo.get_ai_model_settings().await {
        Ok(settings) => {
            log::info!("Successfully loaded AI model settings from database.");
            settings
        }
        Err(e) => {
            log::error!("Failed to load AI model settings from database even after initialization: {}", e);
            log::warn!("Using environment-based AI settings as fallback (not recommended in production)");
            env_app_settings.ai_models.clone()
        }
    };
    
    // Create the final app_settings with database-loaded AI model settings
    let mut app_settings = env_app_settings;
    app_settings.ai_models = loaded_ai_model_settings;
    log::info!("Application settings updated with database-loaded AI model settings");
    
    // Initialize Firebase OAuth service
    let firebase_oauth_service = FirebaseOAuthService::new(&app_settings, db_pool.clone());
    log::info!("Firebase OAuth service initialized successfully");
    
    // Get server host and port from settings
    let host = &app_settings.server.host;
    let port = app_settings.server.port;
    
    log::info!("Starting server at http://{}:{}", host, port);
    
    let server_addr = format!("{}:{}", host, port);
    let listener = TcpListener::bind(server_addr.clone())?;
    
    // Initialize Tera template engine for HTML templates
    let tera_path = format!("{}/src/web_auth_assets/**/*.html", env!("CARGO_MANIFEST_DIR"));
    log::info!("Loading Tera templates from: {}", tera_path);
    let tera = match tera::Tera::new(&tera_path) {
        Ok(t) => {
            log::info!("Tera template engine initialized successfully");
            t
        },
        Err(e) => {
            log::error!("Failed to initialize Tera template engine: {}", e);
            log::error!("Cannot start server without working template engine");
            std::process::exit(1);
        }
    };
    
    // Initialize auth stores
    let polling_store = PollingStore::default();
    let state_store = StateStore::default();
    
    // Start cleanup task for polling store
    store_utils::start_cleanup_task(polling_store.clone());
    log::info!("Polling store cleanup task started");
    
    // Initialize reqwest HTTP client
    let http_client = reqwest::Client::new();

    HttpServer::new(move || {
        // Clone the data for the factory closure
        let db_pool = db_pool.clone();
        let app_settings = app_settings.clone();
        let firebase_oauth_service = web::Data::new(firebase_oauth_service.clone());
        let tera = web::Data::new(tera.clone());
        let polling_store = web::Data::new(polling_store.clone());
        let state_store = web::Data::new(state_store.clone());
        let http_client = web::Data::new(http_client.clone());
        
        // Initialize repositories
        let api_usage_repository = ApiUsageRepository::new(db_pool.clone());
        
        // Initialize services
        let billing_service = std::sync::Arc::new(BillingService::new(db_pool.clone(), app_settings.clone()));
        let api_usage_repository = std::sync::Arc::new(api_usage_repository);
        let proxy_service = match ProxyService::new(
            billing_service.clone(),
            api_usage_repository.clone(),
            &app_settings
        ) {
            Ok(service) => {
                log::info!("Proxy service initialized successfully");
                web::Data::new(service)
            },
            Err(e) => {
                log::error!("Failed to initialize proxy service: {}", e);
                log::error!("Cannot start server without working proxy service");
                std::process::exit(1);
            }
        };
        
        // Configure CORS using actix-cors
        let mut cors = Cors::default()
            .supports_credentials();
        
        // Add allowed origins based on configuration
        if app_settings.server.cors_origins.contains(&"*".to_string()) {
            cors = cors.allow_any_origin();
        } else {
            for origin in &app_settings.server.cors_origins {
                cors = cors.allowed_origin(origin);
            }
        }
        
        // Common CORS settings for all origins
        cors = cors
            .allow_any_method()
            .allow_any_header();
        
        // Create app state for shared access to repositories
        let user_repository = std::sync::Arc::new(UserRepository::new(db_pool.clone()));
        let model_repository = std::sync::Arc::new(ModelRepository::new(std::sync::Arc::new(db_pool.clone())));
        let settings_repository = std::sync::Arc::new(SettingsRepository::new(db_pool.clone()));
        let subscription_repository = std::sync::Arc::new(SubscriptionRepository::new(db_pool.clone()));
        let subscription_plan_repository = std::sync::Arc::new(SubscriptionPlanRepository::new(db_pool.clone()));
        
        // Create application state
        let app_state = web::Data::new(AppState {
            settings: std::sync::Arc::new(app_settings.clone()),
            api_usage_repository: api_usage_repository.clone(),
            model_repository,
            subscription_repository,
            subscription_plan_repository,
            user_repository: user_repository.clone(),
            settings_repository,
            free_tier_token_limit: Some(100_000), // Default free tier limit
        });
        
        // Create the App with common middleware and data
        App::new()
            .wrap(Logger::default())
            .wrap(cors)
            .app_data(web::Data::new(app_settings.clone()))
            .app_data(web::Data::new(db_pool.clone()))
            .app_data(firebase_oauth_service)
            .app_data(billing_service.clone())
            .app_data(proxy_service.clone())
            .app_data(app_state.clone())
            .app_data(tera.clone())
            .app_data(polling_store.clone())
            .app_data(state_store.clone())
            .app_data(http_client.clone())
            .app_data(web::Data::new(user_repository.clone()))
            // Register health check endpoint without auth
            .service(
                web::resource("/health")
                    .route(web::get().to(handlers::health::health_check))
            )
            // Public auth routes
            .service(
                web::scope("/auth")
                    .configure(routes::configure_public_auth_routes)
            )
            // Public API routes for hybrid auth (no authentication)
            .service(
                web::scope("/api")
                    .configure(configure_hybrid_auth_api_routes)
            )
            // Protected API routes with authentication
            .service(
                web::scope("/api")
                    .wrap(SecureAuthentication)
                    .configure(configure_routes)
            )
            // Public webhook routes (no authentication)
            .service(
                web::scope("/webhooks")
                    .configure(routes::configure_webhook_routes)
            )
    })
    .listen(listener)?
    .run()
    .await
}