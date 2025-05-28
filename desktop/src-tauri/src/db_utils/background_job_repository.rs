use std::sync::Arc;
use std::str::FromStr;
use sqlx::{sqlite::SqliteRow, Row, SqlitePool, Sqlite};
use crate::error::{AppError, AppResult};
use crate::models::{BackgroundJob, JobStatus, TaskType};
use crate::utils::get_timestamp;
use log::{info, warn, debug};

#[derive(Debug)]
pub struct BackgroundJobRepository {
    pool: Arc<SqlitePool>,
}

impl BackgroundJobRepository {
    pub fn new(pool: Arc<SqlitePool>) -> Self {
        Self { pool }
    }
    
    /// Cancel a specific job by ID
    pub async fn cancel_job(&self, job_id: &str) -> AppResult<()> {
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
        
        // Update the job status to canceled in the database
        let now = get_timestamp();
        sqlx::query(
            r#"
            UPDATE background_jobs SET
                status = $1,
                error_message = 'Canceled by user',
                updated_at = $2,
                end_time = $3,
                last_update = $4
            WHERE id = $5 AND status NOT IN ($6, $7, $8)
            "#)
            .bind(JobStatus::Canceled.to_string())
            .bind(now)
            .bind(now)
            .bind(now)
            .bind(job_id)
            .bind(JobStatus::Completed.to_string())
            .bind(JobStatus::Failed.to_string())
            .bind(JobStatus::Canceled.to_string())
            .execute(&*self.pool)
            .await
            .map_err(|e| AppError::DatabaseError(format!("Failed to update job {} to canceled: {}", job_id, e)))?;

        info!("Job {} marked as canceled in the database.", job_id);
        Ok(())
    }
    
    /// Append a text chunk to the response field of a job and update related fields.
    /// This method is used for streaming responses from API clients.
    /// 
    /// # Arguments
    /// * `job_id` - The ID of the job to update
    /// * `chunk` - The text chunk to append to the response
    /// * `new_tokens_received` - The number of tokens in this chunk
    /// * `current_total_response_length` - The current length of the accumulated response (characters)
    pub async fn append_to_job_response(&self, job_id: &str, chunk: &str, new_tokens_received: i32, current_total_response_length: i32) -> AppResult<()> {
        // First check if the job exists and is in running status
        let job = self.get_job_by_id(job_id).await?
            .ok_or_else(|| AppError::DatabaseError(format!("Job not found: {}", job_id)))?;
            
        // Only append to running jobs
        if job.status != "running" {
            return Err(AppError::DatabaseError(format!("Cannot append to job with status {}", job.status)));
        }
        
        // Get current timestamp
        let now = get_timestamp();
        
        // Build the new response by appending the chunk
        let current_response = job.response.unwrap_or_default();
        let new_response = format!("{}{}", current_response, chunk);
        
        // Calculate token counts
        let tokens_received = job.tokens_received.unwrap_or(0) + new_tokens_received;
        let total_tokens = job.total_tokens.unwrap_or(0) + new_tokens_received;
        
        // Process metadata updates
        let metadata_json = if let Some(metadata_str) = job.metadata {
            let mut metadata: serde_json::Value = serde_json::from_str(&metadata_str)
                .map_err(|e| AppError::DatabaseError(format!("Failed to parse job metadata: {}", e)))?;
            
            // Update streaming metadata fields
            metadata["isStreaming"] = serde_json::json!(true);
            metadata["lastStreamUpdateTime"] = serde_json::json!(now);
            metadata["responseLength"] = serde_json::json!(current_total_response_length);
            metadata["totalTokens"] = serde_json::json!(total_tokens);
            metadata["tokensReceived"] = serde_json::json!(tokens_received);
            
            // Calculate streaming progress if max tokens is available
            if let Some(max_tokens) = job.max_output_tokens {
                // Calculate progress as a percentage (0-100)
                let progress = if max_tokens > 0 {
                    (tokens_received as f32 / max_tokens as f32) * 100.0
                } else {
                    0.0
                };
                
                // Cap progress at 100%
                let capped_progress = progress.min(100.0);
                metadata["streamProgress"] = serde_json::json!(capped_progress);
                
                // Add estimated time remaining if we have enough data
                if progress > 5.0 && metadata.get("streamStartTime").is_some() {
                    let start_time = metadata["streamStartTime"].as_i64().unwrap_or(now);
                    let elapsed_ms = now - start_time;
                    
                    if elapsed_ms > 0 && progress > 0.0 {
                        // Estimate time remaining based on progress so far
                        let total_estimated_ms = (elapsed_ms as f32 / progress) * 100.0;
                        let remaining_ms = total_estimated_ms - (elapsed_ms as f32);
                        
                        metadata["estimatedRemainingMs"] = serde_json::json!(remaining_ms as i64);
                    }
                }
            }
            
            // Add initial streamStartTime if not present
            if metadata.get("streamStartTime").is_none() {
                metadata["streamStartTime"] = serde_json::json!(now);
            }
            
            metadata
        } else {
            // Create new metadata object if none exists
            serde_json::json!({
                "isStreaming": true,
                "streamStartTime": now,
                "lastStreamUpdateTime": now,
                "responseLength": current_total_response_length,
                "totalTokens": total_tokens,
                "tokensReceived": tokens_received,
                "streamProgress": 0.0, // Default progress when max_tokens is unknown
            })
        };
        
        // Convert metadata to string
        let metadata_str = metadata_json.to_string();
        
        // Update the job in the database
        sqlx::query(
            r#"
            UPDATE background_jobs SET
                response = $1, 
                tokens_received = $2,
                total_tokens = $3,
                chars_received = $4,
                updated_at = $5,
                last_update = $6,
                metadata = $7
            WHERE id = $8 AND status = $9
            "#)
            .bind(new_response)
            .bind(tokens_received)
            .bind(total_tokens)
            .bind(current_total_response_length)
            .bind(now)
            .bind(now)
            .bind(metadata_str)
            .bind(job_id)
            .bind(JobStatus::Running.to_string())
            .execute(&*self.pool)
            .await
            .map_err(|e| AppError::DatabaseError(format!("Failed to append to job response: {}", e)))?;
            
        Ok(())
    }
    
    
    /// Delete job history based on days_to_keep
    pub async fn clear_job_history(&self, days_to_keep: i64) -> AppResult<()> {
        let current_ts = get_timestamp();
        
        if days_to_keep == -1 {
            // Delete all completed, failed, or canceled jobs
            sqlx::query("DELETE FROM background_jobs WHERE status IN ($1, $2, $3)")
                .bind(JobStatus::Completed.to_string())
                .bind(JobStatus::Failed.to_string())
                .bind(JobStatus::Canceled.to_string())
                .execute(&*self.pool)
                .await
                .map_err(|e| AppError::DatabaseError(format!("Failed to delete job history: {}", e)))?;
        } else if days_to_keep > 0 {
            // Delete jobs older than specified days
            let target_date_ts = current_ts - (days_to_keep * 24 * 60 * 60 * 1000); // Convert days to milliseconds
            
            sqlx::query("DELETE FROM background_jobs WHERE status IN ($1, $2, $3) AND created_at < $4")
                .bind(JobStatus::Completed.to_string())
                .bind(JobStatus::Failed.to_string())
                .bind(JobStatus::Canceled.to_string())
                .bind(target_date_ts)
                .execute(&*self.pool)
                .await
                .map_err(|e| AppError::DatabaseError(format!("Failed to delete job history: {}", e)))?;
        } else {
            // Delete jobs older than 90 days (default cleanup)
            let ninety_days_ago_ts = current_ts - (90 * 24 * 60 * 60 * 1000); // Convert days to milliseconds
            
            sqlx::query("DELETE FROM background_jobs WHERE status IN ($1, $2, $3) AND created_at < $4")
                .bind(JobStatus::Completed.to_string())
                .bind(JobStatus::Failed.to_string())
                .bind(JobStatus::Canceled.to_string())
                .bind(ninety_days_ago_ts)
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
                    WHEN status IN ('running', 'pending', 'queued', 'acknowledged_by_worker', 'created', 'idle') THEN 0
                    ELSE 1
                END,
                CASE 
                    WHEN status = 'running' THEN 0
                    WHEN status = 'queued' THEN 1
                    WHEN status = 'pending' THEN 2
                    WHEN status = 'acknowledged_by_worker' THEN 3
                    WHEN status = 'created' THEN 4
                    WHEN status = 'idle' THEN 5
                    WHEN status = 'completed' THEN 6
                    WHEN status = 'failed' THEN 7
                    WHEN status = 'canceled' THEN 8
                    ELSE 9
                END,
                updated_at DESC
            LIMIT 500
            "#)
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
                id, session_id, api_type, task_type, status, 
                created_at, updated_at, start_time, end_time, last_update,
                prompt, response, project_directory, tokens_sent, tokens_received,
                total_tokens, chars_received, status_message, error_message,
                model_used, max_output_tokens, temperature, include_syntax,
                metadata
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24)
            "#)
            .bind(&job.id)
            .bind(&job.session_id)
            .bind(&job.api_type)
            .bind(&job.task_type)
            .bind(&job.status)
            .bind(job.created_at)
            .bind(job.updated_at)
            .bind(job.start_time)
            .bind(job.end_time)
            .bind(job.last_update)
            .bind(&job.prompt)
            .bind(&job.response)
            .bind(&job.project_directory)
            .bind(job.tokens_sent.map(|v| v as i64))
            .bind(job.tokens_received.map(|v| v as i64))
            .bind(job.total_tokens.map(|v| v as i64))
            .bind(job.chars_received.map(|v| v as i64))
            .bind(&job.status_message)
            .bind(&job.error_message)
            .bind(&job.model_used)
            .bind(job.max_output_tokens.map(|v| v as i64))
            .bind(job.temperature.map(|v| v as f64))
            .bind(job.include_syntax.map(|v| if v { 1i64 } else { 0i64 }))
            .bind(&job.metadata)
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
                api_type = $2,
                task_type = $3,
                status = $4,
                updated_at = $5,
                start_time = $6,
                end_time = $7,
                last_update = $8,
                prompt = $9,
                response = $10,
                project_directory = $11,
                tokens_sent = $12,
                tokens_received = $13,
                total_tokens = $14,
                chars_received = $15,
                status_message = $16,
                error_message = $17,
                model_used = $18,
                max_output_tokens = $19,
                temperature = $20,
                include_syntax = $21,
                metadata = $22
            WHERE id = $23
            "#)
            .bind(&job.session_id)
            .bind(&job.api_type)
            .bind(&job.task_type)
            .bind(&job.status)
            .bind(job.updated_at)
            .bind(job.start_time)
            .bind(job.end_time)
            .bind(job.last_update)
            .bind(&job.prompt)
            .bind(&job.response)
            .bind(&job.project_directory)
            .bind(job.tokens_sent.map(|v| v as i64))
            .bind(job.tokens_received.map(|v| v as i64))
            .bind(job.total_tokens.map(|v| v as i64))
            .bind(job.chars_received.map(|v| v as i64))
            .bind(&job.status_message)
            .bind(&job.error_message)
            .bind(&job.model_used)
            .bind(job.max_output_tokens.map(|v| v as i64))
            .bind(job.temperature.map(|v| v as f64))
            .bind(job.include_syntax.map(|v| if v { 1i64 } else { 0i64 }))
            .bind(&job.metadata)
            .bind(&job.id)
            .execute(&*self.pool)
            .await
            .map_err(|e| AppError::DatabaseError(format!("Failed to update job: {}", e)))?;
            
        Ok(())
    }
    
    /// Update job status
    pub async fn update_job_status(&self, job_id: &str, status: &str, message: Option<&str>) -> AppResult<()> {
        let now = get_timestamp();
        
        let result = if let Some(msg) = message {
            sqlx::query("UPDATE background_jobs SET status = $1, updated_at = $2, status_message = $3 WHERE id = $4")
                .bind(status)
                .bind(now)
                .bind(msg)
                .bind(job_id)
                .execute(&*self.pool)
                .await
        } else {
            sqlx::query("UPDATE background_jobs SET status = $1, updated_at = $2 WHERE id = $3")
                .bind(status)
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
        status: &str, 
        message: Option<&str>,
        metadata_json: String
    ) -> AppResult<()> {
        let now = get_timestamp();
        
        let result = if let Some(msg) = message {
            sqlx::query("UPDATE background_jobs SET status = $1, updated_at = $2, status_message = $3, metadata = $4 WHERE id = $5")
                .bind(status)
                .bind(now)
                .bind(msg)
                .bind(metadata_json)
                .bind(job_id)
                .execute(&*self.pool)
                .await
        } else {
            sqlx::query("UPDATE background_jobs SET status = $1, updated_at = $2, metadata = $3 WHERE id = $4")
                .bind(status)
                .bind(now)
                .bind(metadata_json)
                .bind(job_id)
                .execute(&*self.pool)
                .await
        };
        
        result.map_err(|e| AppError::DatabaseError(format!("Failed to update job status with metadata: {}", e)))?;
            
        Ok(())
    }
    
    /// Update job completion with model information
    pub async fn update_job_completion_with_model(&self, job_id: &str, response_text: &str, end_time_ts: i64, model_used_str: Option<&str>) -> AppResult<()> {
        let mut job = self.get_job_by_id(job_id).await?
            .ok_or_else(|| AppError::NotFoundError(format!("Job not found: {}", job_id)))?;
        job.status = JobStatus::Completed.to_string();
        job.response = Some(response_text.to_string());
        job.end_time = Some(end_time_ts);
        job.updated_at = Some(end_time_ts);
        if let Some(model) = model_used_str {
            job.model_used = Some(model.to_string());
        }
        // Note: Token counts might need to be passed in or updated separately if available
        self.update_job(&job).await
    }
    
    /// Update job as failed with error message
    pub async fn update_job_failure(&self, job_id: &str, error_msg: &str, end_time_ts: i64) -> AppResult<()> {
        let mut job = self.get_job_by_id(job_id).await?
            .ok_or_else(|| AppError::NotFoundError(format!("Job not found: {}", job_id)))?;
        job.status = JobStatus::Failed.to_string();
        job.error_message = Some(error_msg.to_string());
        job.end_time = Some(end_time_ts);
        job.updated_at = Some(end_time_ts);
        self.update_job(&job).await
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
        total_tokens: Option<i32>,
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
        
        if total_tokens.is_some() {
            final_query.push_str(&format!(", total_tokens = ${}", param_index));
            param_index += 1;
        }
        
        if chars_received.is_some() {
            final_query.push_str(&format!(", chars_received = ${}", param_index));
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
        
        if let Some(tt) = total_tokens {
            query_obj = query_obj.bind(tt as i64);
        }
        
        if let Some(cr) = chars_received {
            query_obj = query_obj.bind(cr as i64);
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
    
    /// Update job status to running
    pub async fn update_job_status_running(&self, job_id: &str, status_message: Option<&str>) -> AppResult<()> {
        let now = get_timestamp();
        
        if let Some(msg) = status_message {
            sqlx::query(
                "UPDATE background_jobs SET status = $1, updated_at = $2, start_time = $3, status_message = $4 WHERE id = $5"
            )
            .bind(JobStatus::Running.to_string())
            .bind(now)
            .bind(now)
            .bind(msg)
            .bind(job_id)
            .execute(&*self.pool)
            .await
            .map_err(|e| AppError::DatabaseError(format!("Failed to update job status to running: {}", e)))?;
        } else {
            sqlx::query(
                "UPDATE background_jobs SET status = $1, updated_at = $2, start_time = $3 WHERE id = $4"
            )
            .bind(JobStatus::Running.to_string())
            .bind(now)
            .bind(now)
            .bind(job_id)
            .execute(&*self.pool)
            .await
            .map_err(|e| AppError::DatabaseError(format!("Failed to update job status to running: {}", e)))?;
        }
        
        Ok(())
    }
    
    /// Update job status to failed
    pub async fn update_job_status_failed(&self, job_id: &str, error_message: &str) -> AppResult<()> {
        let now = get_timestamp();
        
        sqlx::query(
            r#"
            UPDATE background_jobs 
            SET status = $1, 
                error_message = $2, 
                updated_at = $3, 
                end_time = $4
            WHERE id = $5
            "#)
            .bind(JobStatus::Failed.to_string())
            .bind(error_message)
            .bind(now)
            .bind(now)
            .bind(job_id)
            .execute(&*self.pool)
            .await
            .map_err(|e| AppError::DatabaseError(format!("Failed to update job status to failed: {}", e)))?;
            
        Ok(())
    }
    
    /// Update job status to completed with model information
    pub async fn update_job_status_completed(
        &self,
        job_id: &str,
        response: &str,
        model_used: Option<&str>,
        tokens_sent: Option<i32>,
        tokens_received: Option<i32>,
        total_tokens: Option<i32>,
        chars_received: Option<i32>,
    ) -> AppResult<()> {
        let now = get_timestamp();
        
        // Start building the query
        let mut final_query = String::from(
            "UPDATE background_jobs SET status = $1, response = $2, updated_at = $3, end_time = $4"
        );
        
        // We'll use this counter to keep track of the parameter index
        let mut param_index = 5;
        
        if model_used.is_some() {
            final_query.push_str(&format!(", model_used = ${}", param_index));
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
        
        if total_tokens.is_some() {
            final_query.push_str(&format!(", total_tokens = ${}", param_index));
            param_index += 1;
        }
        
        if chars_received.is_some() {
            final_query.push_str(&format!(", chars_received = ${}", param_index));
            param_index += 1;
        }
        
        // Add the WHERE clause
        final_query.push_str(&format!(" WHERE id = ${}", param_index));
        
        // Create a new query with the database type specified
        let mut query_obj = sqlx::query::<Sqlite>(&final_query);
        
        // Add the initial required bindings
        query_obj = query_obj.bind(JobStatus::Completed.to_string())
                            .bind(response)
                            .bind(now)
                            .bind(now);
        
        // Add conditional bindings
        if let Some(model) = model_used {
            query_obj = query_obj.bind(model);
        }
        
        if let Some(ts) = tokens_sent {
            query_obj = query_obj.bind(ts as i64);
        }
        
        if let Some(tr) = tokens_received {
            query_obj = query_obj.bind(tr as i64);
        }
        
        if let Some(tt) = total_tokens {
            query_obj = query_obj.bind(tt as i64);
        }
        
        if let Some(cr) = chars_received {
            query_obj = query_obj.bind(cr as i64);
        }
        
        // Bind job_id last
        query_obj = query_obj.bind(job_id);
        
        // Execute the query
        query_obj
            .execute(&*self.pool)
            .await
            .map_err(|e| AppError::DatabaseError(format!("Failed to update job status to completed: {}", e)))?;
            
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
    fn row_to_job(&self, row: &SqliteRow) -> AppResult<BackgroundJob> {
        let id: String = row.try_get::<'_, String, _>("id")?;
        let session_id: String = row.try_get::<'_, String, _>("session_id")?;
        let api_type: String = row.try_get::<'_, String, _>("api_type")?;
        let task_type: String = row.try_get::<'_, String, _>("task_type")?;
        let status: String = row.try_get::<'_, String, _>("status")?;
        let created_at: i64 = row.try_get::<'_, i64, _>("created_at")?;
        
        let updated_at: Option<i64> = row.try_get::<'_, Option<i64>, _>("updated_at").unwrap_or(None);
        let start_time: Option<i64> = row.try_get::<'_, Option<i64>, _>("start_time").unwrap_or(None);
        let end_time: Option<i64> = row.try_get::<'_, Option<i64>, _>("end_time").unwrap_or(None);
        let last_update: Option<i64> = row.try_get::<'_, Option<i64>, _>("last_update").unwrap_or(None);
        
        let prompt: String = row.try_get::<'_, String, _>("prompt")?;
        
        let response: Option<String> = row.try_get::<'_, Option<String>, _>("response").unwrap_or(None);
        let project_directory: Option<String> = row.try_get::<'_, Option<String>, _>("project_directory").unwrap_or(None);
        let tokens_sent: Option<i32> = row.try_get::<'_, Option<i64>, _>("tokens_sent").map(|v| v.map(|val| val as i32)).unwrap_or(None);
        let tokens_received: Option<i32> = row.try_get::<'_, Option<i64>, _>("tokens_received").map(|v| v.map(|val| val as i32)).unwrap_or(None);
        let total_tokens: Option<i32> = row.try_get::<'_, Option<i64>, _>("total_tokens").map(|v| v.map(|val| val as i32)).unwrap_or(None);
        let chars_received: Option<i32> = row.try_get::<'_, Option<i64>, _>("chars_received").map(|v| v.map(|val| val as i32)).unwrap_or(None);
        let status_message: Option<String> = row.try_get::<'_, Option<String>, _>("status_message").unwrap_or(None);
        let error_message: Option<String> = row.try_get::<'_, Option<String>, _>("error_message").unwrap_or(None);
        let model_used: Option<String> = row.try_get::<'_, Option<String>, _>("model_used").unwrap_or(None);
        let max_output_tokens: Option<i32> = row.try_get::<'_, Option<i64>, _>("max_output_tokens").map(|v| v.map(|val| val as i32)).unwrap_or(None);
        let temperature: Option<f32> = row.try_get::<'_, Option<f64>, _>("temperature").map(|v| v.map(|val| val as f32)).unwrap_or(None);
        let include_syntax: Option<bool> = row.try_get::<'_, Option<i64>, _>("include_syntax").map(|v| v.map(|val| val == 1)).unwrap_or(None);
        let metadata: Option<String> = row.try_get::<'_, Option<String>, _>("metadata").unwrap_or(None);
        
        Ok(BackgroundJob {
            id,
            session_id,
            api_type,
            task_type,
            status,
            created_at,
            updated_at,
            start_time,
            end_time,
            last_update,
            prompt,
            response,
            project_directory,
            tokens_sent,
            tokens_received,
            total_tokens,
            chars_received,
            status_message,
            error_message,
            model_used,
            max_output_tokens,
            temperature,
            include_syntax,
            metadata,
        })
    }
    
    /// Get jobs from the database that are queued and have worker-specific metadata
    /// These jobs will be atomically updated to have 'acknowledged_by_worker' status
    pub async fn get_and_acknowledge_queued_jobs_for_worker(&self, limit: u32) -> AppResult<Vec<BackgroundJob>> {
        // Find jobs with status='queued' and where metadata contains jobTypeForWorker
        let rows = sqlx::query(
            r#"
            SELECT * FROM background_jobs 
            WHERE status = 'queued'
            AND json_extract(metadata, '$.jobTypeForWorker') IS NOT NULL
            ORDER BY 
                CASE 
                    WHEN json_extract(metadata, '$.jobPriorityForWorker') = 'HIGH' THEN 1
                    WHEN json_extract(metadata, '$.jobPriorityForWorker') = 'LOW' THEN 3
                    ELSE 2
                END,
                created_at ASC
            LIMIT $1
            "#)
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
                "UPDATE background_jobs SET status = 'acknowledged_by_worker', updated_at = $1 WHERE id = $2 AND status = 'queued'")
                .bind(timestamp)
                .bind(job_id)
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
        // Delete completed, failed, or canceled jobs
        let result = sqlx::query("DELETE FROM background_jobs WHERE status IN ($1, $2, $3)")
            .bind(JobStatus::Completed.to_string())
            .bind(JobStatus::Failed.to_string())
            .bind(JobStatus::Canceled.to_string())
            .execute(&*self.pool)
            .await
            .map_err(|e| AppError::DatabaseError(format!("Failed to delete all completed jobs: {}", e)))?;
            
        Ok(result.rows_affected() as usize)
    }
    
    /// Delete completed jobs for a specific session
    pub async fn clear_completed_jobs_for_session(&self, session_id: &str) -> AppResult<usize> {
        // Delete completed, failed, or canceled jobs for the session
        let result = sqlx::query("DELETE FROM background_jobs WHERE session_id = $1 AND status IN ($2, $3, $4)")
            .bind(session_id)
            .bind(JobStatus::Completed.to_string())
            .bind(JobStatus::Failed.to_string())
            .bind(JobStatus::Canceled.to_string())
            .execute(&*self.pool)
            .await
            .map_err(|e| AppError::DatabaseError(format!("Failed to delete completed jobs for session: {}", e)))?;
            
        Ok(result.rows_affected() as usize)
    }
}