use chrono::{DateTime, Duration, Utc};
use dashmap::DashMap;
use std::sync::Arc;
use tracing::{info, warn};
use uuid::Uuid;

/// Represents a relay session for device WebSocket connections
#[derive(Debug, Clone)]
pub struct RelaySession {
    pub user_id: Uuid,
    pub device_id: String,
    pub resume_token: String,
    pub created_at: DateTime<Utc>,
    pub last_seen: DateTime<Utc>,
    pub expires_at: DateTime<Utc>,
}

/// Thread-safe store for managing relay sessions with TTL and automatic cleanup
#[derive(Clone)]
pub struct RelaySessionStore {
    sessions: Arc<DashMap<String, RelaySession>>,
    ttl: Duration,
    cleanup_interval: Duration,
}

impl RelaySessionStore {
    /// Create a new RelaySessionStore with specified TTL and cleanup interval
    pub fn new(ttl: Duration, cleanup_interval: Duration) -> Self {
        Self {
            sessions: Arc::new(DashMap::new()),
            ttl,
            cleanup_interval,
        }
    }

    /// Create a new session for a device connection
    /// Returns (session_id, resume_token, expires_at)
    pub fn create_session(
        &self,
        user_id: &Uuid,
        device_id: &str,
    ) -> (String, String, DateTime<Utc>) {
        let normalized_device_id = device_id.to_lowercase();
        let session_id = generate_session_id();
        let resume_token = generate_resume_token();
        let now = Utc::now();
        let expires_at = now + self.ttl;

        let session = RelaySession {
            user_id: *user_id,
            device_id: normalized_device_id.clone(),
            resume_token: resume_token.clone(),
            created_at: now,
            last_seen: now,
            expires_at,
        };

        self.sessions.insert(session_id.clone(), session);

        info!(
            user_id = %user_id,
            device_id = %normalized_device_id,
            session_id = %session_id,
            expires_at = %expires_at,
            "relay_session_created"
        );

        (session_id, resume_token, expires_at)
    }

    /// Touch a session to update its last_seen timestamp and extend TTL
    pub fn touch(&self, session_id: &str) {
        if let Some(mut entry) = self.sessions.get_mut(session_id) {
            let now = Utc::now();
            entry.last_seen = now;
            entry.expires_at = now + self.ttl;
        }
    }

    /// Validate a resume attempt and return the session if valid
    pub fn validate_resume(
        &self,
        user_id: &Uuid,
        device_id: &str,
        session_id: &str,
        resume_token: &str,
    ) -> Option<DateTime<Utc>> {
        let normalized_device_id = device_id.to_lowercase();
        if let Some(session) = self.sessions.get(session_id) {
            let now = Utc::now();

            // Check if session is expired
            if session.expires_at < now {
                warn!(
                    user_id = %user_id,
                    device_id = %device_id,
                    session_id = %session_id,
                    "relay_resume_failed_expired"
                );
                return None;
            }

            // Validate user_id, device_id, and resume_token
            if session.user_id == *user_id
                && session.device_id == normalized_device_id
                && session.resume_token == resume_token
            {
                info!(
                    user_id = %user_id,
                    device_id = %normalized_device_id,
                    session_id = %session_id,
                    "relay_resume_validated"
                );
                return Some(session.expires_at);
            }

            warn!(
                user_id = %user_id,
                device_id = %normalized_device_id,
                session_id = %session_id,
                "relay_resume_failed_mismatch"
            );
        } else {
            warn!(
                user_id = %user_id,
                device_id = %normalized_device_id,
                session_id = %session_id,
                "relay_resume_failed_not_found"
            );
        }

        None
    }

    /// Invalidate a specific session
    pub fn invalidate_session(&self, session_id: &str) {
        if let Some((_, session)) = self.sessions.remove(session_id) {
            info!(
                user_id = %session.user_id,
                device_id = %session.device_id,
                session_id = %session_id,
                "relay_session_invalidated"
            );
        }
    }

    /// Invalidate all sessions for a specific user
    /// Returns the count of invalidated sessions
    pub fn invalidate_user_sessions(&self, user_id: &Uuid) -> usize {
        let mut removed_count = 0;

        self.sessions.retain(|session_id, session| {
            if session.user_id == *user_id {
                info!(
                    user_id = %user_id,
                    device_id = %session.device_id,
                    session_id = %session_id,
                    "relay_session_invalidated_by_user_logout"
                );
                removed_count += 1;
                false // Remove this session
            } else {
                true // Keep this session
            }
        });

        removed_count
    }

    /// Start background cleanup task to remove expired sessions
    /// Returns a JoinHandle that can be used to cancel the task
    pub fn start_cleanup_task(self) -> tokio::task::JoinHandle<()> {
        tokio::spawn(async move {
            let mut interval = tokio::time::interval(self.cleanup_interval.to_std().unwrap());

            loop {
                interval.tick().await;

                let now = Utc::now();
                let mut expired_count = 0;

                self.sessions.retain(|session_id, session| {
                    if session.expires_at < now {
                        info!(
                            user_id = %session.user_id,
                            device_id = %session.device_id,
                            session_id = %session_id,
                            expired_at = %session.expires_at,
                            "relay_session_expired_and_removed"
                        );
                        expired_count += 1;
                        false // Remove expired session
                    } else {
                        true // Keep active session
                    }
                });

                if expired_count > 0 {
                    info!(
                        expired_count = expired_count,
                        active_sessions = self.sessions.len(),
                        "relay_session_cleanup_completed"
                    );
                }
            }
        })
    }
}

/// Generate a 32-character alphanumeric session ID
fn generate_session_id() -> String {
    use rand::Rng;
    const CHARSET: &[u8] = b"abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    let mut rng = rand::thread_rng();

    (0..32)
        .map(|_| {
            let idx = rng.gen_range(0..CHARSET.len());
            CHARSET[idx] as char
        })
        .collect()
}

/// Generate a 48-character alphanumeric resume token
fn generate_resume_token() -> String {
    use rand::Rng;
    const CHARSET: &[u8] = b"abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    let mut rng = rand::thread_rng();

    (0..48)
        .map(|_| {
            let idx = rng.gen_range(0..CHARSET.len());
            CHARSET[idx] as char
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_session_id_generation() {
        let session_id = generate_session_id();
        assert_eq!(session_id.len(), 32);
        assert!(session_id.chars().all(|c| c.is_alphanumeric()));
    }

    #[test]
    fn test_resume_token_generation() {
        let token = generate_resume_token();
        assert_eq!(token.len(), 48);
        assert!(token.chars().all(|c| c.is_alphanumeric()));
    }

    #[test]
    fn test_create_and_validate_session() {
        let store = RelaySessionStore::new(Duration::hours(1), Duration::minutes(5));
        let user_id = Uuid::new_v4();
        let device_id = "test-device";

        let (session_id, resume_token, expires_at) = store.create_session(&user_id, device_id);

        // Valid resume should succeed
        let validated_expires =
            store.validate_resume(&user_id, device_id, &session_id, &resume_token);
        assert!(validated_expires.is_some());
        assert_eq!(validated_expires.unwrap(), expires_at);

        // Invalid resume token should fail
        let invalid_resume = store.validate_resume(&user_id, device_id, &session_id, "invalid");
        assert!(invalid_resume.is_none());

        // Invalid user should fail
        let other_user = Uuid::new_v4();
        let invalid_user =
            store.validate_resume(&other_user, device_id, &session_id, &resume_token);
        assert!(invalid_user.is_none());
    }

    #[test]
    fn test_touch_session() {
        let store = RelaySessionStore::new(Duration::seconds(2), Duration::minutes(5));
        let user_id = Uuid::new_v4();
        let device_id = "test-device";

        let (session_id, _, original_expires) = store.create_session(&user_id, device_id);

        std::thread::sleep(std::time::Duration::from_millis(100));

        store.touch(&session_id);

        if let Some(session) = store.sessions.get(&session_id) {
            assert!(session.expires_at > original_expires);
        } else {
            panic!("Session not found after touch");
        }
    }

    #[test]
    fn test_invalidate_session() {
        let store = RelaySessionStore::new(Duration::hours(1), Duration::minutes(5));
        let user_id = Uuid::new_v4();
        let device_id = "test-device";

        let (session_id, _, _) = store.create_session(&user_id, device_id);
        assert!(store.sessions.contains_key(&session_id));

        store.invalidate_session(&session_id);
        assert!(!store.sessions.contains_key(&session_id));
    }

    #[test]
    fn test_invalidate_user_sessions() {
        let store = RelaySessionStore::new(Duration::hours(1), Duration::minutes(5));
        let user_id = Uuid::new_v4();
        let other_user_id = Uuid::new_v4();

        // Create multiple sessions for the same user
        let (session_id_1, _, _) = store.create_session(&user_id, "device-1");
        let (session_id_2, _, _) = store.create_session(&user_id, "device-2");
        let (session_id_3, _, _) = store.create_session(&other_user_id, "device-3");

        assert_eq!(store.sessions.len(), 3);

        let removed = store.invalidate_user_sessions(&user_id);
        assert_eq!(removed, 2);
        assert_eq!(store.sessions.len(), 1);
        assert!(!store.sessions.contains_key(&session_id_1));
        assert!(!store.sessions.contains_key(&session_id_2));
        assert!(store.sessions.contains_key(&session_id_3));
    }
}
