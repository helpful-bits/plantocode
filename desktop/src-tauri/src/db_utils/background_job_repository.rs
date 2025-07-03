use std::sync::Arc;
use std::str::FromStr;
use sqlx::{sqlite::SqliteRow, Row, SqlitePool, Sqlite};
use tauri::Emitter;
use crate::error::{AppError, AppResult};
use crate::models::{BackgroundJob, JobStatus, TaskType};
use crate::utils::get_timestamp;
use log::{info, warn, debug};
use serde_json::Value;

#[derive(Debug)]
pub struct BackgroundJobRepository {
    pool: Arc<SqlitePool>,
}

impl BackgroundJobRepository {
    pub fn new(pool: Arc<SqlitePool>) -> Self {
        Self { pool }
    }
    
    pub fn get_pool(&self) -> Arc<SqlitePool> {
        self.pool.clone()
    }
    
    /// Cancel a specific job by ID\n    /// \n    /// This is the canonical method for cancelling individual jobs. For workflow jobs,\n    /// consider using WorkflowOrchestrator::update_job_status() to allow proper \n    /// workflow state management and cancellation handling.
    pub async fn cancel_job(&self, job_id: &str, reason: &str) -> AppResult<()> {
        // Fetch the job to check its current status
        let job = self.get_job_by_id(job_id).await?
            .ok_or_else(|| AppError::NotFoundError(format!("Job with ID {} not found", job_id)))?;

        // If job is already in a terminal state, no action needed
        let current_status = JobStatus::from_str(&job.status).unwrap_or(JobStatus::Idle);
        if current_status.is_terminal() {
            info!("Job {} is already in a terminal state: {}", job_id, job.status);
            return Ok(());
        }

        // Attempt to remove the job from the job queue if it's queued
        match crate::jobs::queue::get_job_queue().await {
            Ok(queue_ref) => { // queue_ref is Arc<JobQueue>
                // Call cancel_job on the JobQueue instance
                match queue_ref.cancel_job(job_id.to_string()).await {
                    Ok(true) => info!("Successfully removed job {} from the queue.", job_id),
                    Ok(false) => debug!("Job {} was not found in the queue (might be running or completed).", job_id),
                    Err(e) => warn!("Failed to cancel job {} in queue: {}. Proceeding with DB update.", job_id, e),
                }
            },
            Err(e) => {
                warn!("Could not get job queue instance to cancel job {}: {}. Proceeding with DB update.", job_id, e);
            }
        }
        
        // Check if this is a workflow job and log a warning\n        if let Some(metadata_str) = &job.metadata {\n            if let Ok(metadata_json) = serde_json::from_str::<serde_json::Value>(metadata_str) {\n                if metadata_json.get(\"workflowId\").is_some() {\n                    warn!(\"Job {} belonging to a workflow is being cancelled directly - workflow state may not be properly updated\", job_id);\n                }\n            }\n        }\n        \n        // Extract cost from current job metadata if available
        let cost = if let Some(metadata_str) = &job.metadata {
            if let Ok(metadata_json) = serde_json::from_str::<serde_json::Value>(metadata_str) {
                metadata_json.get("task_data")
                    .and_then(|task_data| task_data.get("actual_cost"))
                    .and_then(|v| v.as_f64())
            } else {
                None
            }
        } else {
            None
        };
        
        // Use the new consolidated method
        self.mark_job_canceled(job_id, reason, cost).await
    }
    
    /// Update job streaming progress by appending response chunk and updating metadata.
    /// This method is used for streaming responses from API clients.
    /// 
    /// # Arguments
    /// * `job_id` - The ID of the job to update
    /// * `chunk` - The text chunk to append to the response
    /// * `new_tokens_received` - The number of tokens in this chunk
    /// * `current_total_response_length` - The current length of the accumulated response (characters)
    /// * `current_metadata_str` - The current metadata string from BackgroundJob.metadata
    /// * `cost` - Optional cost value to store in both metadata and database
    pub async fn update_job_stream_progress(&self, job_id: &str, chunk: &str, new_tokens_received: i32, current_total_response_length: i32, current_metadata_str: Option<&str>, app_handle: Option<&tauri::AppHandle>, cost: Option<f64>) -> AppResult<String> {
        // First check if the job exists and is in running status
        let job = self.get_job_by_id(job_id).await?
            .ok_or_else(|| AppError::DatabaseError(format!("Job not found: {}", job_id)))?;
            
        // Only append to running jobs
        if job.status != JobStatus::Running.to_string() {
            return Err(AppError::DatabaseError(format!("Cannot append to job with status {}", job.status)));
        }
        
        // Get current timestamp
        let now = get_timestamp();
        
        // Build the new response by appending the chunk
        let current_response = job.response.unwrap_or_default();
        let new_response = format!("{}{}", current_response, chunk);
        
        // Calculate token counts
        let tokens_received = job.tokens_received.unwrap_or(0) + new_tokens_received;
        
        // Parse current metadata into JobUIMetadata structure
        let metadata_str = match current_metadata_str {
            Some(metadata_str) => {
                if let Ok(mut ui_metadata) = serde_json::from_str::<crate::jobs::types::JobUIMetadata>(metadata_str) {
                    // Update streaming fields directly in task_data (flattened structure)
                    if let serde_json::Value::Object(ref mut task_map) = ui_metadata.task_data {
                        task_map.insert("isStreaming".to_string(), serde_json::json!(true));
                        task_map.insert("lastStreamUpdateTime".to_string(), serde_json::json!(now));
                        task_map.insert("responseLength".to_string(), serde_json::json!(current_total_response_length));
                        task_map.insert("tokensReceived".to_string(), serde_json::json!(tokens_received));
                        
                        // Add cost if provided
                        if let Some(cost_value) = cost {
                            task_map.insert("actual_cost".to_string(), serde_json::json!(cost_value));
                        }
                        
                        // Add start time if not present
                        if !task_map.contains_key("stream_start_time") {
                            task_map.insert("stream_start_time".to_string(), serde_json::json!(now));
                        }
                    } else {
                        // If task_data is not an object, create it with flattened streaming fields
                        let mut task_data = serde_json::json!({
                            "isStreaming": true,
                            "lastStreamUpdateTime": now,
                            "responseLength": current_total_response_length,
                            "tokensReceived": tokens_received,
                            "stream_start_time": now
                        });
                        
                        if let Some(cost_value) = cost {
                            if let serde_json::Value::Object(ref mut map) = task_data {
                                map.insert("actual_cost".to_string(), serde_json::json!(cost_value));
                            }
                        }
                        
                        ui_metadata.task_data = task_data;
                    }
                    
                    serde_json::to_string(&ui_metadata)
                        .map_err(|e| AppError::SerializationError(format!("Failed to serialize JobUIMetadata: {}", e)))?
                } else {
                    // Cannot parse as JobUIMetadata - create minimal streaming metadata with flattened structure
                    let mut task_data = serde_json::json!({
                        "isStreaming": true,
                        "lastStreamUpdateTime": now,
                        "responseLength": current_total_response_length,
                        "tokensReceived": tokens_received,
                        "stream_start_time": now
                    });
                    
                    if let Some(cost_value) = cost {
                        if let serde_json::Value::Object(ref mut map) = task_data {
                            map.insert("actual_cost".to_string(), serde_json::json!(cost_value));
                        }
                    }
                    
                    serde_json::to_string(&serde_json::json!({
                        "task_data": task_data
                    })).unwrap()
                }
            },
            None => {
                // No metadata - create minimal streaming metadata with flattened structure
                let mut task_data = serde_json::json!({
                    "isStreaming": true,
                    "lastStreamUpdateTime": now,
                    "responseLength": current_total_response_length,
                    "tokensReceived": tokens_received,
                    "stream_start_time": now
                });
                
                if let Some(cost_value) = cost {
                    if let serde_json::Value::Object(ref mut map) = task_data {
                        map.insert("actual_cost".to_string(), serde_json::json!(cost_value));
                    }
                }
                
                serde_json::to_string(&serde_json::json!({
                    "task_data": task_data
                })).unwrap()
            }
        };
        
        // Update the job in the database - include cost in database if provided
        let query_result = if let Some(cost_value) = cost {
            debug!("Updating job {} streaming progress with cost: ${:.6}", job_id, cost_value);
            sqlx::query(
                r#"
                UPDATE background_jobs SET
                    response = $1, 
                    tokens_received = $2,
                    updated_at = $3,
                    metadata = $4,
                    actual_cost = $5
                WHERE id = $6 AND status = $7
                "#)
                .bind(new_response)
                .bind(tokens_received)
                .bind(now)
                .bind(&metadata_str)
                .bind(cost_value)
                .bind(job_id)
                .bind(JobStatus::Running.to_string())
                .execute(&*self.pool)
                .await
        } else {
            debug!("Updating job {} streaming progress without cost", job_id);
            sqlx::query(
                r#"
                UPDATE background_jobs SET
                    response = $1, 
                    tokens_received = $2,
                    updated_at = $3,
                    metadata = $4
                WHERE id = $5 AND status = $6
                "#)
                .bind(new_response)
                .bind(tokens_received)
                .bind(now)
                .bind(&metadata_str)
                .bind(job_id)
                .bind(JobStatus::Running.to_string())
                .execute(&*self.pool)
                .await
        };
        
        query_result.map_err(|e| AppError::DatabaseError(format!("Failed to append to job response: {}", e)))?;
            
        // Emit streaming response update event to frontend if AppHandle is provided
        if let Some(handle) = app_handle {
            // Try to extract actualCost from metadata if present
            let actual_cost = if let Ok(ui_metadata) = serde_json::from_str::<crate::jobs::types::JobUIMetadata>(&metadata_str) {
                if let serde_json::Value::Object(ref task_map) = ui_metadata.task_data {
                    task_map.get("actualCost").and_then(|v| v.as_f64())
                } else {
                    None
                }
            } else {
                None
            };
            
            let mut event_payload = serde_json::json!({
                "job_id": job_id,
                "response_chunk": chunk,
                "chars_received": current_total_response_length,
                "tokens_received": tokens_received,
                "metadata": metadata_str
            });
            
            // Add actual_cost to the event payload if present
            if let Some(cost) = actual_cost {
                event_payload["actual_cost"] = serde_json::json!(cost);
            }
            
            if let Err(e) = handle.emit("VIBE_MANAGER_JOB_RESPONSE_UPDATE_EVENT", &event_payload) {
                log::warn!("Failed to emit job response update event for job {}: {}", job_id, e);
                // Don't fail the whole operation if event emission fails
            }
        }
            
        Ok(metadata_str)
    }
    
    
    /// Delete job history based on days_to_keep
    pub async fn clear_job_history(&self, days_to_keep: i64) -> AppResult<()> {
        let current_ts = get_timestamp();
        
        if days_to_keep == -1 {
            // Delete all completed, failed, or canceled jobs (excluding implementation plans)
            sqlx::query("DELETE FROM background_jobs WHERE status IN ($1, $2, $3) AND task_type <> $4")
                .bind(JobStatus::Completed.to_string())
                .bind(JobStatus::Failed.to_string())
                .bind(JobStatus::Canceled.to_string())
                .bind(crate::models::TaskType::ImplementationPlan.to_string())
                .execute(&*self.pool)
                .await
                .map_err(|e| AppError::DatabaseError(format!("Failed to delete job history: {}", e)))?;
        } else if days_to_keep > 0 {
            // Delete jobs older than specified days (excluding implementation plans)
            let target_date_ts = current_ts - (days_to_keep * 24 * 60 * 60 * 1000); // Convert days to milliseconds
            
            sqlx::query("DELETE FROM background_jobs WHERE status IN ($1, $2, $3) AND created_at < $4 AND task_type <> $5")
                .bind(JobStatus::Completed.to_string())
                .bind(JobStatus::Failed.to_string())
                .bind(JobStatus::Canceled.to_string())
                .bind(target_date_ts)
                .bind(crate::models::TaskType::ImplementationPlan.to_string())
                .execute(&*self.pool)
                .await
                .map_err(|e| AppError::DatabaseError(format!("Failed to delete job history: {}", e)))?;
        } else {
            // Delete jobs older than 90 days (default cleanup, excluding implementation plans)
            let ninety_days_ago_ts = current_ts - (90 * 24 * 60 * 60 * 1000); // Convert days to milliseconds
            
            sqlx::query("DELETE FROM background_jobs WHERE status IN ($1, $2, $3) AND created_at < $4 AND task_type <> $5")
                .bind(JobStatus::Completed.to_string())
                .bind(JobStatus::Failed.to_string())
                .bind(JobStatus::Canceled.to_string())
                .bind(ninety_days_ago_ts)
                .bind(crate::models::TaskType::ImplementationPlan.to_string())
                .execute(&*self.pool)
                .await
                .map_err(|e| AppError::DatabaseError(format!("Failed to delete old job history: {}", e)))?;
        }
        
        Ok(())
    }
    
    /// Get all jobs
    pub async fn get_all_jobs(&self) -> AppResult<Vec<BackgroundJob>> {
        let rows = sqlx::query("SELECT * FROM background_jobs ORDER BY created_at DESC")
            .fetch_all(&*self.pool)
            .await
            .map_err(|e| AppError::DatabaseError(format!("Failed to fetch jobs: {}", e)))?;
            
        let mut jobs = Vec::new();
        
        for row in rows {
            let job = self.row_to_job(&row)?;
            jobs.push(job);
        }
        
        Ok(jobs)
    }
    
    /// Get a job by ID
    pub async fn get_job_by_id(&self, id: &str) -> AppResult<Option<BackgroundJob>> {
        let row = sqlx::query("SELECT * FROM background_jobs WHERE id = $1")
            .bind(id)
            .fetch_optional(&*self.pool)
            .await
            .map_err(|e| AppError::DatabaseError(format!("Failed to fetch job: {}", e)))?;
            
        match row {
            Some(row) => {
                let job = self.row_to_job(&row)?;
                Ok(Some(job))
            },
            None => Ok(None)
        }
    }
    
    /// Get jobs by session ID
    pub async fn get_jobs_by_session_id(&self, session_id: &str) -> AppResult<Vec<BackgroundJob>> {
        let rows = sqlx::query("SELECT * FROM background_jobs WHERE session_id = $1 ORDER BY created_at DESC")
            .bind(session_id)
            .fetch_all(&*self.pool)
            .await
            .map_err(|e| AppError::DatabaseError(format!("Failed to fetch jobs by session ID: {}", e)))?;
            
        let mut jobs = Vec::new();
        
        for row in rows {
            let job = self.row_to_job(&row)?;
            jobs.push(job);
        }
        
        Ok(jobs)
    }
    
    /// Get active jobs (pending or running)
    pub async fn get_active_jobs(&self) -> AppResult<Vec<BackgroundJob>> {
        let rows = sqlx::query("SELECT * FROM background_jobs WHERE status IN ($1, $2) ORDER BY created_at ASC")
            .bind(JobStatus::Queued.to_string())
            .bind(JobStatus::Running.to_string())
            .fetch_all(&*self.pool)
            .await
            .map_err(|e| AppError::DatabaseError(format!("Failed to fetch active jobs: {}", e)))?;
            
        let mut jobs = Vec::new();
        
        for row in rows {
            let job = self.row_to_job(&row)?;
            jobs.push(job);
        }
        
        Ok(jobs)
    }
    
    /// Get all jobs, sorted by status priority and updated time
    pub async fn get_all_visible_jobs(&self) -> AppResult<Vec<BackgroundJob>> {
        let rows = sqlx::query(
            r#"
            SELECT * FROM background_jobs 
            ORDER BY 
                CASE 
                    WHEN status IN ($1, $2, $3, $4, $5, $6) THEN 0
                    ELSE 1
                END,
                CASE 
                    WHEN status = $7 THEN 0
                    WHEN status = $8 THEN 1
                    WHEN status = $9 THEN 2
                    WHEN status = $10 THEN 3
                    WHEN status = $11 THEN 4
                    WHEN status = $12 THEN 5
                    WHEN status = $13 THEN 6
                    WHEN status = $14 THEN 7
                    WHEN status = $15 THEN 8
                    ELSE 9
                END,
                updated_at DESC
            LIMIT 500
            "#)
            .bind(JobStatus::Running.to_string())
            .bind(JobStatus::Preparing.to_string()) 
            .bind(JobStatus::Queued.to_string())
            .bind(JobStatus::AcknowledgedByWorker.to_string())
            .bind(JobStatus::Created.to_string())
            .bind(JobStatus::Idle.to_string())
            .bind(JobStatus::Running.to_string())
            .bind(JobStatus::Queued.to_string())
            .bind(JobStatus::Preparing.to_string())
            .bind(JobStatus::AcknowledgedByWorker.to_string())
            .bind(JobStatus::Created.to_string())
            .bind(JobStatus::Idle.to_string())
            .bind(JobStatus::Completed.to_string())
            .bind(JobStatus::Failed.to_string())
            .bind(JobStatus::Canceled.to_string())
            .fetch_all(&*self.pool)
            .await
            .map_err(|e| AppError::DatabaseError(format!("Failed to fetch jobs: {}", e)))?;
            
        let mut jobs = Vec::new();
        
        for row in rows {
            let job = self.row_to_job(&row)?;
            jobs.push(job);
        }
        
        Ok(jobs)
    }
    
    /// Create a new job
    pub async fn create_job(&self, job: &BackgroundJob) -> AppResult<()> {
        sqlx::query(
            r#"
            INSERT INTO background_jobs (
                id, session_id, task_type, status, prompt, response, error_message,
                tokens_sent, tokens_received, model_used, actual_cost, metadata, system_prompt_template,
                created_at, updated_at, start_time, end_time
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
            "#)
            .bind(&job.id)
            .bind(&job.session_id)
            .bind(&job.task_type)
            .bind(&job.status)
            .bind(&job.prompt)
            .bind(&job.response)
            .bind(&job.error_message)
            .bind(job.tokens_sent.map(|v| v as i64))
            .bind(job.tokens_received.map(|v| v as i64))
            .bind(&job.model_used)
            .bind(job.actual_cost)
            .bind(&job.metadata)
            .bind(&job.system_prompt_template)
            .bind(job.created_at)
            .bind(job.updated_at)
            .bind(job.start_time)
            .bind(job.end_time)
            .execute(&*self.pool)
            .await
            .map_err(|e| AppError::DatabaseError(format!("Failed to insert job: {}", e)))?;
            
        Ok(())
    }
    
    /// Update an existing job
    pub async fn update_job(&self, job: &BackgroundJob) -> AppResult<()> {
        sqlx::query(
            r#"
            UPDATE background_jobs SET
                session_id = $1,
                task_type = $2,
                status = $3,
                updated_at = $4,
                start_time = $5,
                end_time = $6,
                prompt = $7,
                response = $8,
                error_message = $9,
                tokens_sent = $10,
                tokens_received = $11,
                model_used = $12,
                actual_cost = $13,
                metadata = $14,
                system_prompt_template = $15
            WHERE id = $16
            "#)
            .bind(&job.session_id)
            .bind(&job.task_type)
            .bind(&job.status)
            .bind(job.updated_at)
            .bind(job.start_time)
            .bind(job.end_time)
            .bind(&job.prompt)
            .bind(&job.response)
            .bind(&job.error_message)
            .bind(job.tokens_sent.map(|v| v as i64))
            .bind(job.tokens_received.map(|v| v as i64))
            .bind(&job.model_used)
            .bind(job.actual_cost)
            .bind(&job.metadata)
            .bind(&job.system_prompt_template)
            .bind(&job.id)
            .execute(&*self.pool)
            .await
            .map_err(|e| AppError::DatabaseError(format!("Failed to update job: {}", e)))?;
            
        Ok(())
    }
    
    /// Update job status
    pub async fn update_job_status(&self, job_id: &str, status: &JobStatus, message: Option<&str>) -> AppResult<()> {
        let now = get_timestamp();
        
        let result = if let Some(msg) = message {
            sqlx::query("UPDATE background_jobs SET status = $1, updated_at = $2, error_message = $3 WHERE id = $4")
                .bind(status.to_string())
                .bind(now)
                .bind(msg)
                .bind(job_id)
                .execute(&*self.pool)
                .await
        } else {
            sqlx::query("UPDATE background_jobs SET status = $1, updated_at = $2 WHERE id = $3")
                .bind(status.to_string())
                .bind(now)
                .bind(job_id)
                .execute(&*self.pool)
                .await
        };
        
        result.map_err(|e| AppError::DatabaseError(format!("Failed to update job status: {}", e)))?;
            
        Ok(())
    }
    
    /// Update job status with metadata
    /// This is useful for adding retry information and other processing metadata
    pub async fn update_job_status_with_metadata(
        &self, 
        job_id: &str, 
        status: &JobStatus, 
        message: Option<&str>,
        metadata_json: String
    ) -> AppResult<()> {
        let now = get_timestamp();
        
        let result = sqlx::query("UPDATE background_jobs SET status = $1, updated_at = $2, metadata = $3 WHERE id = $4")
            .bind(status.to_string())
            .bind(now)
            .bind(metadata_json)
            .bind(job_id)
            .execute(&*self.pool)
            .await;
        
        result.map_err(|e| AppError::DatabaseError(format!("Failed to update job status with metadata: {}", e)))?;
            
        Ok(())
    }
    
    /// Mark a job as running
    pub async fn mark_job_running(&self, job_id: &str) -> AppResult<()> {
        let now = get_timestamp();
        
        sqlx::query(
            "UPDATE background_jobs SET status = $1, updated_at = $2, start_time = $3, error_message = NULL WHERE id = $4"
        )
        .bind(JobStatus::Running.to_string())
        .bind(now)
        .bind(now)
        .bind(job_id)
        .execute(&*self.pool)
        .await
        .map_err(|e| AppError::DatabaseError(format!("Failed to mark job as running: {}", e)))?;
        
        Ok(())
    }
    
    /// Mark a job as completed with response and optional metadata
    /// Ensures cost is stored in both database field and metadata for consistency
    pub async fn mark_job_completed(
        &self,
        job_id: &str,
        response: &str,
        metadata: Option<&str>,
        tokens_sent: Option<i32>,
        tokens_received: Option<i32>,
        model_used: Option<&str>,
        system_prompt_template: Option<&str>,
        actual_cost: Option<f64>,
    ) -> AppResult<()> {
        let now = get_timestamp();
        
        // Log cost information for debugging
        if let Some(cost) = actual_cost {
            info!("Marking job {} as completed with cost: ${:.6}", job_id, cost);
        } else {
            debug!("Marking job {} as completed without cost", job_id);
        }
        
        // Verify cost consistency between metadata and parameter
        if let Some(metadata_str) = metadata {
            if let Ok(metadata_json) = serde_json::from_str::<Value>(metadata_str) {
                let metadata_cost = metadata_json.get("task_data")
                    .and_then(|task_data| task_data.get("actual_cost"))
                    .and_then(|v| v.as_f64());
                
                if let (Some(param_cost), Some(meta_cost)) = (actual_cost, metadata_cost) {
                    if (param_cost - meta_cost).abs() > f64::EPSILON {
                        warn!("Cost mismatch in job {}: parameter=${:.6}, metadata=${:.6}", 
                              job_id, param_cost, meta_cost);
                    }
                }
            }
        }
        
        // Build the SQL dynamically based on which parameters are provided
        let mut final_query = String::from("UPDATE background_jobs SET status = $1, response = $2, updated_at = $3, end_time = $4");
        let mut param_index = 5;
        
        if metadata.is_some() {
            final_query.push_str(&format!(", metadata = ${}", param_index));
            param_index += 1;
        }
        
        if tokens_sent.is_some() {
            final_query.push_str(&format!(", tokens_sent = ${}", param_index));
            param_index += 1;
        }
        
        if tokens_received.is_some() {
            final_query.push_str(&format!(", tokens_received = ${}", param_index));
            param_index += 1;
        }
        
        if model_used.is_some() {
            final_query.push_str(&format!(", model_used = ${}", param_index));
            param_index += 1;
        }
        
        if system_prompt_template.is_some() {
            final_query.push_str(&format!(", system_prompt_template = ${}", param_index));
            param_index += 1;
        }
        
        if actual_cost.is_some() {
            final_query.push_str(&format!(", actual_cost = ${}", param_index));
            param_index += 1;
        }
        
        // Add the WHERE clause
        final_query.push_str(&format!(" WHERE id = ${}", param_index));
        
        // Create and execute the query
        let mut query_obj = sqlx::query::<Sqlite>(&final_query);
        
        // Add the required bindings
        query_obj = query_obj.bind(JobStatus::Completed.to_string())
                            .bind(response)
                            .bind(now)
                            .bind(now);
        
        // Add conditional bindings
        if let Some(m) = metadata {
            query_obj = query_obj.bind(m);
        }
        
        if let Some(ts) = tokens_sent {
            query_obj = query_obj.bind(ts as i64);
        }
        
        if let Some(tr) = tokens_received {
            query_obj = query_obj.bind(tr as i64);
        }
        
        if let Some(model) = model_used {
            query_obj = query_obj.bind(model);
        }
        
        if let Some(template) = system_prompt_template {
            query_obj = query_obj.bind(template);
        }
        
        if let Some(cost) = actual_cost {
            query_obj = query_obj.bind(cost);
        }
        
        // Bind job_id last
        query_obj = query_obj.bind(job_id);
        
        // Execute the query
        let result = query_obj
            .execute(&*self.pool)
            .await
            .map_err(|e| AppError::DatabaseError(format!("Failed to mark job as completed: {}", e)))?;
            
        if result.rows_affected() > 0 {
            debug!("Successfully marked job {} as completed", job_id);
            if let Some(cost) = actual_cost {
                debug!("Cost ${:.6} stored in database for job {}", cost, job_id);
            }
        } else {
            warn!("No rows affected when marking job {} as completed", job_id);
        }
            
        Ok(())
    }
    
    /// Mark a job as failed with error message and optional metadata
    /// Tracks partial cost for failed jobs to maintain cost accounting accuracy
    pub async fn mark_job_failed(&self, job_id: &str, error_message: &str, metadata: Option<&str>, tokens_sent: Option<i32>, tokens_received: Option<i32>, model_used: Option<&str>, actual_cost: Option<f64>) -> AppResult<()> {
        let now = get_timestamp();
        
        // Log failure with cost information for debugging
        if let Some(cost) = actual_cost {
            info!("Marking job {} as failed with partial cost: ${:.6}, error: {}", job_id, cost, error_message);
        } else {
            info!("Marking job {} as failed without cost, error: {}", job_id, error_message);
        }
        
        // Verify cost consistency between metadata and parameter for failed jobs
        if let Some(metadata_str) = metadata {
            if let Ok(metadata_json) = serde_json::from_str::<Value>(metadata_str) {
                let metadata_cost = metadata_json.get("task_data")
                    .and_then(|task_data| task_data.get("actual_cost"))
                    .and_then(|v| v.as_f64());
                
                if let (Some(param_cost), Some(meta_cost)) = (actual_cost, metadata_cost) {
                    if (param_cost - meta_cost).abs() > f64::EPSILON {
                        warn!("Cost mismatch in failed job {}: parameter=${:.6}, metadata=${:.6}", 
                              job_id, param_cost, meta_cost);
                    }
                }
            }
        }
        
        // Build the SQL dynamically based on which parameters are provided
        let mut final_query = String::from("UPDATE background_jobs SET status = $1, error_message = $2, updated_at = $3, end_time = $4");
        let mut param_index = 5;
        
        if metadata.is_some() {
            final_query.push_str(&format!(", metadata = ${}", param_index));
            param_index += 1;
        }
        
        if tokens_sent.is_some() {
            final_query.push_str(&format!(", tokens_sent = ${}", param_index));
            param_index += 1;
        }
        
        if tokens_received.is_some() {
            final_query.push_str(&format!(", tokens_received = ${}", param_index));
            param_index += 1;
        }
        
        if model_used.is_some() {
            final_query.push_str(&format!(", model_used = ${}", param_index));
            param_index += 1;
        }
        
        if actual_cost.is_some() {
            final_query.push_str(&format!(", actual_cost = ${}", param_index));
            param_index += 1;
        }
        
        // Add the WHERE clause
        final_query.push_str(&format!(" WHERE id = ${}", param_index));
        
        // Create and execute the query
        let mut query_obj = sqlx::query::<Sqlite>(&final_query);
        
        // Add the required bindings
        query_obj = query_obj.bind(JobStatus::Failed.to_string())
                            .bind(error_message)
                            .bind(now)
                            .bind(now);
        
        // Add conditional bindings
        if let Some(m) = metadata {
            query_obj = query_obj.bind(m);
        }
        
        if let Some(ts) = tokens_sent {
            query_obj = query_obj.bind(ts as i64);
        }
        
        if let Some(tr) = tokens_received {
            query_obj = query_obj.bind(tr as i64);
        }
        
        if let Some(model) = model_used {
            query_obj = query_obj.bind(model);
        }
        
        if let Some(cost) = actual_cost {
            query_obj = query_obj.bind(cost);
        }
        
        // Bind job_id last
        query_obj = query_obj.bind(job_id);
        
        // Execute the query
        let result = query_obj
            .execute(&*self.pool)
            .await
            .map_err(|e| AppError::DatabaseError(format!("Failed to mark job as failed: {}", e)))?;
            
        if result.rows_affected() > 0 {
            debug!("Successfully marked job {} as failed", job_id);
            if let Some(cost) = actual_cost {
                debug!("Partial cost ${:.6} stored in database for failed job {}", cost, job_id);
            }
        } else {
            warn!("No rows affected when marking job {} as failed", job_id);
        }
            
        Ok(())
    }
    
    /// Mark a job as canceled with optional reason and cost tracking
    /// Preserves any accumulated cost for proper billing reconciliation
    pub async fn mark_job_canceled(&self, job_id: &str, reason: &str, cost: Option<f64>) -> AppResult<()> {
        let now = get_timestamp();
        
        // Log cancellation with cost information
        if let Some(cost_value) = cost {
            info!("Marking job {} as canceled with cost: ${:.6}, reason: {}", job_id, cost_value, reason);
        } else {
            info!("Marking job {} as canceled without cost, reason: {}", job_id, reason);
        }
        
        let query = if let Some(cost_value) = cost {
            sqlx::query(
                r#"
                UPDATE background_jobs 
                SET status = $1, 
                    error_message = $2, 
                    updated_at = $3, 
                    end_time = $4,
                    actual_cost = $5
                WHERE id = $6
                "#)
                .bind(JobStatus::Canceled.to_string())
                .bind(reason)
                .bind(now)
                .bind(now)
                .bind(cost_value)
                .bind(job_id)
        } else {
            sqlx::query(
                r#"
                UPDATE background_jobs 
                SET status = $1, 
                    error_message = $2, 
                    updated_at = $3, 
                    end_time = $4
                WHERE id = $5
                "#)
                .bind(JobStatus::Canceled.to_string())
                .bind(reason)
                .bind(now)
                .bind(now)
                .bind(job_id)
        };
        
        let result = query.execute(&*self.pool)
            .await
            .map_err(|e| AppError::DatabaseError(format!("Failed to mark job as canceled: {}", e)))?;
            
        if result.rows_affected() > 0 {
            debug!("Successfully marked job {} as canceled", job_id);
            if let Some(cost_value) = cost {
                debug!("Cost ${:.6} stored in database for canceled job {}", cost_value, job_id);
            }
        } else {
            warn!("No rows affected when marking job {} as canceled", job_id);
        }
            
        Ok(())
    }

    /// Mark a job as canceled with optional reason and usage tracking
    /// Comprehensive cancellation with all usage metrics for accurate cost accounting
    pub async fn mark_job_canceled_with_usage(
        &self, 
        job_id: &str, 
        reason: &str,
        tokens_sent: Option<i32>,
        tokens_received: Option<i32>,
        model_used: Option<&str>,
        actual_cost: Option<f64>,
    ) -> AppResult<()> {
        let now = get_timestamp();
        
        // Log comprehensive cancellation with usage tracking
        if let Some(cost) = actual_cost {
            info!("Marking job {} as canceled with full usage tracking and cost: ${:.6}, reason: {}", 
                  job_id, cost, reason);
        } else {
            info!("Marking job {} as canceled with usage tracking but no cost, reason: {}", 
                  job_id, reason);
        }
        
        // Build the SQL dynamically based on which parameters are provided
        let mut final_query = String::from("UPDATE background_jobs SET status = $1, error_message = $2, updated_at = $3, end_time = $4");
        let mut param_index = 5;
        
        if tokens_sent.is_some() {
            final_query.push_str(&format!(", tokens_sent = ${}", param_index));
            param_index += 1;
        }
        
        if tokens_received.is_some() {
            final_query.push_str(&format!(", tokens_received = ${}", param_index));
            param_index += 1;
        }
        
        if model_used.is_some() {
            final_query.push_str(&format!(", model_used = ${}", param_index));
            param_index += 1;
        }
        
        if actual_cost.is_some() {
            final_query.push_str(&format!(", actual_cost = ${}", param_index));
            param_index += 1;
        }
        
        // Add the WHERE clause
        final_query.push_str(&format!(" WHERE id = ${}", param_index));
        
        // Create and execute the query
        let mut query_obj = sqlx::query::<Sqlite>(&final_query);
        
        // Add the required bindings
        query_obj = query_obj.bind(JobStatus::Canceled.to_string())
                            .bind(reason)
                            .bind(now)
                            .bind(now);
        
        // Add conditional bindings
        if let Some(ts) = tokens_sent {
            query_obj = query_obj.bind(ts as i64);
        }
        
        if let Some(tr) = tokens_received {
            query_obj = query_obj.bind(tr as i64);
        }
        
        if let Some(model) = model_used {
            query_obj = query_obj.bind(model);
        }
        
        if let Some(cost) = actual_cost {
            query_obj = query_obj.bind(cost);
        }
        
        // Bind job_id last
        query_obj = query_obj.bind(job_id);
        
        // Execute the query
        let result = query_obj
            .execute(&*self.pool)
            .await
            .map_err(|e| AppError::DatabaseError(format!("Failed to mark job as canceled with usage: {}", e)))?;
            
        if result.rows_affected() > 0 {
            debug!("Successfully marked job {} as canceled with usage tracking", job_id);
            if let Some(cost) = actual_cost {
                debug!("Cost ${:.6} and usage metrics stored for canceled job {}", cost, job_id);
            }
        } else {
            warn!("No rows affected when marking job {} as canceled with usage", job_id);
        }
            
        Ok(())
    }
    
    
    
    /// Delete a job
    pub async fn delete_job(&self, id: &str) -> AppResult<()> {
        sqlx::query("DELETE FROM background_jobs WHERE id = $1")
            .bind(id)
            .execute(&*self.pool)
            .await
            .map_err(|e| AppError::DatabaseError(format!("Failed to delete job: {}", e)))?;
            
        Ok(())
    }
    
    // The more complete version of update_job_response is below
    
    /// Update job response and status with token information
    pub async fn update_job_response(
        &self,
        job_id: &str,
        response: &str,
        status: Option<JobStatus>,
        metadata: Option<&str>,
        tokens_sent: Option<i32>,
        tokens_received: Option<i32>,
        chars_received: Option<i32>,
    ) -> AppResult<()> {
        self.update_job_response_with_system_prompt(
            job_id,
            response,
            status,
            metadata,
            tokens_sent,
            tokens_received,
            chars_received,
        ).await
    }

    /// Update job response and status with token information and system prompt tracking
    pub async fn update_job_response_with_system_prompt(
        &self,
        job_id: &str,
        response: &str,
        status: Option<JobStatus>,
        metadata: Option<&str>,
        tokens_sent: Option<i32>,
        tokens_received: Option<i32>,
        chars_received: Option<i32>,
    ) -> AppResult<()> {
        let now = get_timestamp();
        
        // Build the SQL dynamically based on which parameters are provided
        let mut final_query = String::from("UPDATE background_jobs SET response = $1, updated_at = $2");
        
        // We'll use this counter to keep track of the parameter index
        let mut param_index = 3;
        
        if let Some(s) = &status {
            final_query.push_str(&format!(", status = ${}", param_index));
            param_index += 1;
            
            if *s == JobStatus::Completed || *s == JobStatus::Failed || *s == JobStatus::Canceled {
                final_query.push_str(&format!(", end_time = ${}", param_index));
                param_index += 1;
            }
        }
        
        if metadata.is_some() {
            final_query.push_str(&format!(", metadata = ${}", param_index));
            param_index += 1;
        }
        
        if tokens_sent.is_some() {
            final_query.push_str(&format!(", tokens_sent = ${}", param_index));
            param_index += 1;
        }
        
        if tokens_received.is_some() {
            final_query.push_str(&format!(", tokens_received = ${}", param_index));
            param_index += 1;
        }
        
        
        // Add the WHERE clause
        final_query.push_str(&format!(" WHERE id = ${}", param_index));
        
        // Create a new query with the database type specified
        let mut query_obj = sqlx::query::<Sqlite>(&final_query);
        
        // Add the initial bindings
        query_obj = query_obj.bind(response).bind(now);
        
        // Add conditional bindings
        if let Some(s) = &status {
            query_obj = query_obj.bind(s.to_string());
            
            if *s == JobStatus::Completed || *s == JobStatus::Failed || *s == JobStatus::Canceled {
                query_obj = query_obj.bind(now);
            }
        }
        
        if let Some(m) = metadata {
            query_obj = query_obj.bind(m);
        }
        
        if let Some(ts) = tokens_sent {
            query_obj = query_obj.bind(ts as i64);
        }
        
        if let Some(tr) = tokens_received {
            query_obj = query_obj.bind(tr as i64);
        }
        
        
        // Bind job_id last
        query_obj = query_obj.bind(job_id);
        
        // Execute the query
        query_obj
            .execute(&*self.pool)
            .await
            .map_err(|e| AppError::DatabaseError(format!("Failed to update job response: {}", e)))?;
            
        Ok(())
    }
    
    
    /// Update the model used for a job
    pub async fn update_model_used(&self, job_id: &str, model: &str) -> AppResult<()> {
        sqlx::query("UPDATE background_jobs SET model_used = $1 WHERE id = $2")
            .bind(model)
            .bind(job_id)
            .execute(&*self.pool)
            .await
            .map_err(|e| AppError::DatabaseError(format!("Failed to update job model_used: {}", e)))?;
            
        Ok(())
    }
    
    /// Helper method to convert a database row to a BackgroundJob struct
    /// Ensures proper retrieval of cost data from database
    fn row_to_job(&self, row: &SqliteRow) -> AppResult<BackgroundJob> {
        let id: String = row.try_get::<'_, String, _>("id")?;
        let session_id: String = row.try_get::<'_, String, _>("session_id")?;
        let task_type: String = row.try_get::<'_, String, _>("task_type")?;
        let status: String = row.try_get::<'_, String, _>("status")?;
        let prompt: String = row.try_get::<'_, String, _>("prompt")?;
        let created_at: i64 = row.try_get::<'_, i64, _>("created_at")?;
        
        let response: Option<String> = row.try_get::<'_, Option<String>, _>("response").unwrap_or(None);
        let error_message: Option<String> = row.try_get::<'_, Option<String>, _>("error_message").unwrap_or(None);
        let tokens_sent: Option<i32> = row.try_get::<'_, Option<i64>, _>("tokens_sent").map(|v| v.map(|val| val as i32)).unwrap_or(None);
        let tokens_received: Option<i32> = row.try_get::<'_, Option<i64>, _>("tokens_received").map(|v| v.map(|val| val as i32)).unwrap_or(None);
        let model_used: Option<String> = row.try_get::<'_, Option<String>, _>("model_used").unwrap_or(None);
        let metadata: Option<String> = row.try_get::<'_, Option<String>, _>("metadata").unwrap_or(None);
        let system_prompt_template: Option<String> = row.try_get::<'_, Option<String>, _>("system_prompt_template").unwrap_or(None);
        let updated_at: Option<i64> = row.try_get::<'_, Option<i64>, _>("updated_at").unwrap_or(None);
        let start_time: Option<i64> = row.try_get::<'_, Option<i64>, _>("start_time").unwrap_or(None);
        let end_time: Option<i64> = row.try_get::<'_, Option<i64>, _>("end_time").unwrap_or(None);
        // Retrieve cost from database with proper error handling
        let actual_cost = row.try_get::<'_, Option<f64>, _>("actual_cost").unwrap_or(None);
        
        // Log cost retrieval for debugging if present
        if let Some(cost) = actual_cost {
            debug!("Retrieved job {} from database with cost: ${:.6}", id, cost);
        }
        
        Ok(BackgroundJob {
            id,
            session_id,
            task_type,
            status,
            prompt,
            response,
            error_message,
            tokens_sent,
            tokens_received,
            model_used,
            actual_cost,
            duration_ms: row.try_get::<'_, Option<i64>, _>("duration_ms").unwrap_or(None),
            metadata,
            system_prompt_template,
            created_at,
            updated_at,
            start_time,
            end_time,
        })
    }
    
    /// Get jobs from the database that are queued and have worker-specific metadata
    /// These jobs will be atomically updated to have 'acknowledged_by_worker' status
    pub async fn get_and_acknowledge_queued_jobs_for_worker(&self, limit: u32) -> AppResult<Vec<BackgroundJob>> {
        // Find jobs with status='queued' and where metadata contains jobTypeForWorker
        let rows = sqlx::query(
            r#"
            SELECT * FROM background_jobs 
            WHERE status = $1
            AND json_extract(metadata, '$.additionalParams.jobTypeForWorker') IS NOT NULL
            ORDER BY 
                CASE 
                    WHEN json_extract(metadata, '$.jobPriorityForWorker') = 2 THEN 1
                    WHEN json_extract(metadata, '$.jobPriorityForWorker') = 0 THEN 3
                    ELSE 2
                END,
                created_at ASC
            LIMIT $2
            "#)
            .bind(JobStatus::Queued.to_string())
            .bind(limit as i64)
            .fetch_all(&*self.pool)
            .await
            .map_err(|e| AppError::DatabaseError(format!("Failed to fetch queued jobs: {}", e)))?;
        
        if rows.is_empty() {
            return Ok(Vec::new());
        }
        
        // Convert rows to jobs
        let mut jobs = Vec::new();
        let mut job_ids = Vec::new();
        
        for row in &rows {
            let job = self.row_to_job(row)?;
            job_ids.push(job.id.clone());
            jobs.push(job);
        }
        
        // Update the status of these jobs atomically
        let timestamp = get_timestamp();
        
        for job_id in &job_ids {
            // Update each job individually to ensure atomicity
            let result = sqlx::query(
                "UPDATE background_jobs SET status = $1, updated_at = $2 WHERE id = $3 AND status = $4")
                .bind(JobStatus::AcknowledgedByWorker.to_string())
                .bind(timestamp)
                .bind(job_id)
                .bind(JobStatus::Queued.to_string())
                .execute(&*self.pool)
                .await
                .map_err(|e| AppError::DatabaseError(format!("Failed to update job status: {}", e)))?;
            
            // If the update didn't affect any rows, the job was probably picked up by another worker
            if result.rows_affected() == 0 {
                // Remove this job from our list
                jobs.retain(|job| job.id != *job_id);
            }
        }
        
        Ok(jobs)
    }
    
    /// Get jobs by their IDs
    pub async fn get_jobs_by_ids(&self, ids: &[String]) -> AppResult<Vec<BackgroundJob>> {
        if ids.is_empty() {
            return Ok(Vec::new());
        }
        
        // Create placeholders for the query
        let placeholders: Vec<String> = ids.iter().enumerate().map(|(i, _)| format!("${}", i+1)).collect();
        let placeholder_str = placeholders.join(",");
        
        let query = format!("SELECT * FROM background_jobs WHERE id IN ({}) ORDER BY created_at DESC", placeholder_str);
        
        // Build the query with bindings
        let mut query_builder = sqlx::query(&query);
        for id in ids {
            query_builder = query_builder.bind(id);
        }
        
        let rows = query_builder
            .fetch_all(&*self.pool)
            .await
            .map_err(|e| AppError::DatabaseError(format!("Failed to fetch jobs by IDs: {}", e)))?;
            
        let mut jobs = Vec::new();
        
        for row in rows {
            let job = self.row_to_job(&row)?;
            jobs.push(job);
        }
        
        Ok(jobs)
    }
    
    /// Reset jobs that have been acknowledged by the worker but not completed within the timeout
    pub async fn reset_stale_acknowledged_jobs(&self, timeout_threshold_seconds: u64) -> AppResult<u32> {
        let timestamp = get_timestamp();
        let timeout_ms = timeout_threshold_seconds as i64 * 1000;
        let threshold_time = timestamp - timeout_ms;
        
        let result = sqlx::query(
            r#"
            UPDATE background_jobs
            SET status = $1, updated_at = $2
            WHERE status = $3
            AND updated_at < $4
            "#)
            .bind(JobStatus::Queued.to_string())
            .bind(timestamp)
            .bind(JobStatus::AcknowledgedByWorker.to_string())
            .bind(threshold_time)
            .execute(&*self.pool)
            .await
            .map_err(|e| AppError::DatabaseError(format!("Failed to reset stale jobs: {}", e)))?;
            
        Ok(result.rows_affected() as u32)
    }
    
    /// Cancel all active jobs for a session, except implementation plans
    pub async fn cancel_session_jobs(&self, session_id: &str) -> AppResult<usize> {
        let current_ts = get_timestamp();
        
        // Update all active jobs for the session to 'canceled', but exclude implementation plans
        let result = sqlx::query(
            r#"
            UPDATE background_jobs
            SET status = $1, 
                error_message = 'Canceled due to session action', 
                updated_at = $2, 
                end_time = $3
            WHERE session_id = $4
            AND status IN ($5, $6, $7, $8, $9, $10)
            AND task_type <> $11
            "#)
            .bind(JobStatus::Canceled.to_string())
            .bind(current_ts)
            .bind(current_ts)
            .bind(session_id)
            .bind(JobStatus::Created.to_string())
            .bind(JobStatus::Running.to_string())
            .bind(JobStatus::Queued.to_string())
            .bind(JobStatus::AcknowledgedByWorker.to_string())
            .bind(JobStatus::Idle.to_string())
            .bind(JobStatus::Preparing.to_string())
            .bind(TaskType::ImplementationPlan.to_string())
            .execute(&*self.pool)
            .await
            .map_err(|e| AppError::DatabaseError(format!("Failed to cancel session jobs: {}", e)))?;
            
        Ok(result.rows_affected() as usize)
    }
    
    /// Delete all completed jobs
    pub async fn clear_all_completed_jobs(&self) -> AppResult<usize> {
        // Delete completed, failed, or canceled jobs (excluding implementation plans)
        let result = sqlx::query("DELETE FROM background_jobs WHERE status IN ($1, $2, $3) AND task_type <> $4")
            .bind(JobStatus::Completed.to_string())
            .bind(JobStatus::Failed.to_string())
            .bind(JobStatus::Canceled.to_string())
            .bind(crate::models::TaskType::ImplementationPlan.to_string())
            .execute(&*self.pool)
            .await
            .map_err(|e| AppError::DatabaseError(format!("Failed to delete all completed jobs: {}", e)))?;
            
        Ok(result.rows_affected() as usize)
    }
    
    /// Delete completed jobs for a specific session
    pub async fn clear_completed_jobs_for_session(&self, session_id: &str) -> AppResult<usize> {
        // Delete completed, failed, or canceled jobs for the session (excluding implementation plans)
        let result = sqlx::query("DELETE FROM background_jobs WHERE session_id = $1 AND status IN ($2, $3, $4) AND task_type <> $5")
            .bind(session_id)
            .bind(JobStatus::Completed.to_string())
            .bind(JobStatus::Failed.to_string())
            .bind(JobStatus::Canceled.to_string())
            .bind(crate::models::TaskType::ImplementationPlan.to_string())
            .execute(&*self.pool)
            .await
            .map_err(|e| AppError::DatabaseError(format!("Failed to delete completed jobs for session: {}", e)))?;
            
        Ok(result.rows_affected() as usize)
    }
    
    /// Get jobs by a specific metadata field value (for workflow management)
    pub async fn get_jobs_by_metadata_field(&self, field_name: &str, field_value: &str) -> AppResult<Vec<BackgroundJob>> {
        let query = format!(
            r#"
            SELECT * FROM background_jobs
            WHERE json_extract(metadata, '$.{}') = $1
            ORDER BY created_at ASC
            "#,
            field_name
        );
        
        let rows = sqlx::query(&query)
            .bind(field_value)
            .fetch_all(&*self.pool)
            .await
            .map_err(|e| AppError::DatabaseError(format!("Failed to fetch jobs by metadata field: {}", e)))?;
            
        let mut jobs = Vec::new();
        
        for row in rows {
            let job = self.row_to_job(&row)?;
            jobs.push(job);
        }
        
        Ok(jobs)
    }

    /// Get jobs by status
    pub async fn get_jobs_by_status(&self, statuses: &[JobStatus]) -> AppResult<Vec<BackgroundJob>> {
        if statuses.is_empty() {
            return Ok(Vec::new());
        }
        
        // Build query with IN clause for multiple statuses
        let placeholders: Vec<String> = (1..=statuses.len()).map(|i| format!("${}", i)).collect();
        let query = format!(
            "SELECT * FROM background_jobs WHERE status IN ({}) ORDER BY created_at DESC",
            placeholders.join(", ")
        );
        
        let mut query_builder = sqlx::query(&query);
        for status in statuses {
            query_builder = query_builder.bind(status.to_string());
        }
        
        let rows = query_builder
            .fetch_all(&*self.pool)
            .await
            .map_err(|e| AppError::DatabaseError(format!("Failed to fetch jobs by status: {}", e)))?;
            
        let mut jobs = Vec::new();
        
        for row in rows {
            let job = self.row_to_job(&row)?;
            jobs.push(job);
        }
        
        Ok(jobs)
    }
    
    /// Validate cost consistency between database and metadata for a job
    /// This method helps ensure cost data integrity across different storage locations
    pub async fn validate_job_cost_consistency(&self, job_id: &str) -> AppResult<bool> {
        let job = self.get_job_by_id(job_id).await?
            .ok_or_else(|| AppError::NotFoundError(format!("Job {} not found", job_id)))?;
        
        let db_cost = job.actual_cost;
        
        let metadata_cost = if let Some(metadata_str) = &job.metadata {
            if let Ok(metadata_json) = serde_json::from_str::<Value>(metadata_str) {
                metadata_json.get("task_data")
                    .and_then(|task_data| task_data.get("actual_cost"))
                    .and_then(|v| v.as_f64())
            } else {
                None
            }
        } else {
            None
        };
        
        match (db_cost, metadata_cost) {
            (Some(db), Some(meta)) => {
                let is_consistent = (db - meta).abs() < f64::EPSILON;
                if !is_consistent {
                    warn!("Cost inconsistency detected in job {}: db=${:.6}, metadata=${:.6}", 
                          job_id, db, meta);
                }
                Ok(is_consistent)
            },
            (Some(_), None) => {
                debug!("Job {} has cost in database but not in metadata", job_id);
                Ok(true) // Not necessarily inconsistent
            },
            (None, Some(_)) => {
                debug!("Job {} has cost in metadata but not in database", job_id);
                Ok(true) // Not necessarily inconsistent
            },
            (None, None) => {
                debug!("Job {} has no cost data in either location", job_id);
                Ok(true)
            }
        }
    }
    
    /// Get total cost for jobs in a specific session
    /// Useful for session-based billing and cost tracking
    pub async fn get_session_total_cost(&self, session_id: &str) -> AppResult<f64> {
        let jobs = self.get_jobs_by_session_id(session_id).await?;
        let total_cost = jobs.iter()
            .filter_map(|job| job.actual_cost)
            .sum::<f64>();
        
        info!("Session {} total cost: ${:.6} across {} jobs", 
              session_id, total_cost, jobs.len());
        
        Ok(total_cost)
    }
    
    /// Update job cost in both database and metadata for consistency
    /// This method ensures cost is properly synchronized across storage locations
    pub async fn update_job_cost(&self, job_id: &str, cost: f64) -> AppResult<()> {
        // First get the current job to preserve existing metadata
        let job = self.get_job_by_id(job_id).await?
            .ok_or_else(|| AppError::NotFoundError(format!("Job {} not found", job_id)))?;
        
        // Update metadata to include the cost
        let updated_metadata = if let Some(metadata_str) = &job.metadata {
            if let Ok(mut metadata_json) = serde_json::from_str::<Value>(metadata_str) {
                if let Some(task_data) = metadata_json.get_mut("task_data") {
                    if let serde_json::Value::Object(task_map) = task_data {
                        task_map.insert("actual_cost".to_string(), serde_json::json!(cost));
                    }
                }
                serde_json::to_string(&metadata_json)
                    .map_err(|e| AppError::SerializationError(format!("Failed to serialize metadata: {}", e)))?
            } else {
                // Invalid JSON, create new metadata with cost
                serde_json::to_string(&serde_json::json!({
                    "task_data": {
                        "actual_cost": cost
                    }
                })).unwrap()
            }
        } else {
            // No existing metadata, create new
            serde_json::to_string(&serde_json::json!({
                "task_data": {
                    "actual_cost": cost
                }
            })).unwrap()
        };
        
        // Update both database cost field and metadata
        let now = get_timestamp();
        sqlx::query(
            "UPDATE background_jobs SET actual_cost = $1, metadata = $2, updated_at = $3 WHERE id = $4")
            .bind(cost)
            .bind(updated_metadata)
            .bind(now)
            .bind(job_id)
            .execute(&*self.pool)
            .await
            .map_err(|e| AppError::DatabaseError(format!("Failed to update job cost: {}", e)))?;
        
        info!("Updated cost for job {} to ${:.6} in both database and metadata", job_id, cost);
        
        Ok(())
    }
}