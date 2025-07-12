use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::RwLock;
use uuid::Uuid;
use chrono::{DateTime, Utc, Duration};

#[derive(Debug, Clone)]
pub struct TrackedRequest {
    pub request_id: String,
    pub user_id: Uuid,
    pub provider: String,
    pub openai_response_id: Option<String>,
    pub created_at: DateTime<Utc>,
}

#[derive(Clone)]
pub struct RequestTracker {
    requests: Arc<RwLock<HashMap<String, TrackedRequest>>>,
}

impl RequestTracker {
    pub fn new() -> Self {
        Self {
            requests: Arc::new(RwLock::new(HashMap::new())),
        }
    }

    pub async fn track_request(&self, request_id: String, user_id: Uuid, provider: String) {
        let mut requests = self.requests.write().await;
        requests.insert(request_id.clone(), TrackedRequest {
            request_id,
            user_id,
            provider,
            openai_response_id: None,
            created_at: Utc::now(),
        });
    }

    pub async fn update_openai_response_id(&self, request_id: &str, response_id: String) -> Result<(), String> {
        let mut requests = self.requests.write().await;
        if let Some(tracked) = requests.get_mut(request_id) {
            tracked.openai_response_id = Some(response_id);
            Ok(())
        } else {
            Err(format!("Request {} not found in tracker", request_id))
        }
    }

    pub async fn get_request(&self, request_id: &str) -> Option<TrackedRequest> {
        let requests = self.requests.read().await;
        requests.get(request_id).cloned()
    }

    pub async fn remove_request(&self, request_id: &str) -> Option<TrackedRequest> {
        let mut requests = self.requests.write().await;
        requests.remove(request_id)
    }

    pub async fn cleanup_old_requests(&self, max_age_hours: i64) {
        let mut requests = self.requests.write().await;
        let cutoff = Utc::now() - Duration::hours(max_age_hours);
        
        requests.retain(|_, tracked| tracked.created_at > cutoff);
    }

    pub async fn get_active_request_count(&self) -> usize {
        let requests = self.requests.read().await;
        requests.len()
    }
}

impl Default for RequestTracker {
    fn default() -> Self {
        Self::new()
    }
}