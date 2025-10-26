use super::base::BackgroundJobRepository;
use crate::error::{AppError, AppResult};
use crate::events::job_events::*;
use crate::models::{ErrorDetails, JobStatus};
use crate::utils::get_timestamp;
use log::{debug, info, warn};
use serde_json::{Value, json};
use sqlx::{Row, Sqlite};
use std::str::FromStr;
use tauri::Emitter;

impl BackgroundJobRepository {
    /// Mark a job as failed with error message and optional metadata
    /// Tracks partial cost for failed jobs to maintain cost accounting accuracy
    pub async fn mark_job_failed(
        &self,
        job_id: &str,
        error_message: &str,
        metadata: Option<&str>,
        tokens_sent: Option<i32>,
        tokens_received: Option<i32>,
        model_used: Option<&str>,
        actual_cost: Option<f64>,
    ) -> AppResult<()> {
        let now = get_timestamp();

        let job = self
            .get_job_by_id(job_id)
            .await?
            .ok_or_else(|| AppError::NotFoundError(format!("Job {} not found", job_id)))?;

        // Log failure with cost information for debugging
        if let Some(cost) = actual_cost {
            info!(
                "Marking job {} as failed with partial cost: ${:.6}, error: {}",
                job_id, cost, error_message
            );
        } else {
            info!(
                "Marking job {} as failed without cost, error: {}",
                job_id, error_message
            );
        }

        // Verify cost consistency between metadata and parameter for failed jobs
        if let Some(metadata_str) = metadata {
            if let Ok(metadata_json) = serde_json::from_str::<Value>(metadata_str) {
                let metadata_cost = metadata_json
                    .get("task_data")
                    .and_then(|task_data| task_data.get("actual_cost"))
                    .and_then(|v| v.as_f64());

                if let (Some(param_cost), Some(meta_cost)) = (actual_cost, metadata_cost) {
                    if (param_cost - meta_cost).abs() > f64::EPSILON {
                        warn!(
                            "Cost mismatch in failed job {}: parameter=${:.6}, metadata=${:.6}",
                            job_id, param_cost, meta_cost
                        );
                    }
                }
            }
        }

        // Build the SQL dynamically based on which parameters are provided
        let mut final_query = String::from(
            "UPDATE background_jobs SET status = $1, error_message = $2, updated_at = $3, end_time = $4",
        );
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
        query_obj = query_obj
            .bind(JobStatus::Failed.to_string())
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
                debug!(
                    "Partial cost ${:.6} stored in database for failed job {}",
                    cost, job_id
                );
            }

            // Emit granular events
            if let Some(app_handle) = &self.app_handle {
                // Emit status changed event
                emit_job_status_changed(
                    app_handle,
                    JobStatusChangedEvent {
                        job_id: job_id.to_string(),
                        session_id: job.session_id.clone(),
                        status: JobStatus::Failed.to_string(),
                        start_time: None,
                        end_time: Some(now),
                        sub_status_message: Some(error_message.to_string()),
                    },
                );

                // Emit finalized event if cost is provided (for failed jobs with partial costs)
                if let Some(cost) = actual_cost {
                    emit_job_finalized(
                        app_handle,
                        JobFinalizedEvent {
                            job_id: job_id.to_string(),
                            session_id: job.session_id.clone(),
                            status: JobStatus::Failed.to_string(),
                            response: None,
                            actual_cost: cost,
                            tokens_sent: tokens_sent,
                            tokens_received: tokens_received,
                            cache_read_tokens: None,
                            cache_write_tokens: None,
                        },
                    );
                }
            }
        } else {
            warn!("No rows affected when marking job {} as failed", job_id);
        }

        Ok(())
    }

    /// Update job with detailed error information
    pub async fn update_job_error_details(
        &self,
        job_id: &str,
        error_details: &crate::models::ErrorDetails,
    ) -> AppResult<()> {
        let now = get_timestamp();

        // Serialize error details to JSON
        let error_details_json = serde_json::to_string(error_details)?;

        // Fetch the existing job to get current metadata
        let job = self
            .get_job_by_id(job_id)
            .await?
            .ok_or_else(|| AppError::NotFoundError(format!("Job {} not found", job_id)))?;

        // Parse existing metadata or create new
        let mut metadata_json = if let Some(metadata_str) = &job.metadata {
            serde_json::from_str::<Value>(metadata_str).unwrap_or_else(|_| json!({}))
        } else {
            json!({})
        };

        // Add error details to metadata
        metadata_json["error_details"] = serde_json::from_str::<Value>(&error_details_json)?;

        let updated_metadata = serde_json::to_string(&metadata_json)?;

        // Update the job with error details in metadata
        let query = sqlx::query(
            r#"
            UPDATE background_jobs
            SET metadata = $1,
                updated_at = $2
            WHERE id = $3
            "#,
        )
        .bind(&updated_metadata)
        .bind(now)
        .bind(job_id);

        let result = query.execute(&*self.pool).await?;

        if result.rows_affected() > 0 {
            debug!("Successfully updated error details for job {}", job_id);

            // Emit error details event
            if let Some(app_handle) = &self.app_handle {
                emit_job_error_details(
                    app_handle,
                    JobErrorDetailsEvent {
                        job_id: job_id.to_string(),
                        session_id: job.session_id.clone(),
                        error_details: error_details.clone(),
                    },
                );
            }
        } else {
            warn!(
                "No rows affected when updating error details for job {}",
                job_id
            );
        }

        Ok(())
    }
}
