use super::base::BackgroundJobRepository;
use super::helpers::row_to_job;
use crate::error::{AppError, AppResult};
use crate::events::job_events::*;
use crate::models::{OpenRouterUsage, usage_update::UsageUpdate};
use crate::utils::get_timestamp;
use log::debug;
use serde_json::{Value, json};
use sqlx::Row;
use tauri::Emitter;

impl BackgroundJobRepository {
    /// Update job stream state including response content and usage
    /// This method replaces direct event emissions from streaming handler
    ///
    /// # Arguments
    /// * `job_id` - The ID of the job to update
    /// * `accumulated_response` - The accumulated response content so far
    /// * `usage` - Optional usage data with token counts and cost
    /// * `stream_progress` - Optional streaming progress percentage (0.0 to 100.0)
    pub async fn update_job_stream_state(
        &self,
        job_id: &str,
        accumulated_response: &str,
        usage: Option<&OpenRouterUsage>,
        stream_progress: Option<f32>,
    ) -> AppResult<()> {
        let now = get_timestamp();

        // Retry wrapper for transaction
        let mut last_error = None;
        let mut job = None;
        let mut metadata_json = None;
        let mut updated_metadata = None;

        for attempt in 0..5 {
            let result = async {
                // Use a transaction to prevent race conditions between parallel streams
                let mut tx =
                    self.pool.begin().await.map_err(|e| {
                        AppError::DatabaseError(format!("Failed to begin transaction: {}", e))
                    })?;

                // Fetch the job within the transaction with row locking
                let job_row = sqlx::query("SELECT * FROM background_jobs WHERE id = $1")
                    .bind(job_id)
                    .fetch_optional(&mut *tx)
                    .await
                    .map_err(|e| AppError::DatabaseError(format!("Failed to fetch job: {}", e)))?;

                let fetched_job = match job_row {
                    Some(row) => row_to_job(&row)?,
                    None => return Err(AppError::NotFoundError(format!("Job {} not found", job_id))),
                };

                // Parse existing metadata or create new
                let mut parsed_metadata_json = if let Some(metadata_str) = &fetched_job.metadata {
                    serde_json::from_str::<Value>(metadata_str).unwrap_or_else(|_| json!({}))
                } else {
                    json!({})
                };

                // Ensure taskData object exists and update with streaming info
                if !parsed_metadata_json.get("taskData").is_some() {
                    parsed_metadata_json["taskData"] = json!({});
                }

                if let Some(task_data) = parsed_metadata_json.get_mut("taskData") {
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

                // Serialize metadata back to string
                let serialized_metadata = serde_json::to_string(&parsed_metadata_json).map_err(|e| {
                    AppError::SerializationError(format!("Failed to serialize metadata: {}", e))
                })?;

                // Update job in database with response and metadata
                let mut query_str =
                    "UPDATE background_jobs SET response = $1, metadata = $2, updated_at = $3".to_string();
                let mut param_index = 4;

                // Add usage fields if provided
                if let Some(usage_data) = usage {
                    query_str.push_str(&format!(", tokens_sent = ${}", param_index));
                    param_index += 1;
                    query_str.push_str(&format!(", tokens_received = ${}", param_index));
                    param_index += 1;
                    if let Some(cost) = usage_data.cost {
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

                // Execute within the transaction
                query.execute(&mut *tx).await.map_err(|e| {
                    AppError::DatabaseError(format!("Failed to update job stream state: {}", e))
                })?;

                // Commit the transaction
                tx.commit()
                    .await
                    .map_err(|e| AppError::DatabaseError(format!("Failed to commit transaction: {}", e)))?;

                Ok::<(crate::models::BackgroundJob, Value, String), AppError>((fetched_job, parsed_metadata_json, serialized_metadata))
            }.await;

            match result {
                Ok((fetched_job, parsed_metadata_json, serialized_metadata)) => {
                    // Success - store results and break out
                    job = Some(fetched_job);
                    metadata_json = Some(parsed_metadata_json);
                    updated_metadata = Some(serialized_metadata);
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

        let job = job.expect("Job should be set after successful transaction");
        let _metadata_json = metadata_json.expect("Metadata should be set after successful transaction");

        // Emit granular events based on changes
        if let Some(ref app_handle) = self.app_handle {
            // Emit response appended event if response grew
            let previous_response_len = job.response.as_ref().map(|r| r.len()).unwrap_or(0);
            let current_response_len = accumulated_response.len();

            if current_response_len > previous_response_len {
                let start_index = previous_response_len;
                // Ensure we don't create invalid UTF-8 by splitting at char boundaries
                let chunk = if start_index < accumulated_response.len() {
                    &accumulated_response[start_index..]
                } else {
                    ""
                };

                emit_job_response_appended(
                    app_handle,
                    JobResponseAppendedEvent {
                        job_id: job_id.to_string(),
                        chunk: chunk.to_string(),
                        accumulated_length: current_response_len,
                    },
                );
            }

            // Emit stream progress event if progress changed
            if let Some(progress) = stream_progress {
                let previous_progress = if let Some(metadata_str) = &job.metadata {
                    if let Ok(metadata_json) = serde_json::from_str::<Value>(metadata_str) {
                        metadata_json
                            .get("taskData")
                            .and_then(|td| td.get("streamProgress"))
                            .and_then(|v| v.as_f64())
                            .map(|v| v as f32)
                    } else {
                        None
                    }
                } else {
                    None
                };

                if previous_progress != Some(progress) {
                    emit_job_stream_progress(
                        app_handle,
                        JobStreamProgressEvent {
                            job_id: job_id.to_string(),
                            progress: Some(progress),
                            response_length: Some(current_response_len),
                            last_stream_update_time: Some(now),
                        },
                    );
                }
            }

            // Emit tokens updated event if tokens changed
            if let Some(usage_data) = usage {
                let tokens_changed = job.tokens_sent != Some(usage_data.prompt_tokens as i32)
                    || job.tokens_received != Some(usage_data.completion_tokens as i32)
                    || job.cache_read_tokens != Some(usage_data.cache_read_tokens as i64)
                    || job.cache_write_tokens != Some(usage_data.cache_write_tokens as i64);

                if tokens_changed {
                    emit_job_tokens_updated(
                        app_handle,
                        JobTokensUpdatedEvent {
                            job_id: job_id.to_string(),
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
                }

                // Emit cost updated event if cost changed
                if let Some(cost) = usage_data.cost {
                    if job.actual_cost != Some(cost) {
                        emit_job_cost_updated(
                            app_handle,
                            JobCostUpdatedEvent {
                                job_id: job_id.to_string(),
                                actual_cost: cost,
                                is_finalized: Some(false),
                            },
                        );
                    }
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
    ///
    /// # Arguments
    /// * `job_id` - The ID of the job to update
    /// * `usage` - UsageUpdate payload from server with cumulative counts
    pub async fn update_job_stream_usage(
        &self,
        job_id: &str,
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

        // Emit granular events
        if let Some(ref app_handle) = self.app_handle {
            // Emit tokens updated event
            emit_job_tokens_updated(
                app_handle,
                JobTokensUpdatedEvent {
                    job_id: job_id.to_string(),
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

        // Emit stream progress event
        if let Some(ref app_handle) = self.app_handle {
            emit_job_stream_progress(
                app_handle,
                JobStreamProgressEvent {
                    job_id: job_id.to_string(),
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
