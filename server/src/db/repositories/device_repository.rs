use crate::error::AppError;
use chrono::{DateTime, Utc};
use serde_json::Value as JsonValue;
use sqlx::types::BigDecimal;
use sqlx::{PgPool, query, query_as, types::ipnetwork::IpNetwork};
use std::sync::Arc;
use uuid::Uuid;

#[derive(Debug, Clone, sqlx::FromRow)]
pub struct Device {
    pub id: Uuid,
    pub device_id: Uuid,
    pub user_id: Uuid,
    pub device_name: String,
    pub device_type: String,
    pub platform: String,
    pub platform_version: Option<String>,
    pub app_version: String,
    pub local_ips: Option<JsonValue>,
    pub public_ip: Option<IpNetwork>,
    pub relay_eligible: bool,
    pub available_ports: Option<JsonValue>,
    pub capabilities: JsonValue,
    pub status: String,
    pub last_heartbeat: Option<DateTime<Utc>>,
    pub cpu_usage: Option<BigDecimal>,
    pub memory_usage: Option<BigDecimal>,
    pub disk_space_gb: Option<i64>,
    pub active_jobs: i32,
    pub connection_descriptor: Option<JsonValue>,
    pub connection_signature: Option<String>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone)]
pub struct RegisterDeviceRequest {
    pub device_id: Uuid,
    pub user_id: Uuid,
    pub device_name: String,
    pub device_type: String,
    pub platform: String,
    pub platform_version: Option<String>,
    pub app_version: String,
    pub local_ips: Option<JsonValue>,
    pub public_ip: Option<IpNetwork>,
    pub relay_eligible: bool,
    pub available_ports: Option<JsonValue>,
    pub capabilities: JsonValue,
}

#[derive(Debug, Clone)]
pub struct HeartbeatRequest {
    pub cpu_usage: Option<BigDecimal>,
    pub memory_usage: Option<BigDecimal>,
    pub disk_space_gb: Option<i64>,
    pub active_jobs: i32,
    pub status: Option<String>,
}

pub struct DeviceRepository {
    db_pool: Arc<PgPool>,
}

impl DeviceRepository {
    pub fn new(db_pool: Arc<PgPool>) -> Self {
        Self { db_pool }
    }

    /// Register a new device or update existing device information
    pub async fn register_device(
        &self,
        request: RegisterDeviceRequest,
    ) -> Result<Device, AppError> {
        let device = query_as!(
            Device,
            r#"
            INSERT INTO devices (
                device_id, user_id, device_name, device_type, platform, platform_version,
                app_version, local_ips, public_ip, relay_eligible, available_ports,
                capabilities, status, last_heartbeat
            ) VALUES (
                $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, CASE WHEN $10 THEN 'online' ELSE 'offline' END, NOW()
            )
            ON CONFLICT (device_id) DO UPDATE SET
                device_name = EXCLUDED.device_name,
                device_type = EXCLUDED.device_type,
                platform = EXCLUDED.platform,
                platform_version = EXCLUDED.platform_version,
                app_version = EXCLUDED.app_version,
                local_ips = EXCLUDED.local_ips,
                public_ip = EXCLUDED.public_ip,
                relay_eligible = EXCLUDED.relay_eligible,
                available_ports = EXCLUDED.available_ports,
                capabilities = EXCLUDED.capabilities,
                status = CASE WHEN EXCLUDED.relay_eligible THEN 'online' ELSE 'offline' END,
                last_heartbeat = NOW(),
                updated_at = NOW()
            RETURNING
                id, device_id, user_id, device_name, device_type, platform, platform_version,
                app_version, local_ips, public_ip, relay_eligible,
                available_ports, capabilities, status, last_heartbeat, cpu_usage, memory_usage,
                disk_space_gb, active_jobs, connection_descriptor, connection_signature,
                created_at, updated_at
            "#,
            request.device_id,
            request.user_id,
            request.device_name,
            request.device_type,
            request.platform,
            request.platform_version,
            request.app_version,
            request.local_ips,
            request.public_ip,
            request.relay_eligible,
            request.available_ports,
            request.capabilities
        )
        .fetch_one(&*self.db_pool)
        .await
        .map_err(|e| AppError::Database(format!("Failed to register device: {}", e)))?;

        Ok(device)
    }

    /// Unregister a device
    pub async fn unregister_device(
        &self,
        device_id: &Uuid,
        user_id: &Uuid,
    ) -> Result<(), AppError> {
        let result = query!(
            "DELETE FROM devices WHERE device_id = $1 AND user_id = $2",
            device_id,
            user_id
        )
        .execute(&*self.db_pool)
        .await
        .map_err(|e| AppError::Database(format!("Failed to unregister device: {}", e)))?;

        if result.rows_affected() == 0 {
            return Err(AppError::NotFound(
                "Device not found or not owned by user".to_string(),
            ));
        }

        Ok(())
    }

    /// Get device by ID
    pub async fn get_device_by_id(&self, device_id: &Uuid) -> Result<Device, AppError> {
        let device = query_as!(
            Device,
            r#"
            SELECT
                id, device_id, user_id, device_name, device_type, platform, platform_version,
                app_version, local_ips, public_ip, relay_eligible,
                available_ports, capabilities, status, last_heartbeat, cpu_usage, memory_usage,
                disk_space_gb, active_jobs, connection_descriptor, connection_signature,
                created_at, updated_at
            FROM devices
            WHERE device_id = $1
            "#,
            device_id
        )
        .fetch_one(&*self.db_pool)
        .await
        .map_err(|e| match e {
            sqlx::Error::RowNotFound => {
                AppError::NotFound(format!("Device not found: {}", device_id))
            }
            _ => AppError::Database(format!("Failed to fetch device: {}", e)),
        })?;

        Ok(device)
    }

    /// List devices for a specific user
    pub async fn list_devices_by_user(&self, user_id: &Uuid) -> Result<Vec<Device>, AppError> {
        let devices = query_as!(
            Device,
            r#"
            SELECT
                id, device_id, user_id, device_name, device_type, platform, platform_version,
                app_version, local_ips, public_ip, relay_eligible,
                available_ports, capabilities, status, last_heartbeat, cpu_usage, memory_usage,
                disk_space_gb, active_jobs, connection_descriptor, connection_signature,
                created_at, updated_at
            FROM devices
            WHERE user_id = $1
            ORDER BY last_heartbeat DESC NULLS LAST, created_at DESC
            "#,
            user_id
        )
        .fetch_all(&*self.db_pool)
        .await
        .map_err(|e| AppError::Database(format!("Failed to fetch devices for user: {}", e)))?;

        Ok(devices)
    }

    /// Update device heartbeat and health metrics
    pub async fn update_heartbeat(
        &self,
        device_id: &Uuid,
        heartbeat: HeartbeatRequest,
    ) -> Result<(), AppError> {
        let status = heartbeat.status.unwrap_or_else(|| "online".to_string());

        let result = query!(
            r#"
            UPDATE devices
            SET
                last_heartbeat = NOW(),
                cpu_usage = COALESCE($2, cpu_usage),
                memory_usage = COALESCE($3, memory_usage),
                disk_space_gb = COALESCE($4, disk_space_gb),
                active_jobs = $5,
                status = $6,
                updated_at = NOW()
            WHERE device_id = $1
            "#,
            device_id,
            heartbeat.cpu_usage,
            heartbeat.memory_usage,
            heartbeat.disk_space_gb,
            heartbeat.active_jobs,
            status
        )
        .execute(&*self.db_pool)
        .await
        .map_err(|e| AppError::Database(format!("Failed to update device heartbeat: {}", e)))?;

        if result.rows_affected() == 0 {
            return Err(AppError::NotFound("Device not found".to_string()));
        }

        // Insert presence history record
        let _ = query!(
            r#"
            INSERT INTO device_presence_history (
                device_id, status, cpu_usage, memory_usage, disk_space_gb, active_jobs
            ) VALUES ($1, $2, $3, $4, $5, $6)
            "#,
            device_id,
            status,
            heartbeat.cpu_usage,
            heartbeat.memory_usage,
            heartbeat.disk_space_gb,
            heartbeat.active_jobs
        )
        .execute(&*self.db_pool)
        .await; // Ignore errors for presence history

        Ok(())
    }

    /// Update device status and last heartbeat with optional active_jobs
    pub async fn set_device_status(
        &self,
        device_id: &Uuid,
        status: &str,
        active_jobs: Option<i32>,
    ) -> Result<(), AppError> {
        sqlx::query(
            r#"
            UPDATE devices
            SET
                status = $2,
                last_heartbeat = NOW(),
                active_jobs = COALESCE($3, active_jobs),
                updated_at = NOW()
            WHERE device_id = $1
            "#
        )
        .bind(device_id)
        .bind(status)
        .bind(active_jobs)
        .execute(&*self.db_pool)
        .await
        .map_err(|e| AppError::Database(format!("Failed to set device status: {}", e)))?;

        Ok(())
    }

    /// Mark device as online
    pub async fn set_online(&self, device_id: &Uuid) -> Result<(), AppError> {
        self.set_device_status(device_id, "online", Some(0)).await
    }

    /// Mark device as offline
    pub async fn set_offline(&self, device_id: &Uuid) -> Result<(), AppError> {
        self.set_device_status(device_id, "offline", Some(0)).await
    }

    /// Update relay_eligible flag for a device
    pub async fn set_relay_eligible(
        &self,
        device_id: &Uuid,
        relay_eligible: bool,
    ) -> Result<(), AppError> {
        // If setting to false, also set status to offline for desktop devices
        let result = query!(
            r#"
            UPDATE devices
            SET
                relay_eligible = $2,
                status = CASE
                    WHEN device_type = 'desktop' AND $2 = false THEN 'offline'
                    ELSE status
                END,
                updated_at = NOW()
            WHERE device_id = $1
            "#,
            device_id,
            relay_eligible
        )
        .execute(&*self.db_pool)
        .await
        .map_err(|e| AppError::Database(format!("Failed to set relay_eligible: {}", e)))?;

        if result.rows_affected() == 0 {
            return Err(AppError::NotFound("Device not found".to_string()));
        }

        Ok(())
    }

    /// Save push notification token for a device
    pub async fn save_push_token(
        &self,
        device_id: &Uuid,
        push_token: &str,
    ) -> Result<(), AppError> {
        // Store push token in capabilities as devicePushToken
        let result = query!(
            r#"
            UPDATE devices
            SET
                capabilities = jsonb_set(capabilities, '{devicePushToken}', $2, true),
                updated_at = NOW()
            WHERE device_id = $1
            "#,
            device_id,
            JsonValue::String(push_token.to_string())
        )
        .execute(&*self.db_pool)
        .await
        .map_err(|e| AppError::Database(format!("Failed to save push token: {}", e)))?;

        if result.rows_affected() == 0 {
            return Err(AppError::NotFound("Device not found".to_string()));
        }

        Ok(())
    }

    /// Set the active project directory in device capabilities
    pub async fn set_active_project_directory(
        &self,
        device_id: &Uuid,
        project_directory: &str,
    ) -> Result<(), AppError> {
        let result = query!(
            r#"
            UPDATE devices
            SET
                capabilities = jsonb_set(
                    COALESCE(capabilities, '{}'::jsonb),
                    '{activeProjectDirectory}',
                    to_jsonb($2::text),
                    true
                ),
                updated_at = NOW()
            WHERE device_id = $1
            "#,
            device_id,
            project_directory
        )
        .execute(&*self.db_pool)
        .await
        .map_err(|e| {
            AppError::Database(format!("Failed to set active project directory: {}", e))
        })?;

        if result.rows_affected() == 0 {
            return Err(AppError::NotFound("Device not found".to_string()));
        }

        Ok(())
    }

    /// Update connection descriptor for secure device communication
    pub async fn update_connection_descriptor(
        &self,
        device_id: &Uuid,
        descriptor: JsonValue,
        signature: &str,
    ) -> Result<(), AppError> {
        let result = query!(
            r#"
            UPDATE devices
            SET
                connection_descriptor = $2,
                connection_signature = $3,
                updated_at = NOW()
            WHERE device_id = $1
            "#,
            device_id,
            descriptor,
            signature
        )
        .execute(&*self.db_pool)
        .await
        .map_err(|e| {
            AppError::Database(format!("Failed to update connection descriptor: {}", e))
        })?;

        if result.rows_affected() == 0 {
            return Err(AppError::NotFound("Device not found".to_string()));
        }

        Ok(())
    }

    /// Get connection descriptor for a device
    pub async fn get_connection_descriptor(
        &self,
        device_id: &Uuid,
        user_id: &Uuid,
    ) -> Result<(JsonValue, String), AppError> {
        let result = query!(
            r#"
            SELECT connection_descriptor, connection_signature
            FROM devices
            WHERE device_id = $1 AND user_id = $2
            "#,
            device_id,
            user_id
        )
        .fetch_one(&*self.db_pool)
        .await
        .map_err(|e| match e {
            sqlx::Error::RowNotFound => {
                AppError::NotFound("Device not found or not owned by user".to_string())
            }
            _ => AppError::Database(format!("Failed to fetch connection descriptor: {}", e)),
        })?;

        let descriptor = result
            .connection_descriptor
            .ok_or_else(|| AppError::NotFound("Connection descriptor not available".to_string()))?;
        let signature = result
            .connection_signature
            .ok_or_else(|| AppError::NotFound("Connection signature not available".to_string()))?;

        Ok((descriptor, signature))
    }

    /// Mark devices as offline if they haven't sent a heartbeat recently
    pub async fn mark_stale_devices_offline(&self) -> Result<i64, AppError> {
        let result = query!(
            r#"
            UPDATE devices
            SET status = 'offline', updated_at = NOW()
            WHERE status = 'online'
            AND last_heartbeat < NOW() - INTERVAL '2 minutes'
            "#
        )
        .execute(&*self.db_pool)
        .await
        .map_err(|e| AppError::Database(format!("Failed to mark stale devices offline: {}", e)))?;

        Ok(result.rows_affected() as i64)
    }

    /// Clean up old presence history (keep last 30 days)
    pub async fn cleanup_old_presence_history(&self) -> Result<i64, AppError> {
        let result = query!(
            r#"
            DELETE FROM device_presence_history
            WHERE timestamp < NOW() - INTERVAL '30 days'
            "#
        )
        .execute(&*self.db_pool)
        .await
        .map_err(|e| {
            AppError::Database(format!("Failed to cleanup old presence history: {}", e))
        })?;

        Ok(result.rows_affected() as i64)
    }

    /// Get all push tokens for a user (for broadcasting notifications)
    pub async fn get_push_tokens_for_user(&self, user_id: &Uuid) -> Result<Vec<String>, AppError> {
        let devices = query!(
            r#"
            SELECT capabilities
            FROM devices
            WHERE user_id = $1
            AND status = 'online'
            AND capabilities ? 'devicePushToken'
            "#,
            user_id
        )
        .fetch_all(&*self.db_pool)
        .await
        .map_err(|e| AppError::Database(format!("Failed to fetch push tokens: {}", e)))?;

        let mut tokens = Vec::new();
        for device in devices {
            if let Some(token) = device.capabilities.get("devicePushToken") {
                if let Some(token_str) = token.as_str() {
                    tokens.push(token_str.to_string());
                }
            }
        }

        Ok(tokens)
    }

    pub async fn upsert_push_token(
        &self,
        user_id: &Uuid,
        device_id: &Uuid,
        token: &str,
    ) -> Result<(), AppError> {
        let result = query!(
            r#"
            UPDATE devices
            SET
                capabilities = jsonb_set(capabilities, '{devicePushToken}', $3, true),
                updated_at = NOW()
            WHERE device_id = $1 AND user_id = $2
            "#,
            device_id,
            user_id,
            JsonValue::String(token.to_string())
        )
        .execute(&*self.db_pool)
        .await
        .map_err(|e| AppError::Database(format!("Failed to upsert push token: {}", e)))?;

        if result.rows_affected() == 0 {
            return Err(AppError::NotFound(
                "Device not found or not owned by user".to_string(),
            ));
        }

        Ok(())
    }

    pub async fn upsert_mobile_push_token(
        &self,
        user_id: &Uuid,
        device_id: &Uuid,
        platform: &str,
        token: &str,
    ) -> Result<(), AppError> {
        let capabilities = serde_json::json!({
            "devicePushToken": token
        });

        let result = sqlx::query(
            r#"
            INSERT INTO devices (
                device_id, user_id, device_name, device_type, platform,
                app_version, capabilities, status, relay_eligible
            ) VALUES (
                $1, $2, 'Mobile Device', 'mobile', $3,
                '', $4, 'online', false
            )
            ON CONFLICT (device_id) DO UPDATE SET
                capabilities = jsonb_set(
                    COALESCE(devices.capabilities, '{}'::jsonb),
                    '{devicePushToken}',
                    $5,
                    true
                ),
                platform = $3,
                updated_at = NOW()
            WHERE devices.user_id = $2
            "#,
        )
        .bind(device_id)
        .bind(user_id)
        .bind(platform)
        .bind(&capabilities)
        .bind(JsonValue::String(token.to_string()))
        .execute(&*self.db_pool)
        .await
        .map_err(|e| AppError::Database(format!("Failed to upsert mobile push token: {}", e)))?;

        if result.rows_affected() == 0 {
            return Err(AppError::Forbidden(
                "Device not owned by user".to_string(),
            ));
        }

        Ok(())
    }

    /// Clean up invalid devices for a user (wrong platform or "unknown" name)
    pub async fn cleanup_invalid_devices_for_user(&self, user_id: &Uuid) -> Result<i64, AppError> {
        let result = sqlx::query!(
            r#"
            DELETE FROM devices
            WHERE user_id = $1
              AND device_type = 'desktop'
              AND (
                lower(platform) NOT IN ('macos', 'windows', 'linux')
                OR lower(device_name) = 'unknown'
              )
            "#,
            user_id
        )
        .execute(&*self.db_pool)
        .await
        .map_err(|e| AppError::Database(format!("cleanup_invalid_devices_for_user: {}", e)))?;

        Ok(result.rows_affected() as i64)
    }
}
