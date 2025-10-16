use actix::Addr;
use dashmap::DashMap;
use serde_json::Value as JsonValue;
use std::collections::HashMap;
use std::sync::{Arc, RwLock};
use tracing::{debug, info, warn};
use uuid::Uuid;

use crate::services::device_link_ws::{DeviceLinkWs, CloseConnection};

#[derive(Clone, Debug, PartialEq)]
pub enum ClientType {
    Desktop,
    Mobile,
    Other(String),
}

/// Message types for device communication
#[derive(Clone, Debug, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
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
    pub client_type: ClientType,
}

/// Manages WebSocket connections for devices
/// Uses a two-level map: user_id -> device_id -> connection
#[derive(Clone)]
pub struct DeviceConnectionManager {
    // user_id -> device_id -> connection
    connections: Arc<DashMap<Uuid, DashMap<String, DeviceConnection>>>,
    binary_routes: Arc<RwLock<HashMap<(Uuid, String), String>>>,
}

impl DeviceConnectionManager {
    pub fn new() -> Self {
        Self {
            connections: Arc::new(DashMap::new()),
            binary_routes: Arc::new(RwLock::new(HashMap::new())),
        }
    }

    /// Register a new device connection
    /// If a connection already exists for this device, it will be gracefully closed
    pub fn register_connection(
        &self,
        user_id: Uuid,
        device_id: String,
        device_name: String,
        ws_addr: Addr<DeviceLinkWs>,
        client_type: ClientType,
    ) {
        // Normalize device ID to lowercase for case-insensitive comparisons
        let device_id_lower = device_id.to_lowercase();

        // Check if there's an existing connection for this device
        // If so, close it before registering the new one
        {
            let user_devices = self.connections.get(&user_id);
            if let Some(user_devices) = user_devices {
                if let Some(old_connection) = user_devices.get(&device_id_lower) {
                    warn!(
                        user_id = %user_id,
                        device_id = %device_id,
                        old_connected_at = %old_connection.connected_at,
                        "Closing existing connection for device before registering new one"
                    );
                    // Close the old WebSocket connection
                    // The actor will clean itself up via stopped() hook
                    old_connection.ws_addr.do_send(CloseConnection);
                }
            }
        }

        let connection = DeviceConnection {
            device_id: device_id_lower.clone(),
            user_id,
            device_name: device_name.clone(),
            ws_addr,
            connected_at: chrono::Utc::now(),
            last_seen: chrono::Utc::now(),
            client_type,
        };

        // Get or create user connections map and insert new connection
        {
            let user_devices = self
                .connections
                .entry(user_id)
                .or_insert_with(DashMap::new);
            user_devices.insert(device_id_lower.clone(), connection);
        }

        info!(
            user_id = %user_id,
            device_id = %device_id,
            device_name = %device_name,
            "Device connected via WebSocket"
        );

        // Log connection statistics
        let user_count = self.connections.len();
        let total_devices: usize = self
            .connections
            .iter()
            .map(|entry| entry.value().len())
            .sum();
        debug!(
            user_count = user_count,
            total_devices = total_devices,
            "Connection manager statistics"
        );
    }

    /// Remove a device connection
    pub fn remove_connection(&self, user_id: &Uuid, device_id: &str) {
        // Normalize device ID to lowercase for case-insensitive comparisons
        let device_id_lower = device_id.to_lowercase();

        if let Some(user_devices) = self.connections.get(user_id) {
            if user_devices.remove(&device_id_lower).is_some() {
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
        // Normalize device ID to lowercase for case-insensitive comparisons
        let device_id_lower = device_id.to_lowercase();

        let user_devices = self.connections.get(user_id)?;
        let available_devices: Vec<String> = user_devices.iter().map(|e| e.key().clone()).collect();

        let result = user_devices.get(&device_id_lower).map(|entry| entry.value().clone());

        if result.is_none() {
            warn!(
                user_id = %user_id,
                requested_device = %device_id,
                available_devices = ?available_devices,
                "Device not found in connection manager"
            );
        }

        result
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
        let connection = self
            .get_connection(user_id, device_id)
            .ok_or_else(|| format!("Device {} not connected for user {}", device_id, user_id))?;

        // Log with short device id
        let short_device_id: String = device_id.chars().take(8).collect();
        debug!(
            target = "device_link",
            "Forwarding type={} to device={}…",
            message.message_type,
            short_device_id
        );

        // Send message via WebSocket actor
        use crate::services::device_link_ws::RelayMessage;
        use actix::prelude::*;

        let relay_msg = RelayMessage {
            message: serde_json::to_string(&message)
                .map_err(|e| format!("Failed to serialize message: {}", e))?,
        };

        connection
            .ws_addr
            .try_send(relay_msg)
            .map_err(|e| format!("Failed to send message to device: {}", e))?;

        debug!(
            user_id = %user_id,
            device_id = %device_id,
            message_type = %message.message_type,
            message_size = message.payload.to_string().len(),
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
            match self
                .send_to_device(user_id, &device.device_id, message.clone())
                .await
            {
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

    pub async fn broadcast_to_user_excluding(
        &self,
        user_id: &uuid::Uuid,
        message: DeviceMessage,
        exclude_device_id: Option<&str>,
    ) -> Result<usize, String> {
        // Normalize exclude device ID to lowercase for case-insensitive comparisons
        let exclude_device_id_lower = exclude_device_id.map(|id| id.to_lowercase());

        let devices = self.get_user_devices(user_id);

        if devices.is_empty() {
            return Ok(0);
        }

        let mut success_count = 0usize;
        for device in &devices {
            if let Some(ref exclude) = exclude_device_id_lower {
                if &device.device_id == exclude {
                    continue;
                }
            }

            if self.send_to_device(user_id, &device.device_id, message.clone()).await.is_ok() {
                success_count += 1;
            }
        }

        info!(
            user_id = %user_id,
            message_type = %message.message_type,
            success_count = success_count,
            total_devices = devices.len(),
            "Broadcast message to user devices"
        );

        Ok(success_count)
    }

    /// Get connection statistics
    pub fn get_stats(&self) -> ConnectionStats {
        let user_count = self.connections.len();
        let total_devices: usize = self
            .connections
            .iter()
            .map(|entry| entry.value().len())
            .sum();

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
        // Normalize device ID to lowercase for case-insensitive comparisons
        let device_id_lower = device_id.to_lowercase();

        if let Some(user_devices) = self.connections.get(user_id) {
            if let Some(mut connection) = user_devices.get_mut(&device_id_lower) {
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
        // Normalize device ID to lowercase for case-insensitive comparisons
        let device_id_lower = device_id.to_lowercase();

        self.connections
            .get(user_id)
            .map(|user_devices| user_devices.contains_key(&device_id_lower))
            .unwrap_or(false)
    }

    /// Check if a device is currently connected with a specific client type
    pub fn is_device_connected_with_type(&self, user_id: &Uuid, device_id: &str, client_type: ClientType) -> bool {
        // Normalize device ID to lowercase for case-insensitive comparisons
        let device_id_lower = device_id.to_lowercase();

        if let Some(user_devices) = self.connections.get(user_id) {
            if let Some(conn) = user_devices.get(&device_id_lower) {
                return conn.client_type == client_type;
            }
        }
        false
    }

    /// Get all connected users
    pub fn get_connected_users(&self) -> Vec<Uuid> {
        self.connections.iter().map(|entry| *entry.key()).collect()
    }

    /// Send raw JSON string to a specific device
    pub fn send_raw_to_device(
        &self,
        user_id: &Uuid,
        device_id: &str,
        raw_json: &str,
    ) -> Result<(), String> {
        let connection = self
            .get_connection(user_id, device_id)
            .ok_or_else(|| {
                format!("Device {} not connected for user {}", device_id, user_id)
            })?;

        // Extract frame type for logging (if JSON)
        let frame_type = if let Ok(json) = serde_json::from_str::<serde_json::Value>(raw_json) {
            json.get("type")
                .and_then(|v| v.as_str())
                .unwrap_or("unknown")
                .to_string()
        } else {
            "non-json".to_string()
        };

        // Log with short device id (first 8 chars)
        let short_device_id: String = device_id.chars().take(8).collect();
        debug!(
            target = "device_link",
            "Forwarding type={} to device={}…",
            frame_type,
            short_device_id
        );

        // Send raw JSON as text frame directly
        use crate::services::device_link_ws::RelayMessage;
        use actix::prelude::*;

        let relay_msg = RelayMessage {
            message: raw_json.to_string(),
        };

        connection
            .ws_addr
            .try_send(relay_msg)
            .map_err(|e| format!("Failed to send raw message to device: {}", e))?;

        debug!(
            user_id = %user_id,
            device_id = %device_id,
            "Raw JSON message sent to device"
        );

        Ok(())
    }

    /// Send raw binary data to a specific device (for terminal I/O)
    pub fn send_binary_to_device(
        &self,
        user_id: &Uuid,
        device_id: &str,
        data: Vec<u8>,
    ) -> Result<(), String> {
        let connection = self
            .get_connection(user_id, device_id)
            .ok_or_else(|| {
                format!("Device {} not connected for user {}", device_id, user_id)
            })?;

        use crate::services::device_link_ws::BinaryMessage;
        use actix::prelude::*;

        connection
            .ws_addr
            .try_send(BinaryMessage { data })
            .map_err(|e| format!("Failed to send binary message to device: {}", e))?;

        Ok(())
    }

    pub fn set_binary_route(&self, user_id: &Uuid, producer: &str, consumer: &str) {
        match self.binary_routes.write() {
            Ok(mut map) => {
                map.insert((user_id.clone(), producer.to_string()), consumer.to_string());
            }
            Err(poisoned) => {
                warn!("Binary routes lock poisoned, recovering");
                let mut map = poisoned.into_inner();
                map.insert((user_id.clone(), producer.to_string()), consumer.to_string());
            }
        }
    }

    pub fn get_binary_consumer(&self, user_id: &Uuid, producer: &str) -> Option<String> {
        match self.binary_routes.read() {
            Ok(map) => map.get(&(user_id.clone(), producer.to_string())).cloned(),
            Err(poisoned) => {
                warn!("Binary routes lock poisoned during read, recovering");
                poisoned.into_inner().get(&(user_id.clone(), producer.to_string())).cloned()
            }
        }
    }

    pub fn clear_binary_routes_for_device(&self, user_id: &Uuid, device_id: &str) {
        // Normalize device ID to lowercase for case-insensitive comparisons
        let device_id_lower = device_id.to_lowercase();

        match self.binary_routes.write() {
            Ok(mut map) => {
                map.retain(|(u, prod), cons| !(u == user_id && (prod == &device_id_lower || cons == &device_id_lower)));
            }
            Err(poisoned) => {
                warn!("Binary routes lock poisoned, recovering");
                let mut map = poisoned.into_inner();
                map.retain(|(u, prod), cons| !(u == user_id && (prod == &device_id_lower || cons == &device_id_lower)));
            }
        }
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
