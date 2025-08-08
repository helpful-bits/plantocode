use crate::error::AppError;
use bigdecimal::{BigDecimal, ToPrimitive};
use redis::{AsyncCommands, Client, Script};
use serde_json::{json, Value};
use std::collections::HashMap;
use tracing::{debug, error, info, warn};
use uuid::Uuid;

/// Manages pending charge reservations using Redis for atomic operations
/// with micro-unit precision (1e6 scale) for accurate billing calculations
pub struct PendingChargeManager {
    connection_manager: std::sync::Arc<redis::aio::ConnectionManager>,
    default_ttl_ms: u64,
}

impl PendingChargeManager {
    pub fn new(connection_manager: std::sync::Arc<redis::aio::ConnectionManager>, default_ttl_ms: u64) -> Self {
        Self { connection_manager, default_ttl_ms }
    }

    /// Converts BigDecimal to i64 micro-units (multiply by 1e6)
    fn to_micro_units(amount: &BigDecimal) -> Result<i64, AppError> {
        let micro_amount = amount * BigDecimal::from(1_000_000);
        micro_amount.to_i64().ok_or_else(|| {
            AppError::Validation("Amount too large for micro-unit conversion".to_string())
        })
    }

    /// Converts i64 micro-units back to BigDecimal
    fn from_micro_units(micro_amount: i64) -> BigDecimal {
        BigDecimal::from(micro_amount) / BigDecimal::from(1_000_000)
    }

    /// Reserves overage amount atomically using Redis Lua script
    /// Returns true if reservation successful, false if insufficient funds
    pub async fn reserve_overage(
        &self,
        user_id: &str,
        request_id: &str,
        extra_amount: &BigDecimal,
        available_total: &BigDecimal,
        ttl_seconds: Option<u64>,
    ) -> Result<bool, AppError> {
        let mut conn = self.connection_manager.as_ref().clone();

        let available_total_micro = Self::to_micro_units(available_total)?;
        let extra_micro = Self::to_micro_units(extra_amount)?;

        let user_key = format!("billing:reserve:user:{}", user_id);
        let request_key = format!("billing:reserve:req:{}", request_id);
        let ttl_secs = ttl_seconds.unwrap_or(self.default_ttl_ms / 1000);

        // Lua script for atomic reservation with cleanup
        let script = Script::new(
            r#"
            local user_key = KEYS[1]
            local request_key = KEYS[2]
            local available_total_micro = tonumber(ARGV[1])
            local extra_micro = tonumber(ARGV[2])
            local ttl_seconds = tonumber(ARGV[3])
            
            -- Clean up stale reservations by checking sentinel existence
            local hash_fields = redis.call('HGETALL', user_key)
            local reserved_sum = 0
            
            for i = 1, #hash_fields, 2 do
                local field_request_id = hash_fields[i]
                local field_amount = tonumber(hash_fields[i + 1])
                local sentinel_key = 'billing:reserve:req:' .. field_request_id
                
                if redis.call('EXISTS', sentinel_key) == 1 then
                    -- Sentinel exists, count this reservation
                    reserved_sum = reserved_sum + field_amount
                else
                    -- Sentinel doesn't exist, remove stale reservation
                    redis.call('HDEL', user_key, field_request_id)
                end
            end
            
            -- Check if we have sufficient funds
            if (available_total_micro - reserved_sum) >= extra_micro then
                -- Reserve the amount
                redis.call('HSET', user_key, request_key:gsub('billing:reserve:req:', ''), extra_micro)
                redis.call('SETEX', request_key, ttl_seconds, '1')
                return 1
            else
                return 0
            end
            "#,
        );

        let result: i32 = script
            .key(&user_key)
            .key(&request_key)
            .arg(available_total_micro)
            .arg(extra_micro)
            .arg(ttl_secs)
            .invoke_async(&mut conn)
            .await
            .map_err(|e| {
                AppError::Internal(format!("Redis script execution error: {}", e))
            })?;

        let success = result == 1;

        if success {
            debug!(
                user_id = user_id,
                request_id = request_id,
                extra_amount = %extra_amount,
                "Successfully reserved overage amount"
            );
        } else {
            warn!(
                user_id = user_id,
                request_id = request_id,
                extra_amount = %extra_amount,
                available_total = %available_total,
                "Insufficient funds for overage reservation"
            );
        }

        Ok(success)
    }

    /// Releases a reservation idempotently
    pub async fn release_reservation(
        &self,
        user_id: &str,
        request_id: &str,
    ) -> Result<(), AppError> {
        let mut conn = self.connection_manager.as_ref().clone();

        let user_key = format!("billing:reserve:user:{}", user_id);
        let request_key = format!("billing:reserve:req:{}", request_id);

        // Remove both the hash field and sentinel key
        let _: () = conn
            .hdel(&user_key, request_id)
            .await
            .map_err(|e| {
                AppError::Internal(format!("Failed to remove reservation hash: {}", e))
            })?;

        let _: () = conn.del(&request_key).await.map_err(|e| {
            AppError::Internal(format!("Failed to remove request sentinel: {}", e))
        })?;

        debug!(
            user_id = user_id,
            request_id = request_id,
            "Released reservation"
        );

        Ok(())
    }

    /// Gets total reserved amount with cleanup of stale entries
    pub async fn get_reserved_total(&self, user_id: &str) -> Result<BigDecimal, AppError> {
        let mut conn = self.connection_manager.as_ref().clone();

        let user_key = format!("billing:reserve:user:{}", user_id);

        // Lua script to get reserved total with cleanup
        let script = Script::new(
            r#"
            local user_key = KEYS[1]
            
            -- Get all hash fields
            local hash_fields = redis.call('HGETALL', user_key)
            local reserved_sum = 0
            
            for i = 1, #hash_fields, 2 do
                local field_request_id = hash_fields[i]
                local field_amount = tonumber(hash_fields[i + 1])
                local sentinel_key = 'billing:reserve:req:' .. field_request_id
                
                if redis.call('EXISTS', sentinel_key) == 1 then
                    -- Sentinel exists, count this reservation
                    reserved_sum = reserved_sum + field_amount
                else
                    -- Sentinel doesn't exist, remove stale reservation
                    redis.call('HDEL', user_key, field_request_id)
                end
            end
            
            return reserved_sum
            "#,
        );

        let reserved_micro: i64 = script
            .key(&user_key)
            .invoke_async(&mut conn)
            .await
            .map_err(|e| {
                AppError::Internal(format!("Redis script execution error: {}", e))
            })?;

        let reserved_total = Self::from_micro_units(reserved_micro);

        debug!(
            user_id = user_id,
            reserved_total = %reserved_total,
            "Retrieved reserved total with cleanup"
        );

        Ok(reserved_total)
    }

    /// Gets all active reservations for a user (for debugging/monitoring)
    pub async fn get_active_reservations(
        &self,
        user_id: &str,
    ) -> Result<HashMap<String, BigDecimal>, AppError> {
        let mut conn = self.connection_manager.as_ref().clone();

        let user_key = format!("billing:reserve:user:{}", user_id);

        // Get all hash fields
        let hash_data: HashMap<String, String> = conn.hgetall(&user_key).await.map_err(|e| {
            AppError::Internal(format!("Failed to get reservations hash: {}", e))
        })?;

        let mut active_reservations = HashMap::new();

        // Check each reservation's sentinel
        for (request_id, amount_str) in hash_data {
            let sentinel_key = format!("billing:reserve:req:{}", request_id);
            let exists: bool = conn.exists(&sentinel_key).await.map_err(|e| {
                AppError::Internal(format!("Failed to check sentinel existence: {}", e))
            })?;

            if exists {
                let micro_amount: i64 = amount_str.parse().map_err(|e| {
                    AppError::Internal(format!("Invalid amount in reservation: {}", e))
                })?;
                let amount = Self::from_micro_units(micro_amount);
                active_reservations.insert(request_id, amount);
            } else {
                // Clean up stale reservation
                let _: () = conn.hdel(&user_key, &request_id).await.map_err(|e| {
                    AppError::Internal(format!("Failed to clean up stale reservation: {}", e))
                })?;
            }
        }

        debug!(
            user_id = user_id,
            active_count = active_reservations.len(),
            "Retrieved active reservations"
        );

        Ok(active_reservations)
    }

    /// Health check method to verify Redis connectivity
    pub async fn health_check(&self) -> Result<(), AppError> {
        let mut conn = self.connection_manager.as_ref().clone();

        let _: String = conn.ping().await.map_err(|e| {
            AppError::Internal(format!("Redis ping failed: {}", e))
        })?;

        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::str::FromStr;

    #[test]
    fn test_micro_unit_conversion() {
        let amount = BigDecimal::from_str("1.234567").unwrap();
        let micro = PendingChargeManager::to_micro_units(&amount).unwrap();
        assert_eq!(micro, 1_234_567);

        let converted_back = PendingChargeManager::from_micro_units(micro);
        assert_eq!(converted_back, amount);
    }

    #[test]
    fn test_micro_unit_precision() {
        let amount = BigDecimal::from_str("0.000001").unwrap();
        let micro = PendingChargeManager::to_micro_units(&amount).unwrap();
        assert_eq!(micro, 1);

        let converted_back = PendingChargeManager::from_micro_units(micro);
        assert_eq!(converted_back, amount);
    }

    #[test]
    fn test_zero_amount() {
        let amount = BigDecimal::from_str("0").unwrap();
        let micro = PendingChargeManager::to_micro_units(&amount).unwrap();
        assert_eq!(micro, 0);

        let converted_back = PendingChargeManager::from_micro_units(micro);
        assert_eq!(converted_back, amount);
    }
}