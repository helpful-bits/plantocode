use actix_web::{web, App, HttpServer, middleware::Logger};
use actix_cors::Cors;
use dotenv::dotenv;
use std::env;
use std::net::TcpListener;
use std::sync::Arc;
use reqwest::Client;
use tokio_cron_scheduler::{JobScheduler, Job};
use log::{info, error};

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
mod streaming;
mod stripe_types;
mod utils;

use crate::auth_stores::{PollingStore, Auth0StateStore};
use crate::auth_stores::store_utils;
use crate::config::AppSettings;
use crate::db::connection::{create_dual_pools, verify_connection, DatabasePools};
use crate::db::{ApiUsageRepository, CustomerBillingRepository, UserRepository, SettingsRepository, ModelRepository, SystemPromptsRepository};
use crate::middleware::{
    auth_middleware,
    create_rate_limit_storage,
    create_ip_rate_limiter, 
    create_user_rate_limiter,
    create_strict_rate_limiter,
    start_memory_store_cleanup_task
};
use crate::models::runtime_config::AppState;
use crate::services::auth::jwt;
use crate::services::auth::oauth::Auth0OAuthService;
use crate::services::billing_service::BillingService;
use crate::services::credit_service::CreditService;
use crate::services::reconciliation_service::ReconciliationService;
use crate::services::request_tracker::RequestTracker;
use crate::routes::{configure_routes, configure_public_api_routes, configure_public_auth_routes, configure_webhook_routes};
use crate::handlers::config_handlers;

/// Validates AI model configurations at startup to catch misconfigurations early
async fn validate_ai_model_configurations(
    settings_repo: &SettingsRepository,
    model_repo: &ModelRepository,
) -> Result<(), String> {
    // Fetch AI settings and available models
    let ai_settings = settings_repo.get_ai_model_settings().await
        .map_err(|e| format!("Failed to fetch AI model settings: {}", e))?;
    
    let available_models = model_repo.get_all_with_providers().await
        .map_err(|e| format!("Failed to fetch available models: {}", e))?;
    
    // Create a map for quick lookups
    let model_map: std::collections::HashMap<String, &crate::db::repositories::model_repository::ModelWithProvider> = 
        available_models.iter().map(|m| (m.id.clone(), m)).collect();
    
    // Validate task models
    for (task_name, task_config) in &ai_settings.tasks {
        let model_id = &task_config.model;
        
        let _model = model_map.get(model_id)
            .ok_or_else(|| format!("Task '{}' references non-existent model: {}", task_name, model_id))?;
        
        // Model exists - no additional validation needed as all models are token-based
    }
    
    // Ensure critical tasks are configured
    let required_tasks = ["implementation_plan", "voice_transcription"];
    for required_task in &required_tasks {
        if !ai_settings.tasks.contains_key(*required_task) {
            return Err(format!("Required task '{}' is not configured", required_task));
        }
    }
    
    Ok(())
}

/// Initialize and start the reconciliation scheduler for hourly balance verification
async fn start_reconciliation_scheduler(db_pools: DatabasePools) -> Result<(), String> {
    info!("Initializing reconciliation scheduler for hourly financial balance verification");
    
    let scheduler = JobScheduler::new()
        .await
        .map_err(|e| format!("Failed to create job scheduler: {}", e))?;
    
    // Create reconciliation service instance for the job
    let reconciliation_service = ReconciliationService::new(db_pools);
    
    // Schedule reconciliation to run every hour at minute 0
    let job = Job::new_async("0 0 * * * *", move |_uuid, _l| {
        let service = reconciliation_service.clone();
        Box::pin(async move {
            info!("Starting scheduled financial reconciliation");
            
            match service.generate_reconciliation_report().await {
                Ok(report) => {
                    info!(
                        "Reconciliation completed successfully: {} users checked, {} discrepancies found",
                        report.total_users_checked, report.users_with_discrepancies
                    );
                    
                    // Log critical financial discrepancies with ERROR level for monitoring
                    if report.users_with_discrepancies > 0 {
                        error!(
                            "FINANCIAL RECONCILIATION ALERT: {} users have balance discrepancies. Total system discrepancy: {}. Largest individual discrepancy: {:?}",
                            report.users_with_discrepancies,
                            report.total_discrepancy_amount,
                            report.largest_discrepancy
                        );
                        
                        // Log individual discrepancies for audit trail
                        for discrepancy in &report.discrepancies {
                            error!(
                                "User {} balance discrepancy: expected {}, actual {}, difference {} (last transaction: {:?})",
                                discrepancy.user_id,
                                discrepancy.expected_balance,
                                discrepancy.actual_balance,
                                discrepancy.discrepancy_amount,
                                discrepancy.last_transaction_date
                            );
                        }
                    } else {
                        info!("Financial reconciliation passed: all user balances are consistent with transaction history");
                    }
                }
                Err(e) => {
                    error!("Scheduled reconciliation failed: {}", e);
                }
            }
        })
    })
    .map_err(|e| format!("Failed to create reconciliation job: {}", e))?;
    
    scheduler.add(job)
        .await
        .map_err(|e| format!("Failed to add reconciliation job to scheduler: {}", e))?;
    
    scheduler.start()
        .await
        .map_err(|e| format!("Failed to start reconciliation scheduler: {}", e))?;
    
    info!("Reconciliation scheduler started successfully - will run hourly financial balance verification");
    
    // Keep the scheduler running in the background
    tokio::spawn(async move {
        // Keep the scheduler alive by holding a reference to it
        let _scheduler = scheduler;
        loop {
            tokio::time::sleep(tokio::time::Duration::from_secs(3600)).await; // Sleep for 1 hour
        }
    });
    
    Ok(())
}


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
    
    // Get JWT secret from key management and initialize JWT keys
    let key_config = match security::key_management::get_key_config() {
        Ok(config) => config,
        Err(e) => {
            log::error!("Failed to get key config: {}", e);
            std::process::exit(1);
        }
    };
    let jwt_secret_for_init = key_config.jwt_secret.clone();
    if let Err(e) = jwt::init_jwt_keys(&jwt_secret_for_init) {
        log::error!("Failed to initialize JWT keys: {}", e);
        log::error!("Cannot start server without working JWT keys");
        std::process::exit(1);
    }
    log::info!("JWT keys initialized successfully");
    
    // Database connection setup with dual pools
    let db_pools = match create_dual_pools().await {
        Ok(pools) => {
            log::info!("Database dual pools established successfully");
            pools
        },
        Err(e) => {
            log::error!("Failed to create database connection pools: {}", e);
            log::error!("Cannot start server without working database connections");
            std::process::exit(1);
        }
    };
    
    // Verify database is accessible and properly migrated using system pool
    let settings_repo = SettingsRepository::new(db_pools.system_pool.clone());
    if let Err(e) = settings_repo.ensure_ai_settings_exist().await {
        log::error!("AI settings missing from database: {}", e);
        log::error!("Please run database migrations to populate AI settings.");
        std::process::exit(1);
    }
    log::info!("Database AI settings verified - all configuration loaded dynamically from database");
    
    // Validate AI model configurations using system pool
    let model_repository = ModelRepository::new(std::sync::Arc::new(db_pools.system_pool.clone()));
    if let Err(e) = validate_ai_model_configurations(&settings_repo, &model_repository).await {
        log::error!("CRITICAL: AI model configuration validation failed: {}", e);
        std::process::exit(1);
    }
    log::info!("AI model configurations validated successfully");
    
    // Create app_settings (no AI model configuration - everything is database-driven)
    let app_settings = env_app_settings;
    
    // Initialize Auth0 OAuth service with system pool (for Auth0 user creation/lookup)
    let auth0_oauth_service = Auth0OAuthService::new(&app_settings, db_pools.system_pool.clone());
    log::info!("Auth0 OAuth service initialized successfully");
    
    // Initialize and start reconciliation scheduler for financial balance verification
    if let Err(e) = start_reconciliation_scheduler(db_pools.clone()).await {
        log::error!("Failed to start reconciliation scheduler: {}", e);
        log::error!("Continuing without automated reconciliation - manual verification required");
    }
    
    
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
    let auth0_state_store = Auth0StateStore::default();
    
    // Start cleanup task for polling store
    store_utils::start_cleanup_task(
        polling_store.clone(),
        auth0_state_store.clone(),
        app_settings.auth_stores.polling_store_expiry_mins,
        app_settings.auth_stores.auth0_state_store_expiry_mins,
        app_settings.auth_stores.cleanup_interval_secs
    );
    log::info!("Polling store and Auth0 state store cleanup tasks started");
    
    // Initialize reqwest HTTP client
    let http_client = crate::utils::http_client::new_api_client();
    
    // Initialize rate limiting storage (Redis or memory based on configuration)
    let rate_limit_storage = match create_rate_limit_storage(&app_settings.rate_limit, &Some(app_settings.redis.url.clone())).await {
        Ok(storage) => storage,
        Err(e) => {
            log::error!("Failed to initialize rate limiting storage: {}", e);
            std::process::exit(1);
        }
    };
    log::info!("Rate limiting storage initialized successfully");
    
    // Start rate limit memory store cleanup task if using memory storage
    if let crate::middleware::rate_limiting::RateLimitStorage::Memory { ip_storage, user_storage } = &rate_limit_storage {
        let ip_storage_clone = ip_storage.clone();
        let user_storage_clone = user_storage.clone();
        let window_duration = std::time::Duration::from_millis(app_settings.rate_limit.window_ms);
        let cleanup_interval = app_settings.rate_limit.cleanup_interval_secs.unwrap_or(300);

        tokio::spawn(async move {
            start_memory_store_cleanup_task(
                ip_storage_clone,
                user_storage_clone,
                window_duration,
                cleanup_interval,
            ).await;
        });
        log::info!("Rate limit memory store cleanup task started.");
    }

    // Initialize request tracker
    let request_tracker = RequestTracker::new();
    log::info!("Request tracker initialized");
    
    // Start request tracker cleanup task
    {
        let tracker = request_tracker.clone();
        tokio::spawn(async move {
            let mut interval = tokio::time::interval(tokio::time::Duration::from_secs(3600)); // Every hour
            loop {
                interval.tick().await;
                tracker.cleanup_old_requests(24).await; // Clean up requests older than 24 hours
                let active_count = tracker.get_active_request_count().await;
                log::info!("Request tracker cleanup completed. Active requests: {}", active_count);
            }
        });
    }
    
    // Initialize billing service
    let mut billing_service = BillingService::new(db_pools.clone(), app_settings.clone());
    
    // Set up Redis for billing service (mandatory)
    match redis::Client::open(app_settings.redis.url.as_str()) {
        Ok(client) => {
            match redis::aio::ConnectionManager::new(client).await {
                Ok(conn_mgr) => {
                    billing_service.set_redis_client(Arc::new(conn_mgr));
                    log::info!("Redis connected for billing service caching");
                }
                Err(e) => {
                    log::error!("Failed to create Redis connection for billing: {}", e);
                    std::process::exit(1);
                }
            }
        }
        Err(e) => {
            log::error!("Failed to open Redis client for billing: {}", e);
            std::process::exit(1);
        }
    }
    
    // Wrap billing service in Arc for sharing across handlers
    let billing_service = Arc::new(billing_service);
    
    // Clone app_settings for use outside the closure
    let app_settings_for_server = app_settings.clone();

    // Load runtime AI config during startup for performance optimization (before server factory)
    let runtime_ai_config = {
        let settings_repository = Arc::new(SettingsRepository::new(db_pools.system_pool.clone()));
        let model_repository = Arc::new(ModelRepository::new(Arc::new(db_pools.system_pool.clone())));
        
        match config_handlers::load_desktop_runtime_ai_config(&settings_repository, &model_repository).await {
            Ok(config) => {
                log::info!("Runtime AI configuration loaded successfully with {} providers", config.providers.len());
                Arc::new(config)
            }
            Err(e) => {
                log::error!("Failed to load runtime AI configuration: {}", e);
                log::error!("Cannot start server without runtime AI configuration");
                std::process::exit(1);
            }
        }
    };

    // Log one-time initialization messages before server creation
    info!("Starting HTTP server factory with shared state initialization");
    info!("Server configured with keep-alive: 5 minutes");
    info!("Client request timeout: {}s, disconnect timeout: 5s", app_settings_for_server.server.client_request_timeout_secs);
    info!("CORS configured for origins: {:?}", app_settings_for_server.server.cors_origins);
    info!("Rate limiting configured with Redis prefix separation for route isolation");

    let server = HttpServer::new(move || {
        // Clone the data for the factory closure
        let db_pools = db_pools.clone();
        let app_settings = app_settings.clone();
        let rate_limit_storage = rate_limit_storage.clone();
        let auth0_oauth_service = web::Data::new(auth0_oauth_service.clone());
        let tera = web::Data::new(tera.clone());
        let polling_store = web::Data::new(polling_store.clone());
        let auth0_state_store = web::Data::new(auth0_state_store.clone());
        let http_client = web::Data::new(http_client.clone());
        let billing_service = billing_service.clone();
        let runtime_ai_config = runtime_ai_config.clone();
        
        // Initialize repositories with appropriate pools
        // User-specific operations use user pool (with RLS)
        let api_usage_repository = ApiUsageRepository::new(db_pools.user_pool.clone());
        
        // System operations use system pool
        let model_repository_for_proxy = std::sync::Arc::new(ModelRepository::new(std::sync::Arc::new(db_pools.system_pool.clone())));
        let settings_repository_for_proxy = std::sync::Arc::new(SettingsRepository::new(db_pools.system_pool.clone()));
        
        let api_usage_repository = std::sync::Arc::new(api_usage_repository);
        let credit_service = crate::services::credit_service::CreditService::new(db_pools.clone());
        
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
        
        // Create app state for shared access to repositories with appropriate pools
        // User operations - use system pool for Auth0 lookups, user pool for user data
        let user_repository = std::sync::Arc::new(UserRepository::new(db_pools.system_pool.clone())); // Auth0 lookups need system pool
        
        // System operations - use system pool
        let model_repository = std::sync::Arc::new(ModelRepository::new(std::sync::Arc::new(db_pools.system_pool.clone())));
        let settings_repository = std::sync::Arc::new(SettingsRepository::new(db_pools.system_pool.clone()));
        let system_prompts_repository = std::sync::Arc::new(SystemPromptsRepository::new(db_pools.system_pool.clone()));
        
        // User-specific operations - use user pool  
        let customer_billing_repository = std::sync::Arc::new(CustomerBillingRepository::new(db_pools.user_pool.clone()));
        
        // Create application state
        let app_state = web::Data::new(AppState {
            settings: std::sync::Arc::new(app_settings.clone()),
            api_usage_repository: api_usage_repository.clone(),
            model_repository,
            customer_billing_repository,
            user_repository: user_repository.clone(),
            settings_repository,
            runtime_ai_config,
        });
        
        // Create rate limiting middleware instances with different prefixes for independent Redis counters
        let mut public_rate_limit_config = app_settings.rate_limit.clone();
        public_rate_limit_config.redis_key_prefix = Some("public_routes".to_string());
        let public_ip_rate_limiter = create_ip_rate_limiter(public_rate_limit_config, rate_limit_storage.clone());
        
        let account_creation_rate_limiter = create_ip_rate_limiter(app_settings.account_creation_rate_limit.clone(), rate_limit_storage.clone());
        
        let mut strict_rate_limit_config = app_settings.rate_limit.clone();
        strict_rate_limit_config.redis_key_prefix = Some("strict_api".to_string());
        let strict_rate_limiter = create_strict_rate_limiter(strict_rate_limit_config, rate_limit_storage.clone());
        
        // Configure payload limits (5MB = 5,242,880 bytes)
        // PayloadConfig: Controls raw payload size before extraction
        let payload_config = web::PayloadConfig::new(5_242_880);
            
        // JsonConfig: Controls JSON deserialization limits
        let json_config = web::JsonConfig::default()
            .limit(5_242_880)
            .error_handler(|err, _req| {
                actix_web::error::InternalError::from_response(
                    err,
                    actix_web::HttpResponse::BadRequest().json(serde_json::json!({
                        "error": {
                            "type": "payload_too_large",
                            "message": "Request payload exceeds the 5MB limit"
                        }
                    }))
                ).into()
            });

        // Create the App with common middleware and data
        App::new()
            .wrap(Logger::new("%a %t \"%r\" %s %b \"%{Referer}i\" \"%{User-Agent}i\" %T"))
            .wrap(cors)
            .app_data(payload_config)
            .app_data(json_config)
            .app_data(auth0_oauth_service)
            .app_data(web::Data::new(billing_service.clone()))
            .app_data(web::Data::new(request_tracker.clone()))
            .app_data(app_state.clone())
            .app_data(tera.clone())
            .app_data(polling_store.clone())
            .app_data(auth0_state_store.clone())
            .app_data(http_client.clone())
            .app_data(web::Data::new(user_repository.clone()))
            .app_data(web::Data::new((*app_state.model_repository).clone()))
            .app_data(web::Data::new(system_prompts_repository.clone()))
            .app_data(web::Data::new(credit_service.clone()))
            .app_data(web::Data::new(app_settings.clone()))
            .app_data(web::Data::new(db_pools.clone()))
            .app_data(web::Data::new(ApiUsageRepository::new(db_pools.user_pool.clone())))
            
            // Register health check endpoint with IP-based rate limiting
            .service(
                web::resource("/health")
                    .wrap(public_ip_rate_limiter.clone())
                    .route(web::get().to(handlers::health::health_check))
            )
            // Test route directly on main app (not in /api scope)
            .route("/direct-test", web::get().to(|| async { actix_web::HttpResponse::Ok().body("Direct route works!") }))
            // Public auth routes with IP-based rate limiting (no /api prefix)
            .service(
                web::scope("/auth")
                    .wrap(public_ip_rate_limiter.clone())
                    .configure(|cfg| configure_public_auth_routes(cfg, account_creation_rate_limiter.clone()))
            )
            // Protected API routes with strict rate limiting (IP + User) and authentication (under /api)
            .service(
                web::scope("/api")
                    .wrap(strict_rate_limiter.clone())
                    .wrap(auth_middleware(db_pools.user_pool.clone(), db_pools.system_pool.clone()))
                    .configure(|cfg| configure_routes(cfg, strict_rate_limiter.clone()))
            )
            // Public webhook routes with IP-based rate limiting (no authentication)
            .service(
                web::scope("/webhooks")
                    .wrap(public_ip_rate_limiter.clone())
                    .configure(configure_webhook_routes)
            )
            // Public config and auth0 routes with IP-based rate limiting (no /api prefix, no authentication)
            // MOVED TO END to prevent intercepting other routes
            .service(
                web::scope("")
                    .wrap(public_ip_rate_limiter.clone())
                    .configure(configure_public_api_routes)
            )
    })
    .keep_alive(std::time::Duration::from_secs(300)) // 5 minutes keep-alive
    .client_request_timeout(std::time::Duration::from_secs(app_settings_for_server.server.client_request_timeout_secs)) // Configurable client timeout
    .client_disconnect_timeout(std::time::Duration::from_secs(5)) // 5 seconds to detect client disconnect
    .listen(listener)?
    .run();
    
    let server_handle = server.handle();
    
    // Spawn a task to listen for shutdown signals
    tokio::spawn(async move {
        #[cfg(unix)]
        tokio::select! {
            _ = tokio::signal::ctrl_c() => {
                log::info!("SIGINT received, initiating graceful shutdown...");
            },
            _ = async {
                let mut sigterm = tokio::signal::unix::signal(tokio::signal::unix::SignalKind::terminate())
                    .expect("Failed to install SIGTERM handler");
                sigterm.recv().await;
                log::info!("SIGTERM received, initiating graceful shutdown...");
            } => {},
        }
        
        #[cfg(not(unix))]
        tokio::select! {
            _ = tokio::signal::ctrl_c() => {
                log::info!("SIGINT received, initiating graceful shutdown...");
            },
        }
        server_handle.stop(true).await;
    });
    
    log::info!("Server running at http://{}", server_addr);
    log::info!("Press Ctrl+C to shutdown gracefully");
    server.await?;
    log::info!("Server shutdown complete.");
    Ok(())
}