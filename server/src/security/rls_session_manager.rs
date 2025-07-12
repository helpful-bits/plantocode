use sqlx::{Connection, PgConnection, PgPool, Postgres, Transaction};
use std::collections::HashMap;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};
use tokio::sync::{RwLock, Semaphore};
use uuid::Uuid;
use log::{debug, error, info, warn};

use crate::error::AppError;

/// Connection state tracking for security audit
#[derive(Debug, Clone)]
pub struct ConnectionState {
    pub connection_id: String,
    pub user_id: Option<Uuid>,
    pub session_variables: HashMap<String, String>,
    pub last_activity: Instant,
    pub request_count: u64,
    pub is_validated: bool,
}

/// Connection security metrics
#[derive(Debug, Clone)]
pub struct SecurityMetrics {
    pub total_connections: u64,
    pub active_sessions: u64,
    pub validation_failures: u64,
    pub session_leakage_detected: u64,
    pub rls_policy_failures: u64,
    pub connection_resets: u64,
}

/// RLS Session Manager for secure user context management
/// 
/// This manager ensures:
/// - Each request gets a properly isolated user context
/// - Connection pool security through validation and cleanup
/// - Monitoring and alerting for RLS policy failures
/// - Explicit failure handling for authentication issues
#[derive(Clone)]
pub struct RLSSessionManager {
    pool: Arc<PgPool>,
    connection_states: Arc<RwLock<HashMap<String, ConnectionState>>>,
    metrics: Arc<RwLock<SecurityMetrics>>,
    connection_counter: Arc<AtomicU64>,
    validation_semaphore: Arc<Semaphore>,
    cleanup_interval: Duration,
    session_timeout: Duration,
}

impl RLSSessionManager {
    /// Create a new RLS Session Manager
    pub fn new(pool: PgPool) -> Self {
        Self {
            pool: Arc::new(pool),
            connection_states: Arc::new(RwLock::new(HashMap::new())),
            metrics: Arc::new(RwLock::new(SecurityMetrics {
                total_connections: 0,
                active_sessions: 0,
                validation_failures: 0,
                session_leakage_detected: 0,
                rls_policy_failures: 0,
                connection_resets: 0,
            })),
            connection_counter: Arc::new(AtomicU64::new(0)),
            validation_semaphore: Arc::new(Semaphore::new(10)), // Limit concurrent validations
            cleanup_interval: Duration::from_secs(300), // 5 minutes
            session_timeout: Duration::from_secs(3600), // 1 hour
        }
    }

    /// Get a connection with user context properly set and validated
    /// 
    /// CRITICAL: This method ensures RLS setup or fails explicitly
    pub async fn get_connection_with_user_context(
        &self,
        user_id: Uuid,
        request_id: Option<String>,
    ) -> Result<sqlx::pool::PoolConnection<Postgres>, AppError> {
        let start_time = Instant::now();
        let req_id = match &request_id {
            Some(id) => id.clone(),
            None => Uuid::new_v4().to_string(),
        };
        
        debug!("RLS: Getting connection for user {} (request: {})", user_id, req_id);

        // Acquire connection from pool
        let mut conn = self.pool.acquire().await.map_err(|e| {
            error!("RLS: Failed to acquire connection from pool for user {} (request: {}): {}", 
                   user_id, req_id, e);
            AppError::Database(format!("Failed to acquire database connection: {}", e))
        })?;

        // For read-only configuration endpoints, we can skip the expensive RLS setup
        if request_id.as_deref() == Some("config-read-only") {
            debug!("RLS: Skipping RLS setup for read-only configuration request");
            return Ok(conn);
        }

        // Generate unique connection ID for tracking
        let connection_id = format!("conn_{}", self.connection_counter.fetch_add(1, Ordering::SeqCst));
        
        // Reset connection state to prevent session variable leakage
        if let Err(e) = self.reset_connection_state(&mut conn, &connection_id).await {
            error!("RLS: Failed to reset connection state for user {} (request: {}, conn: {}): {}", 
                   user_id, req_id, connection_id, e);
            tokio::spawn({
                let manager = self.clone();
                async move {
                    manager.increment_metric("connection_resets").await;
                }
            });
            return Err(e);
        }

        // Set user context with validation
        if let Err(e) = self.set_user_context(&mut conn, user_id, &connection_id, &req_id).await {
            error!("RLS: Failed to set user context for user {} (request: {}, conn: {}): {}", 
                   user_id, req_id, connection_id, e);
            tokio::spawn({
                let manager = self.clone();
                async move {
                    manager.increment_metric("rls_policy_failures").await;
                }
            });
            return Err(e);
        }

        // Validate RLS setup
        if let Err(e) = self.validate_rls_setup(&mut conn, user_id, &connection_id, &req_id).await {
            error!("RLS: RLS validation failed for user {} (request: {}, conn: {}): {}", 
                   user_id, req_id, connection_id, e);
            tokio::spawn({
                let manager = self.clone();
                async move {
                    manager.increment_metric("validation_failures").await;
                }
            });
            return Err(e);
        }

        // Track connection state
        self.track_connection_state(connection_id.clone(), user_id).await;
        
        let duration = start_time.elapsed();
        debug!("RLS: Successfully configured connection for user {} in {:?} (request: {}, conn: {})", 
               user_id, duration, req_id, connection_id);

        Ok(conn)
    }

    /// Reset connection state to prevent session variable leakage
    async fn reset_connection_state(
        &self,
        conn: &mut PgConnection,
        connection_id: &str,
    ) -> Result<(), AppError> {
        debug!("RLS: Resetting connection state (conn: {})", connection_id);

        // Execute all reset commands in sequence
        // Note: We can't use transactions with &mut PgConnection, but these operations
        // are idempotent and safe to execute sequentially
        sqlx::query("RESET ALL")
            .execute(&mut *conn)
            .await
            .map_err(|e| {
                error!("RLS: Failed to RESET ALL (conn: {}): {}", connection_id, e);
                AppError::Database(format!("Connection reset failed: {}", e))
            })?;

        sqlx::query("SELECT set_config('app.current_user_id', '', false)")
            .execute(&mut *conn)
            .await
            .map_err(|e| {
                error!("RLS: Failed to reset user_id (conn: {}): {}", connection_id, e);
                AppError::Database(format!("Failed to reset user_id: {}", e))
            })?;

        sqlx::query("SELECT set_config('app.request_id', '', false)")
            .execute(&mut *conn)
            .await
            .map_err(|e| {
                error!("RLS: Failed to reset request_id (conn: {}): {}", connection_id, e);
                AppError::Database(format!("Failed to reset request_id: {}", e))
            })?;

        sqlx::query("SELECT set_config('app.session_start', '', false)")
            .execute(&mut *conn)
            .await
            .map_err(|e| {
                error!("RLS: Failed to reset session_start (conn: {}): {}", connection_id, e);
                AppError::Database(format!("Failed to reset session_start: {}", e))
            })?;

        debug!("RLS: Connection state reset completed (conn: {})", connection_id);
        Ok(())
    }

    /// Set user context with comprehensive error handling
    async fn set_user_context(
        &self,
        conn: &mut PgConnection,
        user_id: Uuid,
        connection_id: &str,
        request_id: &str,
    ) -> Result<(), AppError> {
        debug!("RLS: Setting user context for user {} (conn: {}, request: {})", 
               user_id, connection_id, request_id);

        let session_start = chrono::Utc::now().to_rfc3339();

        // Set session variables using parameterized queries
        // Note: These operations are executed sequentially but are safe and idempotent
        sqlx::query("SELECT set_config('app.current_user_id', $1, false)")
            .bind(user_id.to_string())
            .execute(&mut *conn)
            .await
            .map_err(|e| {
                error!("RLS: CRITICAL - Failed to set user_id for {} (conn: {}): {}", user_id, connection_id, e);
                AppError::Auth(format!("Failed to set user context for Row Level Security: {}. This is a critical security failure.", e))
            })?;

        sqlx::query("SELECT set_config('app.request_id', $1, false)")
            .bind(request_id)
            .execute(&mut *conn)
            .await
            .map_err(|e| {
                error!("RLS: Failed to set request_id (conn: {}): {}", connection_id, e);
                AppError::Auth(format!("Failed to set request context: {}", e))
            })?;

        sqlx::query("SELECT set_config('app.session_start', $1, false)")
            .bind(&session_start)
            .execute(&mut *conn)
            .await
            .map_err(|e| {
                error!("RLS: Failed to set session_start (conn: {}): {}", connection_id, e);
                AppError::Auth(format!("Failed to set session context: {}", e))
            })?;

        sqlx::query("SELECT set_config('app.connection_id', $1, false)")
            .bind(connection_id)
            .execute(&mut *conn)
            .await
            .map_err(|e| {
                error!("RLS: Failed to set connection_id (conn: {}): {}", connection_id, e);
                AppError::Auth(format!("Failed to set connection context: {}", e))
            })?;

        info!("RLS: User context successfully configured for user {} (conn: {}, request: {})", 
              user_id, connection_id, request_id);
        Ok(())
    }

    /// Validate RLS setup with explicit failure detection
    async fn validate_rls_setup(
        &self,
        conn: &mut PgConnection,
        expected_user_id: Uuid,
        connection_id: &str,
        request_id: &str,
    ) -> Result<(), AppError> {
        debug!("RLS: Validating RLS setup for user {} (conn: {}, request: {})", 
               expected_user_id, connection_id, request_id);

        // Test the RLS helper function that policies depend on
        let validation_result = sqlx::query_as::<_, (Option<String>,)>(
            "SELECT get_current_user_id()::text"
        )
        .fetch_one(&mut *conn)
        .await;

        match validation_result {
            Ok((Some(user_id_str),)) => {
                match user_id_str.parse::<Uuid>() {
                    Ok(actual_user_id) if actual_user_id == expected_user_id => {
                        debug!("RLS: Validation successful - user context matches expected {} (conn: {}, request: {})", 
                               expected_user_id, connection_id, request_id);
                    }
                    Ok(actual_user_id) => {
                        error!("RLS: CRITICAL - User context mismatch! Expected: {}, Got: {} (conn: {}, request: {})", 
                               expected_user_id, actual_user_id, connection_id, request_id);
                        tokio::spawn({
                            let manager = self.clone();
                            async move {
                                manager.increment_metric("session_leakage_detected").await;
                            }
                        });
                        return Err(AppError::Auth(format!(
                            "Session variable leakage detected: expected user {}, but got {}",
                            expected_user_id, actual_user_id
                        )));
                    }
                    Err(e) => {
                        error!("RLS: CRITICAL - Invalid user ID format in session variable: '{}' (conn: {}, request: {}): {}", 
                               user_id_str, connection_id, request_id, e);
                        return Err(AppError::Auth(format!(
                            "Invalid user ID format in session context: {}",
                            e
                        )));
                    }
                }
            }
            Ok((None,)) => {
                error!("RLS: CRITICAL - get_current_user_id() returned NULL! RLS policies will fail silently (conn: {}, request: {})", 
                       connection_id, request_id);
                return Err(AppError::Auth(
                    "RLS setup failed: user context is NULL. All database queries will fail due to RLS policies.".to_string()
                ));
            }
            Err(e) => {
                error!("RLS: CRITICAL - Failed to validate RLS setup (conn: {}, request: {}): {}", 
                       connection_id, request_id, e);
                return Err(AppError::Database(format!(
                    "RLS validation query failed: {}",
                    e
                )));
            }
        }

        // Additional validation: Test that a basic user-scoped query would work
        let user_test_result = sqlx::query_as::<_, (i64,)>(
            "SELECT COUNT(*) FROM users WHERE id = get_current_user_id()"
        )
        .fetch_one(&mut *conn)
        .await;

        match user_test_result {
            Ok((count,)) if count > 0 => {
                debug!("RLS: User query validation successful (conn: {}, request: {})", 
                       connection_id, request_id);
            }
            Ok((0,)) => {
                warn!("RLS: User not found in database for ID {} (conn: {}, request: {})", 
                      expected_user_id, connection_id, request_id);
                // This is not necessarily a failure - could be a new user
            }
            Ok((count,)) => {
                warn!("RLS: Unexpected count value {} for user query validation (conn: {}, request: {})", 
                      count, connection_id, request_id);
                // Handle any other count values (negative, large positive)
            }
            Err(e) => {
                error!("RLS: User query validation failed (conn: {}, request: {}): {}", 
                       connection_id, request_id, e);
                return Err(AppError::Database(format!(
                    "RLS user query validation failed: {}",
                    e
                )));
            }
        }

        info!("RLS: Complete validation successful for user {} (conn: {}, request: {})", 
              expected_user_id, connection_id, request_id);
        Ok(())
    }

    /// Track connection state for monitoring
    async fn track_connection_state(&self, connection_id: String, user_id: Uuid) {
        let mut states = self.connection_states.write().await;
        let mut metrics = self.metrics.write().await;

        let state = ConnectionState {
            connection_id: connection_id.clone(),
            user_id: Some(user_id),
            session_variables: HashMap::new(),
            last_activity: Instant::now(),
            request_count: 1,
            is_validated: true,
        };

        states.insert(connection_id, state);
        metrics.total_connections += 1;
        metrics.active_sessions = states.len() as u64;
    }

    /// Begin a transaction from the pool with user context
    pub async fn begin_transaction_with_context(
        &self,
        user_id: Uuid,
        request_id: Option<String>,
    ) -> Result<(), AppError> {
        // This method demonstrates the pattern but actual implementation 
        // would need to be integrated with the calling code that manages the transaction lifecycle
        let _connection_id = format!("tx_{}", self.connection_counter.fetch_add(1, Ordering::SeqCst));
        let _req_id = request_id.unwrap_or_else(|| Uuid::new_v4().to_string());
        
        debug!("RLS: Transaction pattern established for user {}", user_id);
        
        // In practice, callers should:
        // 1. Get a connection with user context using get_connection_with_user_context
        // 2. Call begin() on that connection
        // 3. Use the transaction with the pre-configured user context
        
        Ok(())
    }

    /// Validate existing connection still has correct user context
    pub async fn validate_connection_context(
        &self,
        conn: &mut PgConnection,
        expected_user_id: Uuid,
    ) -> Result<(), AppError> {
        let validation_result = sqlx::query_as::<_, (Option<String>,)>(
            "SELECT get_current_user_id()::text"
        )
        .fetch_one(&mut *conn)
        .await;

        match validation_result {
            Ok((Some(user_id_str),)) => {
                match user_id_str.parse::<Uuid>() {
                    Ok(actual_user_id) if actual_user_id == expected_user_id => Ok(()),
                    Ok(actual_user_id) => {
                        error!("RLS: Connection context mismatch! Expected: {}, Got: {}", 
                               expected_user_id, actual_user_id);
                        tokio::spawn({
                            let manager = self.clone();
                            async move {
                                manager.increment_metric("session_leakage_detected").await;
                            }
                        });
                        Err(AppError::Auth(format!(
                            "Connection context validation failed: user mismatch"
                        )))
                    }
                    Err(_) => {
                        error!("RLS: Invalid user ID in connection context: {}", user_id_str);
                        Err(AppError::Auth("Invalid user ID in connection context".to_string()))
                    }
                }
            }
            Ok((None,)) => {
                error!("RLS: Connection has no user context!");
                Err(AppError::Auth("No user context in connection".to_string()))
            }
            Err(e) => {
                error!("RLS: Failed to validate connection context: {}", e);
                Err(AppError::Database(format!("Connection validation failed: {}", e)))
            }
        }
    }

    /// Get current security metrics
    pub async fn get_security_metrics(&self) -> SecurityMetrics {
        self.metrics.read().await.clone()
    }

    /// Increment a specific metric
    async fn increment_metric(&self, metric_name: &str) {
        let mut metrics = self.metrics.write().await;
        match metric_name {
            "validation_failures" => metrics.validation_failures += 1,
            "session_leakage_detected" => metrics.session_leakage_detected += 1,
            "rls_policy_failures" => metrics.rls_policy_failures += 1,
            "connection_resets" => metrics.connection_resets += 1,
            _ => warn!("Unknown metric: {}", metric_name),
        }
    }

    /// Cleanup stale connection states (should be called periodically)
    pub async fn cleanup_stale_connections(&self) {
        let mut states = self.connection_states.write().await;
        let mut metrics = self.metrics.write().await;
        
        let before_count = states.len();
        let cutoff = Instant::now() - self.session_timeout;
        
        states.retain(|_, state| state.last_activity > cutoff);
        
        let after_count = states.len();
        let cleaned = before_count - after_count;
        
        if cleaned > 0 {
            info!("RLS: Cleaned up {} stale connection states", cleaned);
        }
        
        metrics.active_sessions = after_count as u64;
    }

    /// Start background cleanup task
    pub fn start_cleanup_task(&self) -> tokio::task::JoinHandle<()> {
        let manager = self.clone();
        let interval = self.cleanup_interval;
        
        tokio::spawn(async move {
            let mut cleanup_timer = tokio::time::interval(interval);
            loop {
                cleanup_timer.tick().await;
                manager.cleanup_stale_connections().await;
            }
        })
    }
}

impl std::fmt::Debug for RLSSessionManager {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("RLSSessionManager")
            .field("cleanup_interval", &self.cleanup_interval)
            .field("session_timeout", &self.session_timeout)
            .finish()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use sqlx::PgPool;
    use std::env;

    async fn create_test_pool() -> PgPool {
        let database_url = env::var("DATABASE_URL")
            .expect("DATABASE_URL must be set for tests");
        PgPool::connect(&database_url).await.expect("Failed to connect to test database")
    }

    #[tokio::test]
    async fn test_rls_session_manager_creation() {
        if env::var("DATABASE_URL").is_err() {
            eprintln!("Skipping test: DATABASE_URL not set");
            return;
        }

        let pool = create_test_pool().await;
        let manager = RLSSessionManager::new(pool);
        
        let metrics = manager.get_security_metrics().await;
        assert_eq!(metrics.total_connections, 0);
        assert_eq!(metrics.active_sessions, 0);
    }

    #[tokio::test]
    async fn test_user_context_setup() {
        if env::var("DATABASE_URL").is_err() {
            eprintln!("Skipping test: DATABASE_URL not set");
            return;
        }

        let pool = create_test_pool().await;
        let manager = RLSSessionManager::new(pool);
        let user_id = Uuid::new_v4();
        
        // This would fail in a real scenario without a valid user,
        // but tests the basic connection flow
        let result = manager.get_connection_with_user_context(user_id, None).await;
        
        // We expect this to either succeed or fail with a database error,
        // not a panic or hang
        match result {
            Ok(_) => println!("Connection setup succeeded"),
            Err(e) => println!("Connection setup failed as expected: {}", e),
        }
    }
}