use super::base::BackgroundJobRepository;
use crate::error::{AppError, AppResult};
use crate::events::job_events::*;
use crate::models::JobStatus;
use crate::utils::get_timestamp;
use log::{debug, info, warn};
use serde_json::{Value, json};
use sqlx::{Row, Sqlite};
use std::str::FromStr;
use tauri::Emitter;

impl BackgroundJobRepository {
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
        cache_write_tokens: Option<i64>,
        cache_read_tokens: Option<i64>,
    ) -> AppResult<()> {
        let now = get_timestamp();

        // Log cost information for debugging
        if let Some(cost) = actual_cost {
            info!(
                "Marking job {} as completed with cost: ${:.6}",
                job_id, cost
            );
        } else {
            debug!("Marking job {} as completed without cost", job_id);
        }

        // Verify cost consistency between metadata and parameter
        if let Some(metadata_str) = metadata {
            if let Ok(metadata_json) = serde_json::from_str::<Value>(metadata_str) {
                let metadata_cost = metadata_json
                    .get("task_data")
                    .and_then(|task_data| task_data.get("actual_cost"))
                    .and_then(|v| v.as_f64());

                if let (Some(param_cost), Some(meta_cost)) = (actual_cost, metadata_cost) {
                    if (param_cost - meta_cost).abs() > f64::EPSILON {
                        warn!(
                            "Cost mismatch in job {}: parameter=${:.6}, metadata=${:.6}",
                            job_id, param_cost, meta_cost
                        );
                    }
                }
            }
        }

        // Build the SQL dynamically based on which parameters are provided
        let mut final_query = String::from(
            "UPDATE background_jobs SET status = $1, response = $2, updated_at = $3, end_time = $4",
        );
        let mut param_index = 5;

        // If actual_cost is provided, also set is_finalized to true
        if actual_cost.is_some() {
            final_query.push_str(", is_finalized = true");
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

        if cache_write_tokens.is_some() {
            final_query.push_str(&format!(", cache_write_tokens = ${}", param_index));
            param_index += 1;
        }

        if cache_read_tokens.is_some() {
            final_query.push_str(&format!(", cache_read_tokens = ${}", param_index));
            param_index += 1;
        }

        // Add the WHERE clause
        final_query.push_str(&format!(" WHERE id = ${}", param_index));

        // Create and execute the query
        let mut query_obj = sqlx::query::<Sqlite>(&final_query);

        // Add the required bindings
        query_obj = query_obj
            .bind(JobStatus::Completed.to_string())
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

        if let Some(cwt) = cache_write_tokens {
            query_obj = query_obj.bind(cwt);
        }

        if let Some(crt) = cache_read_tokens {
            query_obj = query_obj.bind(crt);
        }

        // Bind job_id last
        query_obj = query_obj.bind(job_id);

        // Execute the query
        let result = query_obj.execute(&*self.pool).await.map_err(|e| {
            AppError::DatabaseError(format!("Failed to mark job as completed: {}", e))
        })?;

        if result.rows_affected() > 0 {
            debug!("Successfully marked job {} as completed", job_id);
            if let Some(cost) = actual_cost {
                debug!("Cost ${:.6} stored in database for job {}", cost, job_id);
            }

            // Emit granular events
            if let Some(app_handle) = &self.app_handle {
                // Emit status changed event
                emit_job_status_changed(
                    app_handle,
                    JobStatusChangedEvent {
                        job_id: job_id.to_string(),
                        status: JobStatus::Completed.to_string(),
                        start_time: None,
                        end_time: Some(now),
                        sub_status_message: None,
                    },
                );

                // Emit finalized event if cost is provided
                if let Some(cost) = actual_cost {
                    emit_job_finalized(
                        app_handle,
                        JobFinalizedEvent {
                            job_id: job_id.to_string(),
                            status: JobStatus::Completed.to_string(),
                            response: Some(response.to_string()),
                            actual_cost: cost,
                            tokens_sent: tokens_sent,
                            tokens_received: tokens_received,
                            cache_read_tokens: cache_read_tokens.map(|v| v as i32),
                            cache_write_tokens: cache_write_tokens.map(|v| v as i32),
                        },
                    );
                }
            }
        } else {
            warn!("No rows affected when marking job {} as completed", job_id);
        }

        Ok(())
    }

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
        )
        .await
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
        let mut final_query =
            String::from("UPDATE background_jobs SET response = $1, updated_at = $2");

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
        query_obj.execute(&*self.pool).await.map_err(|e| {
            AppError::DatabaseError(format!("Failed to update job response: {}", e))
        })?;

        Ok(())
    }
}
