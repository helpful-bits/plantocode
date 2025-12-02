use super::base::BackgroundJobRepository;
use crate::error::{AppError, AppResult};
use crate::events::job_events::*;
use crate::models::OpenRouterUsage;
use crate::utils::get_timestamp;
use log::debug;
use serde_json::{Value, json};
use sqlx::Row;

impl BackgroundJobRepository {
    /// Update job stream state including response content and usage
    /// This method replaces direct event emissions from streaming handler
    /// OPTIMIZED: No SELECT query - session_id is passed from caller to avoid per-chunk DB reads
    ///
    /// # Arguments
    /// * `job_id` - The ID of the job to update
    /// * `session_id` - The session ID (passed from caller to avoid DB lookup)
    /// * `accumulated_response` - The accumulated response content so far
    /// * `usage` - Optional usage data with token counts and cost
    /// * `stream_progress` - Optional streaming progress percentage (0.0 to 100.0)
    pub async fn update_job_stream_state(
        &self,
        job_id: &str,
        session_id: &str,
        accumulated_response: &str,
        usage: Option<&OpenRouterUsage>,
        stream_progress: Option<f32>,
    ) -> AppResult<()> {
        let now = get_timestamp();

        // Fetch current metadata to preserve existing fields (like workflowId)
        let current_metadata = sqlx::query("SELECT metadata FROM background_jobs WHERE id = $1")
            .bind(job_id)
            .fetch_optional(&*self.pool)
            .await
            .map_err(|e| AppError::DatabaseError(format!("Failed to fetch job metadata: {}", e)))?;

        // Parse existing metadata or create new - preserves workflowId and other fields
        let mut metadata_json = if let Some(row) = current_metadata {
            let metadata_opt: Option<String> = row.get(0);
            if let Some(metadata_str) = metadata_opt {
                serde_json::from_str::<Value>(&metadata_str).unwrap_or_else(|_| json!({}))
            } else {
                json!({})
            }
        } else {
            json!({})
        };

        // Ensure taskData object exists
        if !metadata_json.get("taskData").is_some() {
            metadata_json["taskData"] = json!({});
        }

        // Update taskData with streaming state
        if let Some(task_data) = metadata_json.get_mut("taskData") {
            if let Some(progress) = stream_progress {
                task_data["streamProgress"] = json!(progress);
            }
            task_data["responseLength"] = json!(accumulated_response.len());
            task_data["lastStreamUpdateTime"] = json!(now);

            // Add usage info if available
            if let Some(usage_data) = usage {
                task_data["tokensReceived"] = json!(usage_data.completion_tokens);
                task_data["tokensTotal"] = json!(usage_data.total_tokens);
                if let Some(cost) = usage_data.cost {
                    task_data["estimatedCost"] = json!(cost);
                }
            }
        }

        // Serialize metadata to string
        let serialized_metadata = serde_json::to_string(&metadata_json).map_err(|e| {
            AppError::SerializationError(format!("Failed to serialize metadata: {}", e))
        })?;

        // Retry wrapper for database write
        let mut last_error = None;
        for attempt in 0..5 {
            let result = async {
                // Build UPDATE query dynamically based on usage data
                let mut query_str =
                    "UPDATE background_jobs SET response = $1, metadata = $2, updated_at = $3".to_string();
                let mut param_index = 4;

                // Add usage fields if provided
                if let Some(usage_data) = usage {
                    query_str.push_str(&format!(", tokens_sent = ${}", param_index));
                    param_index += 1;
                    query_str.push_str(&format!(", tokens_received = ${}", param_index));
                    param_index += 1;
                    if let Some(_cost) = usage_data.cost {
                        query_str.push_str(&format!(", actual_cost = ${}", param_index));
                        param_index += 1;
                    }
                    if usage_data.cache_write_tokens > 0 {
                        query_str.push_str(&format!(", cache_write_tokens = ${}", param_index));
                        param_index += 1;
                    }
                    if usage_data.cache_read_tokens > 0 {
                        query_str.push_str(&format!(", cache_read_tokens = ${}", param_index));
                        param_index += 1;
                    }
                }

                query_str.push_str(&format!(" WHERE id = ${}", param_index));

                // Build and execute the query
                let mut query = sqlx::query(&query_str)
                    .bind(accumulated_response)
                    .bind(&serialized_metadata)
                    .bind(now);

                // Bind usage fields if provided
                if let Some(usage_data) = usage {
                    query = query.bind(usage_data.prompt_tokens as i64);
                    query = query.bind(usage_data.completion_tokens as i64);
                    if let Some(cost) = usage_data.cost {
                        query = query.bind(cost);
                    }
                    if usage_data.cache_write_tokens > 0 {
                        query = query.bind(usage_data.cache_write_tokens as i64);
                    }
                    if usage_data.cache_read_tokens > 0 {
                        query = query.bind(usage_data.cache_read_tokens as i64);
                    }
                }

                query = query.bind(job_id);

                // Execute directly without transaction (single UPDATE is atomic)
                query.execute(&*self.pool).await.map_err(|e| {
                    AppError::DatabaseError(format!("Failed to update job stream state: {}", e))
                })
            }.await;

            match result {
                Ok(_) => break,
                Err(e) => {
                    let msg = e.to_string();
                    if msg.contains("database is locked") || msg.contains("busy") {
                        last_error = Some(e);
                        let delay_ms = 25u64 * (1u64 << attempt);
                        tokio::time::sleep(std::time::Duration::from_millis(delay_ms)).await;
                        continue;
                    } else {
                        return Err(e);
                    }
                }
            }
        }

        if let Some(err) = last_error {
            return Err(err);
        }

        // Emit events using the passed session_id (no DB lookup needed)
        if let Some(ref app_handle) = self.app_handle {
            let current_response_len = accumulated_response.len();

            // Always emit response appended for streaming updates
            emit_job_response_appended(
                app_handle,
                JobResponseAppendedEvent {
                    job_id: job_id.to_string(),
                    session_id: session_id.to_string(),
                    chunk: String::new(), // Chunk not tracked without SELECT
                    accumulated_length: current_response_len,
                },
            );

            // Emit stream progress event
            if let Some(progress) = stream_progress {
                emit_job_stream_progress(
                    app_handle,
                    JobStreamProgressEvent {
                        job_id: job_id.to_string(),
                        session_id: session_id.to_string(),
                        progress: Some(progress),
                        response_length: Some(current_response_len),
                        last_stream_update_time: Some(now),
                    },
                );
            }

            // Emit tokens updated event
            if let Some(usage_data) = usage {
                emit_job_tokens_updated(
                    app_handle,
                    JobTokensUpdatedEvent {
                        job_id: job_id.to_string(),
                        session_id: session_id.to_string(),
                        tokens_sent: Some(usage_data.prompt_tokens as i32),
                        tokens_received: Some(usage_data.completion_tokens as i32),
                        cache_read_tokens: if usage_data.cache_read_tokens > 0 {
                            Some(usage_data.cache_read_tokens as i32)
                        } else {
                            None
                        },
                        cache_write_tokens: if usage_data.cache_write_tokens > 0 {
                            Some(usage_data.cache_write_tokens as i32)
                        } else {
                            None
                        },
                    },
                );

                // Emit cost updated event
                if let Some(cost) = usage_data.cost {
                    emit_job_cost_updated(
                        app_handle,
                        JobCostUpdatedEvent {
                            job_id: job_id.to_string(),
                            session_id: session_id.to_string(),
                            actual_cost: cost,
                            is_finalized: Some(false),
                        },
                    );
                }
            }
        }

        debug!(
            "Updated job {} stream state: response_len={}, progress={:?}",
            job_id,
            accumulated_response.len(),
            stream_progress
        );

        Ok(())
    }

    /// Update job stream usage with server-authoritative data
    /// Performs single SQL UPDATE for all usage fields and metadata
    /// OPTIMIZED: No SELECT query - session_id is passed from caller to avoid DB lookup
    ///
    /// # Arguments
    /// * `job_id` - The ID of the job to update
    /// * `session_id` - The session ID (passed from caller to avoid DB lookup)
    /// * `usage` - UsageUpdate payload from server with cumulative counts
    pub async fn update_job_stream_usage(
        &self,
        job_id: &str,
        session_id: &str,
        usage: &crate::models::usage_update::UsageUpdate,
    ) -> AppResult<()> {
        let now = get_timestamp();

        // Retry wrapper for database write
        let mut last_error = None;
        for attempt in 0..5 {
            let result = async {
                // Perform atomic UPDATE with server-authoritative usage data
                sqlx::query(
                    r#"
                    UPDATE background_jobs SET
                        tokens_sent = $1,
                        tokens_received = $2,
                        cache_read_tokens = $3,
                        cache_write_tokens = $4,
                        actual_cost = $5,
                        updated_at = $6
                    WHERE id = $7
                    "#,
                )
                .bind(usage.tokens_input as i64)
                .bind(usage.tokens_output as i64)
                .bind(usage.cache_read_tokens.map(|v| v as i64))
                .bind(usage.cache_write_tokens.map(|v| v as i64))
                .bind(usage.estimated_cost)
                .bind(now)
                .bind(job_id)
                .execute(&*self.pool)
                .await
                .map_err(|e| {
                    AppError::DatabaseError(format!("Failed to update job stream usage: {}", e))
                })
            }.await;

            match result {
                Ok(_) => {
                    // Success - break out and continue with rest of method
                    break;
                }
                Err(e) => {
                    let msg = e.to_string();
                    if msg.contains("database is locked") || msg.contains("busy") {
                        last_error = Some(e);
                        let delay_ms = 25u64 * (1u64 << attempt);
                        tokio::time::sleep(std::time::Duration::from_millis(delay_ms)).await;
                        continue;
                    } else {
                        // Not a lock error - return immediately
                        return Err(e);
                    }
                }
            }
        }

        if let Some(err) = last_error {
            return Err(err);
        }

        // Emit events using the passed session_id (no DB lookup needed)
        if let Some(ref app_handle) = self.app_handle {
            // Emit tokens updated event
            emit_job_tokens_updated(
                app_handle,
                JobTokensUpdatedEvent {
                    job_id: job_id.to_string(),
                    session_id: session_id.to_string(),
                    tokens_sent: Some(usage.tokens_input as i32),
                    tokens_received: Some(usage.tokens_output as i32),
                    cache_read_tokens: usage.cache_read_tokens.map(|v| v as i32),
                    cache_write_tokens: usage.cache_write_tokens.map(|v| v as i32),
                },
            );

            // Emit cost updated event
            emit_job_cost_updated(
                app_handle,
                JobCostUpdatedEvent {
                    job_id: job_id.to_string(),
                    session_id: session_id.to_string(),
                    actual_cost: usage.estimated_cost,
                    is_finalized: Some(false),
                },
            );
        }

        debug!(
            "Updated job {} stream usage: input={}, output={}, cost={}",
            job_id, usage.tokens_input, usage.tokens_output, usage.estimated_cost
        );

        Ok(())
    }

    /// Update job streaming progress with server-provided usage data
    /// This method performs atomic UPDATE using server-authoritative token counts
    ///
    /// # Arguments
    /// * `job_id` - The ID of the job to update
    /// * `usage_update` - UsageUpdate payload from server with cumulative counts
    /// * `stream_progress` - Optional streaming progress percentage (0.0 to 1.0)
    pub async fn update_job_stream_progress(
        &self,
        job_id: &str,
        usage_update: &crate::models::usage_update::UsageUpdate,
        stream_progress: Option<f32>,
    ) -> AppResult<()> {
        let now = get_timestamp();

        // Fetch current metadata to update with streaming progress
        let current_metadata = sqlx::query("SELECT metadata FROM background_jobs WHERE id = $1")
            .bind(job_id)
            .fetch_optional(&*self.pool)
            .await
            .map_err(|e| AppError::DatabaseError(format!("Failed to fetch job metadata: {}", e)))?;

        // Parse existing metadata or create new
        let mut metadata_json = if let Some(row) = current_metadata {
            let metadata_opt: Option<String> = row.get(0);
            if let Some(metadata_str) = metadata_opt {
                serde_json::from_str::<Value>(&metadata_str).unwrap_or_else(|_| json!({}))
            } else {
                json!({})
            }
        } else {
            json!({})
        };

        // Ensure taskData object exists and update with streaming progress
        if !metadata_json.get("taskData").is_some() {
            metadata_json["taskData"] = json!({});
        }

        if let Some(task_data) = metadata_json.get_mut("taskData") {
            if let Some(progress) = stream_progress {
                task_data["streamProgress"] = json!(progress);
            }
            task_data["responseLength"] = json!(usage_update.tokens_output);
            task_data["lastStreamUpdateTime"] = json!(now);
        }

        // Serialize metadata back to string
        let updated_metadata = serde_json::to_string(&metadata_json).map_err(|e| {
            AppError::SerializationError(format!("Failed to serialize metadata: {}", e))
        })?;

        // Retry wrapper for database write
        let mut last_error = None;
        for attempt in 0..5 {
            let result = async {
                // Perform atomic UPDATE with server-authoritative token counts and metadata
                sqlx::query(
                    r#"
                    UPDATE background_jobs SET
                        tokens_sent = $2,
                        tokens_received = $3,
                        actual_cost = $4,
                        cache_write_tokens = COALESCE($5, cache_write_tokens),
                        cache_read_tokens = COALESCE($6, cache_read_tokens),
                        metadata = $7,
                        updated_at = $8
                    WHERE id = $1
                    "#,
                )
                .bind(job_id)
                .bind(usage_update.tokens_input as i64)
                .bind(usage_update.tokens_output as i64)
                .bind(usage_update.estimated_cost)
                .bind(usage_update.cache_write_tokens.map(|v| v as i64))
                .bind(usage_update.cache_read_tokens.map(|v| v as i64))
                .bind(&updated_metadata)
                .bind(now)
                .execute(&*self.pool)
                .await
                .map_err(|e| {
                    AppError::DatabaseError(format!("Failed to update job stream progress: {}", e))
                })
            }.await;

            match result {
                Ok(_) => {
                    // Success - break out and continue with rest of method
                    break;
                }
                Err(e) => {
                    let msg = e.to_string();
                    if msg.contains("database is locked") || msg.contains("busy") {
                        last_error = Some(e);
                        let delay_ms = 25u64 * (1u64 << attempt);
                        tokio::time::sleep(std::time::Duration::from_millis(delay_ms)).await;
                        continue;
                    } else {
                        // Not a lock error - return immediately
                        return Err(e);
                    }
                }
            }
        }

        if let Some(err) = last_error {
            return Err(err);
        }

        let job = self
            .get_job_by_id(job_id)
            .await?
            .ok_or_else(|| AppError::NotFoundError(format!("Job {} not found", job_id)))?;

        // Emit stream progress event
        if let Some(ref app_handle) = self.app_handle {
            emit_job_stream_progress(
                app_handle,
                JobStreamProgressEvent {
                    job_id: job_id.to_string(),
                    session_id: job.session_id.clone(),
                    progress: stream_progress,
                    response_length: Some(usage_update.tokens_output as usize),
                    last_stream_update_time: Some(now),
                },
            );
        }

        debug!(
            "Updated job {} stream progress: input={}, output={}, cost={}",
            job_id,
            usage_update.tokens_input,
            usage_update.tokens_output,
            usage_update.estimated_cost
        );

        Ok(())
    }
}
