use chrono::{DateTime, Duration, Utc};
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::RwLock;
use tokio_util::sync::CancellationToken;
use uuid::Uuid;

#[derive(Debug, Clone)]
pub struct TrackedRequest {
    pub request_id: String,
    pub user_id: Uuid,
    pub provider: String,
    pub openai_response_id: Option<String>,
    pub created_at: DateTime<Utc>,
    pub is_streaming: bool,
    pub cancellation_token: Option<CancellationToken>,
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

    pub async fn track_request(
        &self,
        request_id: String,
        user_id: Uuid,
        provider: String,
        is_streaming: bool,
    ) {
        let mut requests = self.requests.write().await;
        requests.insert(
            request_id.clone(),
            TrackedRequest {
                request_id,
                user_id,
                provider,
                openai_response_id: None,
                created_at: Utc::now(),
                is_streaming,
                cancellation_token: None,
            },
        );
    }

    pub async fn track_request_with_cancellation(
        &self,
        request_id: String,
        user_id: Uuid,
        provider: String,
        is_streaming: bool,
        cancellation_token: CancellationToken,
    ) {
        let mut requests = self.requests.write().await;
        requests.insert(
            request_id.clone(),
            TrackedRequest {
                request_id,
                user_id,
                provider,
                openai_response_id: None,
                created_at: Utc::now(),
                is_streaming,
                cancellation_token: Some(cancellation_token),
            },
        );
    }

    pub async fn update_openai_response_id(
        &self,
        request_id: &str,
        response_id: String,
    ) -> Result<(), String> {
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

    pub async fn cancel_request(&self, request_id: &str) -> Result<bool, String> {
        let requests = self.requests.read().await;
        if let Some(tracked) = requests.get(request_id) {
            if let Some(cancellation_token) = &tracked.cancellation_token {
                cancellation_token.cancel();
                Ok(true) // Successfully cancelled
            } else {
                Ok(false) // No cancellation token (non-streaming or older request)
            }
        } else {
            Err(format!("Request {} not found in tracker", request_id))
        }
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

    pub async fn get_active_count(&self) -> usize {
        self.get_active_request_count().await
    }

    pub async fn get_active_stream_count(&self) -> Option<usize> {
        let requests = self.requests.read().await;
        let count = requests
            .iter()
            .filter(|(_, tracked)| tracked.is_streaming)
            .count();
        Some(count)
    }

    pub async fn cancel_all_requests(&self) -> usize {
        let requests = self.requests.read().await;
        let mut cancelled_count = 0;

        for (_, tracked) in requests.iter() {
            if let Some(cancellation_token) = &tracked.cancellation_token {
                cancellation_token.cancel();
                cancelled_count += 1;
            }
        }

        cancelled_count
    }
}

impl Default for RequestTracker {
    fn default() -> Self {
        Self::new()
    }
}
