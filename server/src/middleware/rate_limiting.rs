use actix_web::{
    dev::{Service, ServiceRequest, ServiceResponse, Transform},
    http::StatusCode,
    Error, HttpMessage, HttpResponse, Result,
};
use futures_util::future::{ok, ready, Ready};
use std::future::Future;
use std::pin::Pin;
use std::sync::Arc;
use std::task::{Context, Poll};
use std::collections::HashMap;
use std::time::{Duration, Instant};
use tokio::sync::RwLock;
use log::{debug, warn, error, info};
use uuid::Uuid;
use dashmap::DashMap;

use crate::config::settings::RateLimitConfig;
use crate::models::AuthenticatedUser;

/// Rate limiting strategy
#[derive(Debug, Clone)]
pub enum RateLimitStrategy {
    /// Rate limit by IP address (for public routes)
    ByIp,
    /// Rate limit by authenticated user ID (for protected routes)
    ByUser,
    /// Rate limit by both IP and user (strictest)
    ByIpAndUser,
}

/// Rate limiter entry for tracking requests
#[derive(Debug, Clone)]
pub struct RateLimitEntry {
    count: u64,
    window_start: Instant,
}

impl RateLimitEntry {
    fn new() -> Self {
        Self {
            count: 1,
            window_start: Instant::now(),
        }
    }

    fn is_window_expired(&self, window_duration: Duration) -> bool {
        self.window_start.elapsed() > window_duration
    }

    fn increment_if_valid(&mut self, max_requests: u64, window_duration: Duration) -> bool {
        if self.is_window_expired(window_duration) {
            // Reset window
            self.count = 1;
            self.window_start = Instant::now();
            true
        } else if self.count < max_requests {
            self.count += 1;
            true
        } else {
            false
        }
    }
}

/// Storage backend for rate limiting
#[derive(Clone)]
pub enum RateLimitStorage {
    /// In-memory storage using DashMap (single instance)
    Memory {
        ip_storage: Arc<DashMap<String, RateLimitEntry>>,
        user_storage: Arc<DashMap<Uuid, RateLimitEntry>>,
    },
    /// Redis-based storage (distributed)
    Redis {
        connection_manager: Arc<redis::aio::ConnectionManager>,
    },
}

impl RateLimitStorage {
    /// Create a new in-memory storage
    pub fn new_memory() -> Self {
        Self::Memory {
            ip_storage: Arc::new(DashMap::new()),
            user_storage: Arc::new(DashMap::new()),
        }
    }
    
    /// Get the Redis connection manager if using Redis storage
    pub fn get_redis_connection_manager(&self) -> Option<Arc<redis::aio::ConnectionManager>> {
        match self {
            RateLimitStorage::Redis { connection_manager } => Some(connection_manager.clone()),
            _ => None,
        }
    }

    /// Create a new Redis-based storage
    pub async fn new_redis(redis_url: &str) -> Result<Self, redis::RedisError> {
        let client = redis::Client::open(redis_url)?;
        let connection_manager = redis::aio::ConnectionManager::new(client).await?;
        
        info!("Redis connection established for rate limiting: {}", redis_url);
        
        Ok(Self::Redis {
            connection_manager: Arc::new(connection_manager),
        })
    }

    fn cleanup_expired_entries_memory(
        ip_storage: &Arc<DashMap<String, RateLimitEntry>>,
        user_storage: &Arc<DashMap<Uuid, RateLimitEntry>>,
        window_duration: Duration,
    ) {
        debug!("Cleaning up expired rate limit entries from memory");
        
        // Cleanup IP storage
        ip_storage.retain(|_, entry| !entry.is_window_expired(window_duration));
        
        // Cleanup user storage  
        user_storage.retain(|_, entry| !entry.is_window_expired(window_duration));

        debug!("Rate limit cleanup completed");
    }

    async fn check_ip_rate_limit_memory(
        ip_storage: &Arc<DashMap<String, RateLimitEntry>>,
        ip: &str,
        max_requests: u64,
        window_duration: Duration,
    ) -> bool {
        match ip_storage.get_mut(ip) {
            Some(mut entry) => entry.increment_if_valid(max_requests, window_duration),
            None => {
                ip_storage.insert(ip.to_string(), RateLimitEntry::new());
                true
            }
        }
    }

    async fn check_user_rate_limit_memory(
        user_storage: &Arc<DashMap<Uuid, RateLimitEntry>>,
        user_id: &Uuid,
        max_requests: u64,
        window_duration: Duration,
    ) -> bool {
        match user_storage.get_mut(user_id) {
            Some(mut entry) => entry.increment_if_valid(max_requests, window_duration),
            None => {
                user_storage.insert(*user_id, RateLimitEntry::new());
                true
            }
        }
    }

    async fn check_ip_rate_limit_redis(
        connection_manager: &Arc<redis::aio::ConnectionManager>,
        ip: &str,
        max_requests: u64,
        window_secs: u64,
        redis_key_prefix: &Option<String>,
    ) -> Result<bool, redis::RedisError> {
        use redis::AsyncCommands;
        
        let prefix = redis_key_prefix.as_deref().unwrap_or("default");
        let key = format!("rate_limit:{}:ip:{}", prefix, ip);
        let mut conn = connection_manager.as_ref().clone();
        
        // Use Redis pipeline for atomic operations
        let count: i64 = conn.incr(&key, 1).await?;
        
        if count == 1 {
            // Set expiration only on first increment
            let _: () = conn.expire(&key, window_secs as i64).await?;
        }
        
        Ok(count <= max_requests as i64)
    }

    async fn check_user_rate_limit_redis(
        connection_manager: &Arc<redis::aio::ConnectionManager>,
        user_id: &Uuid,
        max_requests: u64,
        window_secs: u64,
        redis_key_prefix: &Option<String>,
    ) -> Result<bool, redis::RedisError> {
        use redis::AsyncCommands;
        
        let prefix = redis_key_prefix.as_deref().unwrap_or("default");
        let key = format!("rate_limit:{}:user:{}", prefix, user_id);
        let mut conn = connection_manager.as_ref().clone();
        
        // Use Redis pipeline for atomic operations
        let count: i64 = conn.incr(&key, 1).await?;
        
        if count == 1 {
            // Set expiration only on first increment
            let _: () = conn.expire(&key, window_secs as i64).await?;
        }
        
        Ok(count <= max_requests as i64)
    }

    pub async fn check_ip_rate_limit(
        &self,
        ip: &str,
        max_requests: u64,
        window_duration: Duration,
        redis_key_prefix: &Option<String>,
    ) -> bool {
        match self {
            Self::Memory { ip_storage, user_storage } => {
                Self::check_ip_rate_limit_memory(
                    ip_storage, 
                    ip, 
                    max_requests, 
                    window_duration
                ).await
            },
            Self::Redis { connection_manager } => {
                let window_secs = window_duration.as_secs();
                match Self::check_ip_rate_limit_redis(connection_manager, ip, max_requests, window_secs, redis_key_prefix).await {
                    Ok(allowed) => allowed,
                    Err(e) => {
                        error!("Redis rate limit check failed for IP {}: {}. Denying request (fail closed).", ip, e);
                        // Fail closed - deny the request if Redis is down
                        false
                    }
                }
            }
        }
    }

    pub async fn check_user_rate_limit(
        &self,
        user_id: &Uuid,
        max_requests: u64,
        window_duration: Duration,
        redis_key_prefix: &Option<String>,
    ) -> bool {
        match self {
            Self::Memory { ip_storage, user_storage } => {
                Self::check_user_rate_limit_memory(
                    user_storage, 
                    user_id, 
                    max_requests, 
                    window_duration
                ).await
            },
            Self::Redis { connection_manager } => {
                let window_secs = window_duration.as_secs();
                match Self::check_user_rate_limit_redis(connection_manager, user_id, max_requests, window_secs, redis_key_prefix).await {
                    Ok(allowed) => allowed,
                    Err(e) => {
                        error!("Redis rate limit check failed for user {}: {}. Denying request (fail closed).", user_id, e);
                        // Fail closed - deny the request if Redis is down
                        false
                    }
                }
            }
        }
    }
}

/// Rate limiting middleware
#[derive(Clone)]
pub struct RateLimitMiddleware {
    config: RateLimitConfig,
    strategy: RateLimitStrategy,
    storage: RateLimitStorage,
}

impl RateLimitMiddleware {
    pub fn new(config: RateLimitConfig, strategy: RateLimitStrategy) -> Self {
        Self {
            config,
            strategy,
            storage: RateLimitStorage::new_memory(),
        }
    }

    pub fn with_shared_storage(
        config: RateLimitConfig,
        strategy: RateLimitStrategy,
        storage: RateLimitStorage,
    ) -> Self {
        Self {
            config,
            strategy,
            storage,
        }
    }

    // Extracts the client IP address. Relies on the immediate upstream proxy
    // correctly setting X-Forwarded-For or X-Real-IP. If multiple proxies are
    // involved, ensure the trusted proxy is the one setting/appending to these headers
    // and that it cannot be spoofed by clients.
    // The first IP in X-Forwarded-For is typically the original client.
    fn extract_client_ip(&self, req: &ServiceRequest) -> String {
        // Try to get real IP from headers (for proxies)
        if let Some(forwarded_for) = req.headers().get("x-forwarded-for") {
            if let Ok(forwarded_str) = forwarded_for.to_str() {
                if let Some(first_ip) = forwarded_str.split(',').next() {
                    return first_ip.trim().to_string();
                }
            }
        }

        if let Some(real_ip) = req.headers().get("x-real-ip") {
            if let Ok(real_ip_str) = real_ip.to_str() {
                return real_ip_str.to_string();
            }
        }

        // Fallback to connection info
        if let Some(peer_addr) = req.peer_addr() {
            peer_addr.ip().to_string()
        } else {
            "unknown".to_string()
        }
    }

    async fn is_request_allowed(&self, req: &ServiceRequest) -> bool {
        let max_requests = self.config.max_requests;
        let window_duration = Duration::from_millis(self.config.window_ms);

        match self.strategy {
            RateLimitStrategy::ByIp => {
                let ip = self.extract_client_ip(req);
                self.storage
                    .check_ip_rate_limit(&ip, max_requests, window_duration, &self.config.redis_key_prefix)
                    .await
            }
            RateLimitStrategy::ByUser => {
                // Extract user ID from request extensions (set by auth middleware)
                if let Some(user) = req.extensions().get::<AuthenticatedUser>() {
                    self.storage
                        .check_user_rate_limit(&user.user_id, max_requests, window_duration, &self.config.redis_key_prefix)
                        .await
                } else {
                    // No user context, allow request (should be handled by auth middleware)
                    true
                }
            }
            RateLimitStrategy::ByIpAndUser => {
                let ip = self.extract_client_ip(req);
                let ip_allowed = self.storage
                    .check_ip_rate_limit(&ip, max_requests, window_duration, &self.config.redis_key_prefix)
                    .await;

                if !ip_allowed {
                    return false;
                }

                // Also check user limit if authenticated
                if let Some(user) = req.extensions().get::<AuthenticatedUser>() {
                    self.storage
                        .check_user_rate_limit(&user.user_id, max_requests, window_duration, &self.config.redis_key_prefix)
                        .await
                } else {
                    true
                }
            }
        }
    }

}

impl<S, B> Transform<S, ServiceRequest> for RateLimitMiddleware
where
    S: Service<ServiceRequest, Response = ServiceResponse<B>, Error = Error> + 'static,
    S::Future: 'static,
    B: 'static,
{
    type Response = ServiceResponse<B>;
    type Error = Error;
    type Transform = RateLimitService<S>;
    type InitError = ();
    type Future = Ready<Result<Self::Transform, Self::InitError>>;

    fn new_transform(&self, service: S) -> Self::Future {
        ok(RateLimitService {
            service: Arc::new(service),
            middleware: self.clone(),
        })
    }
}

#[derive(Clone)]
pub struct RateLimitService<S> {
    service: Arc<S>,
    middleware: RateLimitMiddleware,
}

impl<S, B> Service<ServiceRequest> for RateLimitService<S>
where
    S: Service<ServiceRequest, Response = ServiceResponse<B>, Error = Error> + 'static,
    S::Future: 'static,
    B: 'static,
{
    type Response = ServiceResponse<B>;
    type Error = Error;
    type Future = Pin<Box<dyn Future<Output = Result<Self::Response, Self::Error>>>>;

    fn poll_ready(&self, cx: &mut Context<'_>) -> Poll<Result<(), Self::Error>> {
        self.service.poll_ready(cx)
    }

    fn call(&self, req: ServiceRequest) -> Self::Future {
        let service = self.service.clone();
        let middleware = self.middleware.clone();

        Box::pin(async move {
            // Skip rate limiting for OPTIONS requests (CORS preflight)
            if req.method() == actix_web::http::Method::OPTIONS {
                return service.call(req).await;
            }

            let request_path = req.path().to_string();
            let client_ip = middleware.extract_client_ip(&req);
            
            debug!("Rate limiting check for {} from IP: {}", request_path, client_ip);

            // Check if request is allowed
            let is_allowed = middleware.is_request_allowed(&req).await;

            if !is_allowed {
                warn!(
                    "Rate limit exceeded for {} from IP: {} (strategy: {:?})",
                    request_path, client_ip, middleware.strategy
                );
                
                return Err(Error::from(actix_web::error::ErrorTooManyRequests(
                    "Rate limit exceeded. Please try again later."
                )));
            }

            debug!("Rate limit passed for {} from IP: {}", request_path, client_ip);
            service.call(req).await
        })
    }
}

/// Initialize rate limiting storage based on configuration
pub async fn create_rate_limit_storage(config: &RateLimitConfig, redis_url: &Option<String>) -> Result<RateLimitStorage, String> {
    match redis_url {
        Some(url) => {
            match RateLimitStorage::new_redis(url).await {
                Ok(storage) => {
                    info!("Redis connected for rate limiting");
                    Ok(storage)
                },
                Err(e) => {
                    error!("Failed to connect to Redis for rate limiting: {}", e);
                    Err(format!("Failed to connect to Redis: {}. Redis is required for rate limiting.", e))
                }
            }
        },
        None => {
            error!("REDIS_URL is not set. Redis is required for the application to run.");
            Err(String::from("REDIS_URL must be set. Redis is required for the application."))
        }
    }
}

/// Helper function to create rate limiting middleware with different configurations
pub fn create_ip_rate_limiter(config: RateLimitConfig, storage: RateLimitStorage) -> RateLimitMiddleware {
    RateLimitMiddleware::with_shared_storage(config, RateLimitStrategy::ByIp, storage)
}

pub fn create_user_rate_limiter(config: RateLimitConfig, storage: RateLimitStorage) -> RateLimitMiddleware {
    RateLimitMiddleware::with_shared_storage(config, RateLimitStrategy::ByUser, storage)
}

pub fn create_strict_rate_limiter(config: RateLimitConfig, storage: RateLimitStorage) -> RateLimitMiddleware {
    RateLimitMiddleware::with_shared_storage(config, RateLimitStrategy::ByIpAndUser, storage)
}

/// Start a background task for cleaning up expired rate limit entries from memory stores
pub async fn start_memory_store_cleanup_task(
    ip_storage: Arc<DashMap<String, RateLimitEntry>>,
    user_storage: Arc<DashMap<Uuid, RateLimitEntry>>,
    window_duration: Duration,
    cleanup_interval_secs: u64,
) {
    let mut interval = tokio::time::interval(Duration::from_secs(cleanup_interval_secs));
    info!("Starting rate limit memory store cleanup task (interval: {}s)", cleanup_interval_secs);
    
    loop {
        interval.tick().await;
        debug!("Cleaning up expired rate limit entries from memory");
        
        RateLimitStorage::cleanup_expired_entries_memory(
            &ip_storage,
            &user_storage,
            window_duration,
        );
        
        debug!("Rate limit memory cleanup completed");
    }
}