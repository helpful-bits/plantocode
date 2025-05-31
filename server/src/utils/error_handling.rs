use crate::error::AppError;
use log::{error, warn, info};
use std::time::Duration;
use std::sync::{MutexGuard, PoisonError};
use tokio::time::sleep;

/// Helper trait to convert PoisonError to AppError
trait PoisonedLockRecovery<T> {
    fn recover_poisoned_lock(self, context: &str) -> Result<T, AppError>;
}

impl<'a, T> PoisonedLockRecovery<MutexGuard<'a, T>> for Result<MutexGuard<'a, T>, PoisonError<MutexGuard<'a, T>>> {
    fn recover_poisoned_lock(self, context: &str) -> Result<MutexGuard<'a, T>, AppError> {
        match self {
            Ok(guard) => Ok(guard),
            Err(poisoned) => {
                warn!("Lock poisoned in {}, recovering with poisoned data", context);
                Ok(poisoned.into_inner())
            }
        }
    }
}

/// Retry configuration for different operation types
#[derive(Debug, Clone)]
pub struct RetryConfig {
    pub max_attempts: u32,
    pub base_delay: Duration,
    pub max_delay: Duration,
    pub backoff_multiplier: f64,
}

impl Default for RetryConfig {
    fn default() -> Self {
        Self {
            max_attempts: 3,
            base_delay: Duration::from_millis(100),
            max_delay: Duration::from_secs(30),
            backoff_multiplier: 2.0,
        }
    }
}

impl RetryConfig {
    pub fn for_database_operations() -> Self {
        Self {
            max_attempts: 5,
            base_delay: Duration::from_millis(50),
            max_delay: Duration::from_secs(5),
            backoff_multiplier: 1.5,
        }
    }

    pub fn for_stripe_api() -> Self {
        Self {
            max_attempts: 3,
            base_delay: Duration::from_millis(500),
            max_delay: Duration::from_secs(10),
            backoff_multiplier: 2.0,
        }
    }

    pub fn for_email_delivery() -> Self {
        Self {
            max_attempts: 3,
            base_delay: Duration::from_secs(1),
            max_delay: Duration::from_secs(60),
            backoff_multiplier: 3.0,
        }
    }
}

/// Execute an operation with exponential backoff retry logic
pub async fn retry_with_backoff<F, Fut, T, E>(
    operation: F,
    config: RetryConfig,
    operation_name: &str,
) -> Result<T, E>
where
    F: Fn() -> Fut,
    Fut: std::future::Future<Output = Result<T, E>>,
    E: std::fmt::Display + std::fmt::Debug,
{
    let mut last_error = None;
    let mut delay = config.base_delay;

    for attempt in 1..=config.max_attempts {
        match operation().await {
            Ok(result) => {
                if attempt > 1 {
                    info!("Operation '{}' succeeded after {} attempts", operation_name, attempt);
                }
                return Ok(result);
            }
            Err(e) => {
                last_error = Some(e);
                
                if attempt < config.max_attempts {
                    warn!(
                        "Operation '{}' failed on attempt {} of {}: {}. Retrying in {:?}",
                        operation_name, attempt, config.max_attempts, 
                        last_error.as_ref().unwrap(), delay
                    );
                    
                    sleep(delay).await;
                    
                    // Exponential backoff with jitter
                    delay = std::cmp::min(
                        Duration::from_millis(
                            (delay.as_millis() as f64 * config.backoff_multiplier) as u64
                        ),
                        config.max_delay,
                    );
                } else {
                    error!(
                        "Operation '{}' failed after {} attempts: {}",
                        operation_name, config.max_attempts, 
                        last_error.as_ref().unwrap()
                    );
                }
            }
        }
    }

    Err(last_error.unwrap())
}

/// Circuit breaker pattern implementation
#[derive(Debug, Clone)]
pub struct CircuitBreaker {
    failure_threshold: u32,
    timeout: Duration,
    current_failures: std::sync::Arc<std::sync::atomic::AtomicU32>,
    last_failure_time: std::sync::Arc<std::sync::Mutex<Option<std::time::Instant>>>,
    state: std::sync::Arc<std::sync::Mutex<CircuitBreakerState>>,
}

#[derive(Debug, Clone, PartialEq)]
pub enum CircuitBreakerState {
    Closed,  // Normal operation
    Open,    // Circuit is open, failing fast
    HalfOpen, // Testing if service is back up
}

impl CircuitBreaker {
    pub fn new(failure_threshold: u32, timeout: Duration) -> Self {
        Self {
            failure_threshold,
            timeout,
            current_failures: std::sync::Arc::new(std::sync::atomic::AtomicU32::new(0)),
            last_failure_time: std::sync::Arc::new(std::sync::Mutex::new(None)),
            state: std::sync::Arc::new(std::sync::Mutex::new(CircuitBreakerState::Closed)),
        }
    }

    pub async fn call<F, Fut, T, E>(&self, operation: F) -> Result<T, CircuitBreakerError<E>>
    where
        F: FnOnce() -> Fut,
        Fut: std::future::Future<Output = Result<T, E>>,
        E: std::fmt::Debug,
    {
        // Check if circuit should transition from Open to HalfOpen
        if let Err(err) = self.check_state_transition() {
            error!("Failed to check circuit breaker state transition: {}", err);
            // Continue with current state
        }

        let current_state = {
            match self.state.lock().recover_poisoned_lock("circuit_breaker_call") {
                Ok(state) => state.clone(),
                Err(err) => {
                    error!("Failed to get circuit breaker state: {}", err);
                    // Default to Open state for safety
                    CircuitBreakerState::Open
                }
            }
        };

        match current_state {
            CircuitBreakerState::Open => {
                return Err(CircuitBreakerError::CircuitOpen);
            }
            CircuitBreakerState::HalfOpen => {
                // Allow one request through to test the service
                match operation().await {
                    Ok(result) => {
                        if let Err(err) = self.on_success() {
                            error!("Failed to record circuit breaker success: {}", err);
                            // Continue anyway since the operation succeeded
                        }
                        Ok(result)
                    }
                    Err(e) => {
                        let _ = self.on_failure().map_err(|err| warn!("Failed to record circuit breaker failure: {}", err));
                        Err(CircuitBreakerError::OperationFailed(e))
                    }
                }
            }
            CircuitBreakerState::Closed => {
                match operation().await {
                    Ok(result) => {
                        if let Err(err) = self.on_success() {
                            error!("Failed to record circuit breaker success: {}", err);
                            // Continue anyway since the operation succeeded
                        }
                        Ok(result)
                    }
                    Err(e) => {
                        let _ = self.on_failure().map_err(|err| warn!("Failed to record circuit breaker failure: {}", err));
                        Err(CircuitBreakerError::OperationFailed(e))
                    }
                }
            }
        }
    }

    fn check_state_transition(&self) -> Result<(), AppError> {
        let mut state = self.state.lock().recover_poisoned_lock("circuit_breaker_state_transition")?;
        if *state == CircuitBreakerState::Open {
            let last_failure = self.last_failure_time.lock().recover_poisoned_lock("circuit_breaker_last_failure")?;
            if let Some(last_failure_time) = *last_failure {
                if last_failure_time.elapsed() >= self.timeout {
                    *state = CircuitBreakerState::HalfOpen;
                    info!("Circuit breaker transitioning to half-open state");
                }
            }
        }
        Ok(())
    }

    fn on_success(&self) -> Result<(), AppError> {
        self.current_failures.store(0, std::sync::atomic::Ordering::Relaxed);
        let mut state = self.state.lock().recover_poisoned_lock("circuit_breaker_on_success")?;
        *state = CircuitBreakerState::Closed;
        Ok(())
    }

    fn on_failure(&self) -> Result<(), AppError> {
        let failures = self.current_failures.fetch_add(1, std::sync::atomic::Ordering::Relaxed) + 1;
        {
            let mut last_failure = self.last_failure_time.lock().recover_poisoned_lock("circuit_breaker_on_failure_time")?;
            *last_failure = Some(std::time::Instant::now());
        }

        if failures >= self.failure_threshold {
            let mut state = self.state.lock().recover_poisoned_lock("circuit_breaker_on_failure_state")?;
            *state = CircuitBreakerState::Open;
            warn!("Circuit breaker opened after {} failures", failures);
        }
        Ok(())
    }

    pub fn get_state(&self) -> Result<CircuitBreakerState, AppError> {
        let state = self.state.lock().recover_poisoned_lock("circuit_breaker_get_state")?;
        Ok(state.clone())
    }
}

#[derive(Debug)]
pub enum CircuitBreakerError<E> {
    CircuitOpen,
    OperationFailed(E),
}

impl<E: std::fmt::Display> std::fmt::Display for CircuitBreakerError<E> {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            CircuitBreakerError::CircuitOpen => write!(f, "Circuit breaker is open"),
            CircuitBreakerError::OperationFailed(e) => write!(f, "Operation failed: {}", e),
        }
    }
}

impl<E: std::error::Error + 'static> std::error::Error for CircuitBreakerError<E> {
    fn source(&self) -> Option<&(dyn std::error::Error + 'static)> {
        match self {
            CircuitBreakerError::CircuitOpen => None,
            CircuitBreakerError::OperationFailed(e) => Some(e),
        }
    }
}

/// Rate limiter to prevent overwhelming external services
#[derive(Debug)]
pub struct RateLimiter {
    tokens: std::sync::Arc<std::sync::Mutex<f64>>,
    capacity: f64,
    refill_rate: f64, // tokens per second
    last_refill: std::sync::Arc<std::sync::Mutex<std::time::Instant>>,
}

impl RateLimiter {
    pub fn new(capacity: f64, refill_rate: f64) -> Self {
        Self {
            tokens: std::sync::Arc::new(std::sync::Mutex::new(capacity)),
            capacity,
            refill_rate,
            last_refill: std::sync::Arc::new(std::sync::Mutex::new(std::time::Instant::now())),
        }
    }

    pub async fn acquire(&self, tokens_needed: f64) -> Result<(), RateLimitError> {
        // Refill tokens based on elapsed time
        self.refill_tokens()?;

        let mut tokens = self.tokens.lock().recover_poisoned_lock("rate_limiter_acquire")?;
        if *tokens >= tokens_needed {
            *tokens -= tokens_needed;
            Ok(())
        } else {
            // Calculate wait time for enough tokens
            let tokens_to_wait_for = tokens_needed - *tokens;
            let wait_time = Duration::from_secs_f64(tokens_to_wait_for / self.refill_rate);
            
            drop(tokens); // Release the lock before sleeping
            
            if wait_time > Duration::from_secs(30) {
                return Err(RateLimitError::WaitTimeTooLong(wait_time));
            }
            
            sleep(wait_time).await;
            Box::pin(self.acquire(tokens_needed)).await
        }
    }

    fn refill_tokens(&self) -> Result<(), AppError> {
        let now = std::time::Instant::now();
        let mut last_refill = self.last_refill.lock().recover_poisoned_lock("rate_limiter_refill_time")?;
        let elapsed = now.duration_since(*last_refill).as_secs_f64();
        
        if elapsed > 0.0 {
            let mut tokens = self.tokens.lock().recover_poisoned_lock("rate_limiter_refill_tokens")?;
            let new_tokens = (*tokens + elapsed * self.refill_rate).min(self.capacity);
            *tokens = new_tokens;
            *last_refill = now;
        }
        Ok(())
    }
}

#[derive(Debug)]
pub enum RateLimitError {
    WaitTimeTooLong(Duration),
    LockError(String),
}

impl std::fmt::Display for RateLimitError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            RateLimitError::WaitTimeTooLong(duration) => {
                write!(f, "Rate limit wait time too long: {:?}", duration)
            }
            RateLimitError::LockError(msg) => {
                write!(f, "Rate limiter lock error: {}", msg)
            }
        }
    }
}

impl std::error::Error for RateLimitError {}

impl From<AppError> for RateLimitError {
    fn from(err: AppError) -> Self {
        RateLimitError::LockError(err.to_string())
    }
}

/// Validation utilities for billing operations
pub fn validate_amount(amount: f64) -> Result<(), AppError> {
    if amount < 0.0 {
        return Err(AppError::InvalidArgument("Amount cannot be negative".to_string()));
    }
    if amount > 1_000_000.0 {
        return Err(AppError::InvalidArgument("Amount exceeds maximum allowed value".to_string()));
    }
    if !amount.is_finite() {
        return Err(AppError::InvalidArgument("Amount must be a finite number".to_string()));
    }
    Ok(())
}

pub fn validate_currency(currency: &str) -> Result<(), AppError> {
    const SUPPORTED_CURRENCIES: &[&str] = &["USD", "EUR", "GBP", "CAD", "AUD"];
    
    if currency.len() != 3 {
        return Err(AppError::InvalidArgument("Currency code must be 3 characters".to_string()));
    }
    
    let currency_upper = currency.to_uppercase();
    if !SUPPORTED_CURRENCIES.contains(&currency_upper.as_str()) {
        return Err(AppError::InvalidArgument(format!("Unsupported currency: {}", currency)));
    }
    
    Ok(())
}

pub fn validate_email(email: &str) -> Result<(), AppError> {
    if email.is_empty() {
        return Err(AppError::InvalidArgument("Email cannot be empty".to_string()));
    }
    
    if !email.contains('@') || !email.contains('.') {
        return Err(AppError::InvalidArgument("Invalid email format".to_string()));
    }
    
    if email.len() > 254 {
        return Err(AppError::InvalidArgument("Email too long".to_string()));
    }
    
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use tokio::test;

    #[test]
    async fn test_retry_with_backoff_success() {
        let mut call_count = 0;
        let operation = || {
            call_count += 1;
            async move {
                if call_count < 3 {
                    Err("temporary failure")
                } else {
                    Ok("success")
                }
            }
        };

        let result = retry_with_backoff(
            operation,
            RetryConfig {
                max_attempts: 5,
                base_delay: Duration::from_millis(1),
                max_delay: Duration::from_millis(10),
                backoff_multiplier: 2.0,
            },
            "test_operation",
        ).await;

        assert_eq!(result.unwrap(), "success");
        assert_eq!(call_count, 3);
    }

    #[test]
    async fn test_circuit_breaker() {
        let circuit_breaker = CircuitBreaker::new(2, Duration::from_millis(100));
        
        // First failure
        let result = circuit_breaker.call(|| async { 
            Err::<(), &str>("failure") 
        }).await;
        assert!(matches!(result, Err(CircuitBreakerError::OperationFailed(_))));
        assert_eq!(circuit_breaker.get_state().unwrap(), CircuitBreakerState::Closed);

        // Second failure - should open circuit
        let result = circuit_breaker.call(|| async { 
            Err::<(), &str>("failure") 
        }).await;
        assert!(matches!(result, Err(CircuitBreakerError::OperationFailed(_))));
        assert_eq!(circuit_breaker.get_state().unwrap(), CircuitBreakerState::Open);

        // Should fail fast now
        let result = circuit_breaker.call(|| async { 
            Ok::<(), &str>(())
        }).await;
        assert!(matches!(result, Err(CircuitBreakerError::CircuitOpen)));
    }

    #[test]
    fn test_validation_functions() {
        // Test amount validation
        assert!(validate_amount(100.0).is_ok());
        assert!(validate_amount(-1.0).is_err());
        assert!(validate_amount(f64::INFINITY).is_err());

        // Test currency validation
        assert!(validate_currency("USD").is_ok());
        assert!(validate_currency("usd").is_ok());
        assert!(validate_currency("INVALID").is_err());
        assert!(validate_currency("US").is_err());

        // Test email validation
        assert!(validate_email("test@example.com").is_ok());
        assert!(validate_email("invalid").is_err());
        assert!(validate_email("").is_err());
    }
}