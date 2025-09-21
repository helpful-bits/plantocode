use std::sync::Arc;
use uuid::Uuid;
use dashmap::DashMap;
use actix::Addr;
use serde_json::Value as JsonValue;
use tracing::{info, warn, debug};

use crate::services::device_link_ws::DeviceLinkWs;

/// Message types for device communication
#[derive(Clone, Debug, serde::Serialize, serde::Deserialize)]
pub struct DeviceMessage {
    pub message_type: String,
    pub payload: JsonValue,
    pub target_device_id: Option<String>,
    pub timestamp: chrono::DateTime<chrono::Utc>,
}

/// Connection information for a device
#[derive(Clone, Debug)]
pub struct DeviceConnection {
    pub device_id: String,
    pub user_id: Uuid,
    pub device_name: String,
    pub ws_addr: Addr<DeviceLinkWs>,
    pub connected_at: chrono::DateTime<chrono::Utc>,
    pub last_seen: chrono::DateTime<chrono::Utc>,
}

/// Manages WebSocket connections for devices
/// Uses a two-level map: user_id -> device_id -> connection
pub struct DeviceConnectionManager {
    // user_id -> device_id -> connection
    connections: Arc<DashMap<Uuid, DashMap<String, DeviceConnection>>>,
}

impl DeviceConnectionManager {
    pub fn new() -> Self {
        Self {
            connections: Arc::new(DashMap::new()),
        }
    }

    /// Register a new device connection
    pub fn register_connection(
        &self,
        user_id: Uuid,
        device_id: String,
        device_name: String,
        ws_addr: Addr<DeviceLinkWs>,
    ) {
        let connection = DeviceConnection {
            device_id: device_id.clone(),
            user_id,
            device_name: device_name.clone(),
            ws_addr,
            connected_at: chrono::Utc::now(),
            last_seen: chrono::Utc::now(),
        };

        // Get or create user connections map
        let user_devices = self.connections.entry(user_id).or_insert_with(DashMap::new);
        user_devices.insert(device_id.clone(), connection);

        info!(
            user_id = %user_id,
            device_id = %device_id,
            device_name = %device_name,
            "Device connected via WebSocket"
        );

        // Log connection statistics
        let user_count = self.connections.len();
        let total_devices: usize = self.connections.iter().map(|entry| entry.value().len()).sum();
        debug!(
            user_count = user_count,
            total_devices = total_devices,
            "Connection manager statistics"
        );
    }

    /// Remove a device connection
    pub fn remove_connection(&self, user_id: &Uuid, device_id: &str) {
        if let Some(user_devices) = self.connections.get(user_id) {
            if user_devices.remove(device_id).is_some() {
                info!(
                    user_id = %user_id,
                    device_id = %device_id,
                    "Device disconnected from WebSocket"
                );

                // Remove user entry if no devices remain
                if user_devices.is_empty() {
                    drop(user_devices); // Release the reference
                    self.connections.remove(user_id);
                    debug!(user_id = %user_id, "Removed empty user entry from connection manager");
                }
            }
        }
    }

    /// Get a device connection
    pub fn get_connection(&self, user_id: &Uuid, device_id: &str) -> Option<DeviceConnection> {
        self.connections
            .get(user_id)?
            .get(device_id)
            .map(|entry| entry.value().clone())
    }

    /// Get all devices for a user
    pub fn get_user_devices(&self, user_id: &Uuid) -> Vec<DeviceConnection> {
        self.connections
            .get(user_id)
            .map(|user_devices| {
                user_devices
                    .iter()
                    .map(|entry| entry.value().clone())
                    .collect()
            })
            .unwrap_or_default()
    }

    /// Send a message to a specific device
    pub async fn send_to_device(
        &self,
        user_id: &Uuid,
        device_id: &str,
        message: DeviceMessage,
    ) -> Result<(), String> {
        let connection = self.get_connection(user_id, device_id)
            .ok_or_else(|| format!("Device {} not connected for user {}", device_id, user_id))?;

        // Send message via WebSocket actor
        use actix::prelude::*;
        use crate::services::device_link_ws::RelayMessage;

        let relay_msg = RelayMessage {
            message: serde_json::to_string(&message)
                .map_err(|e| format!("Failed to serialize message: {}", e))?,
        };

        connection.ws_addr.try_send(relay_msg)
            .map_err(|e| format!("Failed to send message to device: {}", e))?;

        debug!(
            user_id = %user_id,
            device_id = %device_id,
            message_type = %message.message_type,
            "Message sent to device"
        );

        Ok(())
    }

    /// Broadcast a message to all devices for a user
    pub async fn broadcast_to_user(
        &self,
        user_id: &Uuid,
        message: DeviceMessage,
    ) -> Result<usize, String> {
        let devices = self.get_user_devices(user_id);

        if devices.is_empty() {
            warn!(user_id = %user_id, "No connected devices found for user");
            return Ok(0);
        }

        let total_devices = devices.len();
        let mut success_count = 0;
        for device in devices {
            match self.send_to_device(user_id, &device.device_id, message.clone()).await {
                Ok(()) => success_count += 1,
                Err(e) => {
                    warn!(
                        user_id = %user_id,
                        device_id = %device.device_id,
                        error = %e,
                        "Failed to send message to device"
                    );
                }
            }
        }

        info!(
            user_id = %user_id,
            message_type = %message.message_type,
            success_count = success_count,
            total_devices = total_devices,
            "Broadcast message to user devices"
        );

        Ok(success_count)
    }

    /// Get connection statistics
    pub fn get_stats(&self) -> ConnectionStats {
        let user_count = self.connections.len();
        let total_devices: usize = self.connections.iter().map(|entry| entry.value().len()).sum();

        let mut device_counts_per_user = Vec::new();
        for entry in self.connections.iter() {
            device_counts_per_user.push(entry.value().len());
        }

        ConnectionStats {
            total_users: user_count,
            total_devices,
            average_devices_per_user: if user_count > 0 {
                total_devices as f64 / user_count as f64
            } else {
                0.0
            },
            max_devices_per_user: device_counts_per_user.iter().max().copied().unwrap_or(0),
        }
    }

    /// Update last seen timestamp for a device
    pub fn update_last_seen(&self, user_id: &Uuid, device_id: &str) {
        if let Some(user_devices) = self.connections.get(user_id) {
            if let Some(mut connection) = user_devices.get_mut(device_id) {
                connection.last_seen = chrono::Utc::now();
            }
        }
    }

    /// Clean up stale connections (devices that haven't been seen for too long)
    pub async fn cleanup_stale_connections(&self, max_idle_duration: chrono::Duration) -> usize {
        let cutoff_time = chrono::Utc::now() - max_idle_duration;
        let mut removed_count = 0;

        // Collect stale connections to remove
        let mut to_remove = Vec::new();

        for user_entry in self.connections.iter() {
            let user_id = *user_entry.key();
            let user_devices = user_entry.value();

            for device_entry in user_devices.iter() {
                let device_id = device_entry.key().clone();
                let connection = device_entry.value();

                if connection.last_seen < cutoff_time {
                    to_remove.push((user_id, device_id));
                }
            }
        }

        // Remove stale connections
        for (user_id, device_id) in to_remove {
            self.remove_connection(&user_id, &device_id);
            removed_count += 1;

            warn!(
                user_id = %user_id,
                device_id = %device_id,
                idle_duration = ?(chrono::Utc::now() - cutoff_time),
                "Removed stale device connection"
            );
        }

        if removed_count > 0 {
            info!(
                removed_count = removed_count,
                "Cleaned up stale device connections"
            );
        }

        removed_count
    }

    /// Check if a device is currently connected
    pub fn is_device_connected(&self, user_id: &Uuid, device_id: &str) -> bool {
        self.connections
            .get(user_id)
            .map(|user_devices| user_devices.contains_key(device_id))
            .unwrap_or(false)
    }

    /// Get all connected users
    pub fn get_connected_users(&self) -> Vec<Uuid> {
        self.connections.iter().map(|entry| *entry.key()).collect()
    }

    /// Send raw JSON string to a specific device
    pub fn send_raw_to_device(&self, user_id: &Uuid, device_id: &str, raw_json: &str) -> Result<(), String> {
        let connection = self.get_connection(user_id, device_id)
            .ok_or_else(|| format!("Device {} not connected for user {}", device_id, user_id))?;

        // Send raw JSON as text frame directly
        use actix::prelude::*;
        use crate::services::device_link_ws::RelayMessage;

        let relay_msg = RelayMessage {
            message: raw_json.to_string(),
        };

        connection.ws_addr.try_send(relay_msg)
            .map_err(|e| format!("Failed to send raw message to device: {}", e))?;

        debug!(
            user_id = %user_id,
            device_id = %device_id,
            "Raw JSON message sent to device"
        );

        Ok(())
    }
}

impl Default for DeviceConnectionManager {
    fn default() -> Self {
        Self::new()
    }
}

#[derive(Debug, Clone, serde::Serialize)]
pub struct ConnectionStats {
    pub total_users: usize,
    pub total_devices: usize,
    pub average_devices_per_user: f64,
    pub max_devices_per_user: usize,
}

#[cfg(test)]
mod tests {
    use super::*;
    use actix::Actor;

    #[actix_rt::test]
    async fn test_connection_management() {
        let manager = DeviceConnectionManager::new();
        let user_id = Uuid::new_v4();
        let device_id = "test-device-1".to_string();

        // Since we can't easily create a real WebSocket actor in tests,
        // we'll just test the basic connection tracking functionality

        // Initially no devices
        assert_eq!(manager.get_user_devices(&user_id).len(), 0);
        assert!(!manager.is_device_connected(&user_id, &device_id));

        // Stats should be empty
        let stats = manager.get_stats();
        assert_eq!(stats.total_users, 0);
        assert_eq!(stats.total_devices, 0);
    }

    #[test]
    fn test_device_message_serialization() {
        let message = DeviceMessage {
            message_type: "test".to_string(),
            payload: serde_json::json!({"key": "value"}),
            target_device_id: Some("device-123".to_string()),
            timestamp: chrono::Utc::now(),
        };

        let serialized = serde_json::to_string(&message).unwrap();
        let deserialized: DeviceMessage = serde_json::from_str(&serialized).unwrap();

        assert_eq!(message.message_type, deserialized.message_type);
        assert_eq!(message.target_device_id, deserialized.target_device_id);
    }
}