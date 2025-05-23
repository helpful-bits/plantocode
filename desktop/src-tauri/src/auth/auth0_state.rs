use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use std::time::Instant;

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

    pub fn store_attempt(&self, pid: String, verifier: String, csrf: String) {
        let mut attempts = self.attempts.lock().unwrap();
        attempts.insert(
            pid,
            Auth0LoginAttempt {
                pkce_verifier: verifier,
                tauri_csrf_token: csrf,
                created_at: Instant::now(),
            },
        );
    }

    pub fn get_attempt(&self, pid: &str) -> Option<(String, String)> {
        let attempts = self.attempts.lock().unwrap();
        if let Some(attempt) = attempts.get(pid) {
            Some((attempt.pkce_verifier.clone(), attempt.tauri_csrf_token.clone()))
        } else {
            None
        }
    }

    pub fn remove_attempt(&self, pid: &str) -> bool {
        let mut attempts = self.attempts.lock().unwrap();
        attempts.remove(pid).is_some()
    }

    pub fn cleanup_old_attempts(&self) {
        let mut attempts = self.attempts.lock().unwrap();
        let now = Instant::now();
        attempts.retain(|_, attempt| {
            now.duration_since(attempt.created_at).as_secs() < 600 // 10 minutes
        });
    }
}

impl Default for Auth0StateStore {
    fn default() -> Self {
        Self::new()
    }
}