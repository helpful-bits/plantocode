use std::collections::HashMap;
use std::sync::{Arc, Mutex, MutexGuard, PoisonError};
use std::time::{Duration, Instant};

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

impl<T> From<PoisonError<T>> for AuthError {
    fn from(err: PoisonError<T>) -> Self {
        AuthError::LockPoisoned(err.to_string())
    }
}

#[derive(Debug, Clone)]
pub struct Auth0LoginAttempt {
    pub pkce_verifier: String,
    pub tauri_csrf_token: String,
    pub created_at: Instant,
}

#[derive(Debug, Clone)]
pub struct Auth0StateStore {
    attempts: Arc<Mutex<HashMap<String, Auth0LoginAttempt>>>,
}

impl Auth0StateStore {
    pub fn new() -> Self {
        Self {
            attempts: Arc::new(Mutex::new(HashMap::new())),
        }
    }

    fn get_auth_attempts(&self) -> Result<MutexGuard<HashMap<String, Auth0LoginAttempt>>, AuthError> {
        self.attempts.lock().map_err(AuthError::from)
    }

    fn get_auth_attempts_mut(&self) -> Result<MutexGuard<HashMap<String, Auth0LoginAttempt>>, AuthError> {
        self.attempts.lock().map_err(AuthError::from)
    }

    pub fn store_attempt(&self, pid: String, verifier: String, csrf: String) -> Result<(), AuthError> {
        let mut attempts = self.get_auth_attempts_mut()?;
        attempts.insert(
            pid,
            Auth0LoginAttempt {
                pkce_verifier: verifier,
                tauri_csrf_token: csrf,
                created_at: Instant::now(),
            },
        );
        Ok(())
    }

    pub fn get_attempt(&self, pid: &str) -> Result<Option<(String, String)>, AuthError> {
        let attempts = self.get_auth_attempts()?;
        if let Some(attempt) = attempts.get(pid) {
            Ok(Some((attempt.pkce_verifier.clone(), attempt.tauri_csrf_token.clone())))
        } else {
            Ok(None)
        }
    }

    pub fn remove_attempt(&self, pid: &str) -> Result<bool, AuthError> {
        let mut attempts = self.get_auth_attempts_mut()?;
        Ok(attempts.remove(pid).is_some())
    }

    pub fn cleanup_old_attempts(&self) -> Result<(), AuthError> {
        let mut attempts = self.get_auth_attempts_mut()?;
        let now = Instant::now();
        attempts.retain(|_, attempt| {
            now.duration_since(attempt.created_at).as_secs() < 600 // 10 minutes
        });
        Ok(())
    }
}

impl Default for Auth0StateStore {
    fn default() -> Self {
        Self::new()
    }
}