use actix_web::{
    Error, HttpMessage, HttpResponse, Result,
    dev::{Service, ServiceRequest, ServiceResponse, Transform},
    http::StatusCode,
};
use dashmap::DashMap;
use futures_util::future::{Ready, ok, ready};
use log::{debug, error, info, warn};
use std::collections::HashMap;
use std::future::Future;
use std::pin::Pin;
use std::sync::Arc;
use std::task::{Context, Poll};
use std::time::{Duration, Instant};
use tokio::sync::RwLock;
use uuid::Uuid;

use crate::config::settings::RateLimitConfig;
use crate::middleware::auth_types::ApiKeyIdentity;
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
    /// Rate limit by device ID (for mobile/desktop applications)
    ByDevice,
    /// Rate limit by client ID (for API clients)
    ByClient,
    /// Rate limit with different rules for read vs write operations
    ByOperationType,
}

/// Rate limiter entry for tracking requests
#[derive(Debug, Clone)]
pub struct RateLimitEntry {
    count: u64,
    window_start: Instant,
}

/// Sliding window rate limiter entry
#[derive(Debug, Clone)]
pub struct SlidingWindowEntry {
    /// Timestamps of requests within the current window
    requests: Vec<Instant>,
    /// Maximum number of requests allowed
    max_requests: u64,
    /// Window duration
    window_duration: Duration,
}

/// Enhanced rate limiting configuration for different operation types
#[derive(Debug, Clone)]
pub struct OperationRateLimits {
    /// Limits for read operations (GET requests)
    pub read_limits: RateLimitConfig,
    /// Limits for write operations (POST, PUT, DELETE)
    pub write_limits: RateLimitConfig,
    /// Limits for admin operations
    pub admin_limits: RateLimitConfig,
}

/// Device-specific rate limiting configuration
#[derive(Debug, Clone)]
pub struct DeviceRateLimits {
    /// Standard device limits
    pub standard_limits: RateLimitConfig,
    /// Mobile device limits (typically more restrictive)
    pub mobile_limits: RateLimitConfig,
    /// Desktop application limits
    pub desktop_limits: RateLimitConfig,
    /// Trusted device limits (higher thresholds)
    pub trusted_device_limits: RateLimitConfig,
}

/// Client type for rate limiting
#[derive(Debug, Clone, PartialEq)]
pub enum ClientType {
    Web,
    Mobile,
    Desktop,
    Api,
    Trusted,
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

impl SlidingWindowEntry {
    fn new(max_requests: u64, window_duration: Duration) -> Self {
        Self {
            requests: Vec::new(),
            max_requests,
            window_duration,
        }
    }

    /// Check if request is allowed under sliding window rate limiting
    fn is_request_allowed(&mut self) -> bool {
        let now = Instant::now();

        // Remove expired requests (outside the window)
        let cutoff = now - self.window_duration;
        self.requests.retain(|&request_time| request_time > cutoff);

        // Check if we're under the limit
        if (self.requests.len() as u64) < self.max_requests {
            self.requests.push(now);
            true
        } else {
            false
        }
    }

    /// Get current request count in the window
    fn current_count(&self) -> u64 {
        let now = Instant::now();
        let cutoff = now - self.window_duration;
        self.requests
            .iter()
            .filter(|&&request_time| request_time > cutoff)
            .count() as u64
    }

    /// Get time until next request is allowed
    fn time_until_next_request(&self) -> Option<Duration> {
        if (self.requests.len() as u64) < self.max_requests {
            return None;
        }

        let now = Instant::now();
        let oldest_in_window = self.requests.first()?;
        let time_since_oldest = now.duration_since(*oldest_in_window);

        if time_since_oldest < self.window_duration {
            Some(self.window_duration - time_since_oldest)
        } else {
            None
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
        device_storage: Arc<DashMap<String, RateLimitEntry>>,
        client_storage: Arc<DashMap<String, RateLimitEntry>>,
        sliding_window_storage: Arc<DashMap<String, SlidingWindowEntry>>,
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
            device_storage: Arc::new(DashMap::new()),
            client_storage: Arc::new(DashMap::new()),
            sliding_window_storage: Arc::new(DashMap::new()),
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

        info!(
            "Redis connection established for rate limiting: {}",
            redis_url
        );

        Ok(Self::Redis {
            connection_manager: Arc::new(connection_manager),
        })
    }

    fn cleanup_expired_entries_memory(
        ip_storage: &Arc<DashMap<String, RateLimitEntry>>,
        user_storage: &Arc<DashMap<Uuid, RateLimitEntry>>,
        device_storage: &Arc<DashMap<String, RateLimitEntry>>,
        client_storage: &Arc<DashMap<String, RateLimitEntry>>,
        sliding_window_storage: &Arc<DashMap<String, SlidingWindowEntry>>,
        window_duration: Duration,
    ) {
        debug!("Cleaning up expired rate limit entries from memory");

        // Cleanup IP storage
        ip_storage.retain(|_, entry| !entry.is_window_expired(window_duration));

        // Cleanup user storage
        user_storage.retain(|_, entry| !entry.is_window_expired(window_duration));

        // Cleanup device storage
        device_storage.retain(|_, entry| !entry.is_window_expired(window_duration));

        // Cleanup client storage
        client_storage.retain(|_, entry| !entry.is_window_expired(window_duration));

        // Cleanup sliding window storage (remove entries with no recent requests)
        sliding_window_storage.retain(|_, entry| {
            let now = Instant::now();
            let cutoff = now - window_duration;
            entry
                .requests
                .iter()
                .any(|&request_time| request_time > cutoff)
        });

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

    async fn check_device_rate_limit_memory(
        device_storage: &Arc<DashMap<String, RateLimitEntry>>,
        device_id: &str,
        max_requests: u64,
        window_duration: Duration,
    ) -> bool {
        match device_storage.get_mut(device_id) {
            Some(mut entry) => entry.increment_if_valid(max_requests, window_duration),
            None => {
                device_storage.insert(device_id.to_string(), RateLimitEntry::new());
                true
            }
        }
    }

    async fn check_client_rate_limit_memory(
        client_storage: &Arc<DashMap<String, RateLimitEntry>>,
        client_id: &str,
        max_requests: u64,
        window_duration: Duration,
    ) -> bool {
        match client_storage.get_mut(client_id) {
            Some(mut entry) => entry.increment_if_valid(max_requests, window_duration),
            None => {
                client_storage.insert(client_id.to_string(), RateLimitEntry::new());
                true
            }
        }
    }

    async fn check_sliding_window_rate_limit_memory(
        sliding_window_storage: &Arc<DashMap<String, SlidingWindowEntry>>,
        key: &str,
        max_requests: u64,
        window_duration: Duration,
    ) -> bool {
        match sliding_window_storage.get_mut(key) {
            Some(mut entry) => entry.is_request_allowed(),
            None => {
                let mut new_entry = SlidingWindowEntry::new(max_requests, window_duration);
                let allowed = new_entry.is_request_allowed();
                sliding_window_storage.insert(key.to_string(), new_entry);
                allowed
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

    async fn check_device_rate_limit_redis(
        connection_manager: &Arc<redis::aio::ConnectionManager>,
        device_id: &str,
        max_requests: u64,
        window_secs: u64,
        redis_key_prefix: &Option<String>,
    ) -> Result<bool, redis::RedisError> {
        use redis::AsyncCommands;

        let prefix = redis_key_prefix.as_deref().unwrap_or("default");
        let key = format!("rate_limit:{}:device:{}", prefix, device_id);
        let mut conn = connection_manager.as_ref().clone();

        let count: i64 = conn.incr(&key, 1).await?;

        if count == 1 {
            let _: () = conn.expire(&key, window_secs as i64).await?;
        }

        Ok(count <= max_requests as i64)
    }

    async fn check_client_rate_limit_redis(
        connection_manager: &Arc<redis::aio::ConnectionManager>,
        client_id: &str,
        max_requests: u64,
        window_secs: u64,
        redis_key_prefix: &Option<String>,
    ) -> Result<bool, redis::RedisError> {
        use redis::AsyncCommands;

        let prefix = redis_key_prefix.as_deref().unwrap_or("default");
        let key = format!("rate_limit:{}:client:{}", prefix, client_id);
        let mut conn = connection_manager.as_ref().clone();

        let count: i64 = conn.incr(&key, 1).await?;

        if count == 1 {
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
            Self::Memory { ip_storage, .. } => {
                Self::check_ip_rate_limit_memory(ip_storage, ip, max_requests, window_duration)
                    .await
            }
            Self::Redis { connection_manager } => {
                let window_secs = window_duration.as_secs();
                match Self::check_ip_rate_limit_redis(
                    connection_manager,
                    ip,
                    max_requests,
                    window_secs,
                    redis_key_prefix,
                )
                .await
                {
                    Ok(allowed) => allowed,
                    Err(e) => {
                        error!(
                            "Redis rate limit check failed for IP {}: {}. Denying request (fail closed).",
                            ip, e
                        );
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
            Self::Memory { user_storage, .. } => {
                Self::check_user_rate_limit_memory(
                    user_storage,
                    user_id,
                    max_requests,
                    window_duration,
                )
                .await
            }
            Self::Redis { connection_manager } => {
                let window_secs = window_duration.as_secs();
                match Self::check_user_rate_limit_redis(
                    connection_manager,
                    user_id,
                    max_requests,
                    window_secs,
                    redis_key_prefix,
                )
                .await
                {
                    Ok(allowed) => allowed,
                    Err(e) => {
                        error!(
                            "Redis rate limit check failed for user {}: {}. Denying request (fail closed).",
                            user_id, e
                        );
                        // Fail closed - deny the request if Redis is down
                        false
                    }
                }
            }
        }
    }

    pub async fn check_device_rate_limit(
        &self,
        device_id: &str,
        max_requests: u64,
        window_duration: Duration,
        redis_key_prefix: &Option<String>,
    ) -> bool {
        match self {
            Self::Memory { device_storage, .. } => {
                Self::check_device_rate_limit_memory(
                    device_storage,
                    device_id,
                    max_requests,
                    window_duration,
                )
                .await
            }
            Self::Redis { connection_manager } => {
                let window_secs = window_duration.as_secs();
                match Self::check_device_rate_limit_redis(
                    connection_manager,
                    device_id,
                    max_requests,
                    window_secs,
                    redis_key_prefix,
                )
                .await
                {
                    Ok(allowed) => allowed,
                    Err(e) => {
                        error!(
                            "Redis rate limit check failed for device {}: {}. Denying request (fail closed).",
                            device_id, e
                        );
                        false
                    }
                }
            }
        }
    }

    pub async fn check_client_rate_limit(
        &self,
        client_id: &str,
        max_requests: u64,
        window_duration: Duration,
        redis_key_prefix: &Option<String>,
    ) -> bool {
        match self {
            Self::Memory { client_storage, .. } => {
                Self::check_client_rate_limit_memory(
                    client_storage,
                    client_id,
                    max_requests,
                    window_duration,
                )
                .await
            }
            Self::Redis { connection_manager } => {
                let window_secs = window_duration.as_secs();
                match Self::check_client_rate_limit_redis(
                    connection_manager,
                    client_id,
                    max_requests,
                    window_secs,
                    redis_key_prefix,
                )
                .await
                {
                    Ok(allowed) => allowed,
                    Err(e) => {
                        error!(
                            "Redis rate limit check failed for client {}: {}. Denying request (fail closed).",
                            client_id, e
                        );
                        false
                    }
                }
            }
        }
    }

    pub async fn check_sliding_window_rate_limit(
        &self,
        key: &str,
        max_requests: u64,
        window_duration: Duration,
    ) -> bool {
        match self {
            Self::Memory {
                sliding_window_storage,
                ..
            } => {
                Self::check_sliding_window_rate_limit_memory(
                    sliding_window_storage,
                    key,
                    max_requests,
                    window_duration,
                )
                .await
            }
            Self::Redis { .. } => {
                // For Redis, we fall back to regular rate limiting for now
                // A full sliding window implementation in Redis would require Lua scripts
                warn!(
                    "Sliding window rate limiting not fully supported with Redis backend, using fixed window"
                );
                self.check_ip_rate_limit(key, max_requests, window_duration, &None)
                    .await
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
    operation_limits: Option<OperationRateLimits>,
    device_limits: Option<DeviceRateLimits>,
    use_sliding_window: bool,
}

impl RateLimitMiddleware {
    pub fn new(config: RateLimitConfig, strategy: RateLimitStrategy) -> Self {
        Self {
            config,
            strategy,
            storage: RateLimitStorage::new_memory(),
            operation_limits: None,
            device_limits: None,
            use_sliding_window: false,
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
            operation_limits: None,
            device_limits: None,
            use_sliding_window: false,
        }
    }

    /// Create middleware with operation-specific limits
    pub fn with_operation_limits(
        strategy: RateLimitStrategy,
        storage: RateLimitStorage,
        operation_limits: OperationRateLimits,
    ) -> Self {
        Self {
            config: operation_limits.read_limits.clone(), // Default config
            strategy,
            storage,
            operation_limits: Some(operation_limits),
            device_limits: None,
            use_sliding_window: false,
        }
    }

    /// Create middleware with device-specific limits
    pub fn with_device_limits(
        strategy: RateLimitStrategy,
        storage: RateLimitStorage,
        device_limits: DeviceRateLimits,
    ) -> Self {
        Self {
            config: device_limits.standard_limits.clone(), // Default config
            strategy,
            storage,
            operation_limits: None,
            device_limits: Some(device_limits),
            use_sliding_window: false,
        }
    }

    /// Enable sliding window rate limiting
    pub fn with_sliding_window(mut self) -> Self {
        self.use_sliding_window = true;
        self
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

    /// Detect client type from request headers
    fn detect_client_type(&self, req: &ServiceRequest) -> ClientType {
        // Check User-Agent header
        if let Some(user_agent) = req.headers().get("user-agent") {
            if let Ok(ua_str) = user_agent.to_str() {
                let ua_lower = ua_str.to_lowercase();

                if ua_lower.contains("plantocode-mobile") || ua_lower.contains("mobile") {
                    return ClientType::Mobile;
                } else if ua_lower.contains("plantocode-desktop") || ua_lower.contains("electron")
                {
                    return ClientType::Desktop;
                } else if ua_lower.contains("plantocode-api") {
                    return ClientType::Api;
                }
            }
        }

        // Check X-Client-Type header
        if let Some(client_type) = req.headers().get("x-client-type") {
            if let Ok(type_str) = client_type.to_str() {
                match type_str.to_lowercase().as_str() {
                    "mobile" => return ClientType::Mobile,
                    "desktop" => return ClientType::Desktop,
                    "api" => return ClientType::Api,
                    "trusted" => return ClientType::Trusted,
                    _ => {}
                }
            }
        }

        // Check if request has trusted device indicators
        if req.headers().contains_key("x-trusted-device") {
            return ClientType::Trusted;
        }

        // Default to web client
        ClientType::Web
    }

    /// Get device ID from request headers
    fn get_device_id(&self, req: &ServiceRequest) -> Option<String> {
        req.headers()
            .get("x-device-id")
            .and_then(|h| h.to_str().ok())
            .map(|s| s.to_string())
    }

    /// Get client ID from request headers
    /// Prefers API key identity if present, otherwise returns None
    fn get_client_id(&self, req: &ServiceRequest) -> Option<String> {
        // Check for API key identity first
        if let Some(api_key_identity) = req.extensions().get::<ApiKeyIdentity>() {
            return Some(format!("api_key:{}", api_key_identity.api_key_id));
        }

        None
    }

    /// Determine operation type from request
    fn get_operation_type(&self, req: &ServiceRequest) -> &str {
        match req.method() {
            &actix_web::http::Method::GET | &actix_web::http::Method::HEAD => "read",
            &actix_web::http::Method::POST
            | &actix_web::http::Method::PUT
            | &actix_web::http::Method::DELETE
            | &actix_web::http::Method::PATCH => {
                if req.path().contains("/admin/") {
                    "admin"
                } else {
                    "write"
                }
            }
            _ => "other",
        }
    }

    async fn is_request_allowed(&self, req: &ServiceRequest) -> bool {
        let (max_requests, window_duration) = self.get_rate_limits_for_request(req);

        match self.strategy {
            RateLimitStrategy::ByIp => {
                let ip = self.extract_client_ip(req);
                self.check_rate_limit_with_strategy(&ip, max_requests, window_duration, "ip")
                    .await
            }
            RateLimitStrategy::ByUser => {
                // Extract user ID from request extensions (set by auth middleware)
                if let Some(user) = req.extensions().get::<AuthenticatedUser>() {
                    let key = user.user_id.to_string();
                    self.storage
                        .check_user_rate_limit(
                            &user.user_id,
                            max_requests,
                            window_duration,
                            &self.config.redis_key_prefix,
                        )
                        .await
                } else {
                    // No user context, allow request (should be handled by auth middleware)
                    true
                }
            }
            RateLimitStrategy::ByDevice => {
                if let Some(device_id) = self.get_device_id(req) {
                    self.storage
                        .check_device_rate_limit(
                            &device_id,
                            max_requests,
                            window_duration,
                            &self.config.redis_key_prefix,
                        )
                        .await
                } else {
                    // No device ID, fall back to IP-based limiting
                    let ip = self.extract_client_ip(req);
                    self.check_rate_limit_with_strategy(&ip, max_requests, window_duration, "ip")
                        .await
                }
            }
            RateLimitStrategy::ByClient => {
                if let Some(client_id) = self.get_client_id(req) {
                    self.storage
                        .check_client_rate_limit(
                            &client_id,
                            max_requests,
                            window_duration,
                            &self.config.redis_key_prefix,
                        )
                        .await
                } else {
                    // No client ID, fall back to IP-based limiting
                    let ip = self.extract_client_ip(req);
                    self.check_rate_limit_with_strategy(&ip, max_requests, window_duration, "ip")
                        .await
                }
            }
            RateLimitStrategy::ByOperationType => {
                let operation_type = self.get_operation_type(req);
                let key = format!("{}:{}", self.extract_client_ip(req), operation_type);
                self.check_rate_limit_with_strategy(
                    &key,
                    max_requests,
                    window_duration,
                    "operation",
                )
                .await
            }
            RateLimitStrategy::ByIpAndUser => {
                let ip = self.extract_client_ip(req);
                let ip_allowed = self
                    .check_rate_limit_with_strategy(&ip, max_requests, window_duration, "ip")
                    .await;

                if !ip_allowed {
                    return false;
                }

                // Also check user limit if authenticated
                if let Some(user) = req.extensions().get::<AuthenticatedUser>() {
                    self.storage
                        .check_user_rate_limit(
                            &user.user_id,
                            max_requests,
                            window_duration,
                            &self.config.redis_key_prefix,
                        )
                        .await
                } else {
                    true
                }
            }
        }
    }

    /// Get rate limits based on client type and operation
    fn get_rate_limits_for_request(&self, req: &ServiceRequest) -> (u64, Duration) {
        // Check operation-specific limits first
        if let Some(op_limits) = &self.operation_limits {
            let operation_type = self.get_operation_type(req);
            let config = match operation_type {
                "read" => &op_limits.read_limits,
                "write" => &op_limits.write_limits,
                "admin" => &op_limits.admin_limits,
                _ => &self.config,
            };
            return (config.max_requests, Duration::from_millis(config.window_ms));
        }

        // Check device-specific limits
        if let Some(device_limits) = &self.device_limits {
            let client_type = self.detect_client_type(req);
            let config = match client_type {
                ClientType::Mobile => &device_limits.mobile_limits,
                ClientType::Desktop => &device_limits.desktop_limits,
                ClientType::Trusted => &device_limits.trusted_device_limits,
                _ => &device_limits.standard_limits,
            };
            return (config.max_requests, Duration::from_millis(config.window_ms));
        }

        // Default limits
        (
            self.config.max_requests,
            Duration::from_millis(self.config.window_ms),
        )
    }

    /// Check rate limit using appropriate strategy (sliding window or fixed window)
    async fn check_rate_limit_with_strategy(
        &self,
        key: &str,
        max_requests: u64,
        window_duration: Duration,
        strategy_type: &str,
    ) -> bool {
        if self.use_sliding_window {
            let sliding_key = format!("sliding:{}:{}", strategy_type, key);
            self.storage
                .check_sliding_window_rate_limit(&sliding_key, max_requests, window_duration)
                .await
        } else {
            match strategy_type {
                "ip" => {
                    self.storage
                        .check_ip_rate_limit(
                            key,
                            max_requests,
                            window_duration,
                            &self.config.redis_key_prefix,
                        )
                        .await
                }
                _ => {
                    self.storage
                        .check_ip_rate_limit(
                            key,
                            max_requests,
                            window_duration,
                            &self.config.redis_key_prefix,
                        )
                        .await
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

            debug!(
                "Rate limiting check for {} from IP: {}",
                request_path, client_ip
            );

            // Check if request is allowed
            let is_allowed = middleware.is_request_allowed(&req).await;

            if !is_allowed {
                warn!(
                    "Rate limit exceeded for {} from IP: {} (strategy: {:?})",
                    request_path, client_ip, middleware.strategy
                );

                return Err(Error::from(actix_web::error::ErrorTooManyRequests(
                    "Rate limit exceeded. Please try again later.",
                )));
            }

            debug!(
                "Rate limit passed for {} from IP: {}",
                request_path, client_ip
            );
            service.call(req).await
        })
    }
}

/// Initialize rate limiting storage based on configuration
pub async fn create_rate_limit_storage(
    config: &RateLimitConfig,
    redis_url: &Option<String>,
) -> Result<RateLimitStorage, String> {
    match redis_url {
        Some(url) => match RateLimitStorage::new_redis(url).await {
            Ok(storage) => {
                info!("Redis connected for rate limiting");
                Ok(storage)
            }
            Err(e) => {
                error!("Failed to connect to Redis for rate limiting: {}", e);
                Err(format!(
                    "Failed to connect to Redis: {}. Redis is required for rate limiting.",
                    e
                ))
            }
        },
        None => {
            error!("REDIS_URL is not set. Redis is required for the application to run.");
            Err(String::from(
                "REDIS_URL must be set. Redis is required for the application.",
            ))
        }
    }
}

/// Helper function to create rate limiting middleware with different configurations
pub fn create_ip_rate_limiter(
    config: RateLimitConfig,
    storage: RateLimitStorage,
) -> RateLimitMiddleware {
    RateLimitMiddleware::with_shared_storage(config, RateLimitStrategy::ByIp, storage)
}

pub fn create_user_rate_limiter(
    config: RateLimitConfig,
    storage: RateLimitStorage,
) -> RateLimitMiddleware {
    RateLimitMiddleware::with_shared_storage(config, RateLimitStrategy::ByUser, storage)
}

pub fn create_strict_rate_limiter(
    config: RateLimitConfig,
    storage: RateLimitStorage,
) -> RateLimitMiddleware {
    RateLimitMiddleware::with_shared_storage(config, RateLimitStrategy::ByIpAndUser, storage)
}

/// Create device-specific rate limiter for mobile endpoints
pub fn create_mobile_rate_limiter(
    device_limits: DeviceRateLimits,
    storage: RateLimitStorage,
) -> RateLimitMiddleware {
    RateLimitMiddleware::with_device_limits(RateLimitStrategy::ByDevice, storage, device_limits)
        .with_sliding_window()
}

/// Create operation-aware rate limiter
pub fn create_operation_aware_rate_limiter(
    operation_limits: OperationRateLimits,
    storage: RateLimitStorage,
) -> RateLimitMiddleware {
    RateLimitMiddleware::with_operation_limits(
        RateLimitStrategy::ByOperationType,
        storage,
        operation_limits,
    )
}

/// Create device rate limiter
pub fn create_device_rate_limiter(
    config: RateLimitConfig,
    storage: RateLimitStorage,
) -> RateLimitMiddleware {
    RateLimitMiddleware::with_shared_storage(config, RateLimitStrategy::ByDevice, storage)
}

/// Create client rate limiter
pub fn create_client_rate_limiter(
    config: RateLimitConfig,
    storage: RateLimitStorage,
) -> RateLimitMiddleware {
    RateLimitMiddleware::with_shared_storage(config, RateLimitStrategy::ByClient, storage)
}

/// Start a background task for cleaning up expired rate limit entries from memory stores
pub async fn start_memory_store_cleanup_task(
    storage: RateLimitStorage,
    window_duration: Duration,
    cleanup_interval_secs: u64,
) {
    let mut interval = tokio::time::interval(Duration::from_secs(cleanup_interval_secs));
    info!(
        "Starting rate limit memory store cleanup task (interval: {}s)",
        cleanup_interval_secs
    );

    loop {
        interval.tick().await;
        debug!("Cleaning up expired rate limit entries from memory");

        if let RateLimitStorage::Memory {
            ip_storage,
            user_storage,
            device_storage,
            client_storage,
            sliding_window_storage,
        } = &storage
        {
            RateLimitStorage::cleanup_expired_entries_memory(
                ip_storage,
                user_storage,
                device_storage,
                client_storage,
                sliding_window_storage,
                window_duration,
            );
        }

        debug!("Rate limit memory cleanup completed");
    }
}
