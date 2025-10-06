use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::RwLock;
use tokio::sync::broadcast;

/// Event bus for handling internal application events
#[derive(Debug, Clone)]
pub struct EventBus {
    channels: Arc<RwLock<HashMap<String, broadcast::Sender<Event>>>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Event {
    pub event_type: String,
    pub payload: serde_json::Value,
    pub timestamp: chrono::DateTime<chrono::Utc>,
}

impl EventBus {
    pub fn new() -> Self {
        Self {
            channels: Arc::new(RwLock::new(HashMap::new())),
        }
    }

    pub async fn subscribe(&self, event_type: &str) -> broadcast::Receiver<Event> {
        let mut channels = self.channels.write().await;
        let sender = channels
            .entry(event_type.to_string())
            .or_insert_with(|| broadcast::channel(100).0);
        sender.subscribe()
    }

    pub async fn publish(&self, event: Event) -> Result<(), String> {
        let channels = self.channels.read().await;
        if let Some(sender) = channels.get(&event.event_type) {
            sender.send(event).map_err(|e| e.to_string())?;
        }
        Ok(())
    }
}

impl Default for EventBus {
    fn default() -> Self {
        Self::new()
    }
}
