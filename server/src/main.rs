use actix_web::{web, App, HttpServer, middleware::Logger};
use actix_cors::Cors;
use dotenv::dotenv;
use std::env;
use std::net::TcpListener;
use reqwest::Client;

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

use crate::config::AppSettings;
use crate::db::connection::{create_pool, verify_connection};
use crate::db::repositories::{ApiUsageRepository, SubscriptionRepository, UserRepository};
use crate::middleware::SecureAuthentication;
use crate::services::auth::jwt;
use crate::services::auth::oauth::FirebaseOAuthService;
use crate::services::billing_service::BillingService;
use crate::services::proxy_service::ProxyService;
use crate::routes::configure_routes;

#[actix_web::main]
async fn main() -> std::io::Result<()> {
    // Load environment variables from .env file
    dotenv().ok();
    
    // Initialize logger
    env_logger::init_from_env(env_logger::Env::new().default_filter_or("info"));
    
    // Load application settings
    let app_settings = match AppSettings::from_env() {
        Ok(settings) => settings,
        Err(e) => {
            log::error!("Failed to load application settings: {}", e);
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
    if let Err(e) = jwt::init_jwt_keys(&app_settings) {
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
    
    // Initialize Firebase OAuth service
    let firebase_oauth_service = FirebaseOAuthService::new(&app_settings, db_pool.clone());
    log::info!("Firebase OAuth service initialized successfully");
    
    // Get server host and port from settings
    let host = &app_settings.server.host;
    let port = app_settings.server.port;
    
    log::info!("Starting server at http://{}:{}", host, port);
    
    let server_addr = format!("{}:{}", host, port);
    let listener = TcpListener::bind(server_addr.clone())?;
    
    HttpServer::new(move || {
        // Clone the data for the factory closure
        let db_pool = db_pool.clone();
        let app_settings = app_settings.clone();
        let firebase_oauth_service = web::Data::new(firebase_oauth_service.clone());
        
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
        
        // Create the App with common middleware and data
        App::new()
            .wrap(Logger::default())
            .wrap(cors)
            .app_data(web::Data::new(app_settings.clone()))
            .app_data(web::Data::new(db_pool.clone()))
            .app_data(firebase_oauth_service)
            .app_data(billing_service.clone())
            .app_data(proxy_service.clone())
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

