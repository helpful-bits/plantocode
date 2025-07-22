use chrono::{DateTime, Duration, Utc};
use dashmap::DashMap;
use std::sync::Arc;

#[derive(Debug)]
pub enum AuthError {
    LockPoisoned(String),
    LockTimeout,
}

impl std::fmt::Display for AuthError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            AuthError::LockPoisoned(msg) => write!(f, "Auth lock poisoned: {}", msg),
            AuthError::LockTimeout => write!(f, "Auth lock timeout"),
        }
    }
}

impl std::error::Error for AuthError {}

#[derive(Debug, Clone)]
pub struct Auth0LoginAttempt {
    pub pkce_verifier: String,
    pub tauri_csrf_token: String,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Clone)]
pub struct Auth0StateStore {
    attempts: Arc<DashMap<String, Auth0LoginAttempt>>,
}

impl Auth0StateStore {
    pub fn new() -> Self {
        Self {
            attempts: Arc::new(DashMap::new()),
        }
    }

    pub fn store_attempt(
        &self,
        pid: String,
        verifier: String,
        csrf: String,
    ) -> Result<(), AuthError> {
        self.attempts.insert(
            pid,
            Auth0LoginAttempt {
                pkce_verifier: verifier,
                tauri_csrf_token: csrf,
                created_at: Utc::now(),
            },
        );
        Ok(())
    }

    pub fn get_attempt(&self, pid: &str) -> Result<Option<(String, String)>, AuthError> {
        if let Some(attempt) = self.attempts.get(pid) {
            Ok(Some((
                attempt.pkce_verifier.clone(),
                attempt.tauri_csrf_token.clone(),
            )))
        } else {
            Ok(None)
        }
    }

    pub fn remove_attempt(&self, pid: &str) -> Result<bool, AuthError> {
        Ok(self.attempts.remove(pid).is_some())
    }
}

impl Default for Auth0StateStore {
    fn default() -> Self {
        Self::new()
    }
}

/// Standalone function to cleanup old attempts from the store
pub fn cleanup_old_attempts(store: &Auth0StateStore) -> Result<(), AuthError> {
    let now = Utc::now();
    let cutoff_duration = Duration::try_minutes(10).unwrap_or(Duration::zero());

    store
        .attempts
        .retain(|_, attempt| now.signed_duration_since(attempt.created_at) < cutoff_duration);

    Ok(())
}
