use super::base::BackgroundJobRepository;
use crate::error::{AppError, AppResult};
use crate::events::job_events::*;
use crate::models::{JobStatus, TaskType};
use crate::utils::get_timestamp;
use log::{debug, info, warn};
use serde_json::{Value, json};
use sqlx::{Row, Sqlite};
use std::str::FromStr;
use tauri::Emitter;

impl BackgroundJobRepository {
    /// Cancel a specific job by ID
    ///
    /// This is the canonical method for cancelling individual jobs. For workflow jobs,
    /// consider using WorkflowOrchestrator::update_job_status() to allow proper
    /// workflow state management and cancellation handling.
    pub async fn cancel_job(&self, job_id: &str, reason: &str) -> AppResult<()> {
        // Fetch the job to check its current status
        let job = self
            .get_job_by_id(job_id)
            .await?
            .ok_or_else(|| AppError::NotFoundError(format!("Job with ID {} not found", job_id)))?;

        // If job is already in a terminal state, no action needed
        let current_status = JobStatus::from_str(&job.status).unwrap_or(JobStatus::Idle);
        if current_status.is_terminal() {
            info!(
                "Job {} is already in a terminal state: {}",
                job_id, job.status
            );
            return Ok(());
        }

        // Attempt to remove the job from the job queue if it's queued
        match crate::jobs::queue::get_job_queue().await {
            Ok(queue_ref) => {
                // queue_ref is Arc<JobQueue>
                // Call cancel_job on the JobQueue instance
                match queue_ref.cancel_job(job_id.to_string()).await {
                    Ok(true) => info!("Successfully removed job {} from the queue.", job_id),
                    Ok(false) => debug!(
                        "Job {} was not found in the queue (might be running or completed).",
                        job_id
                    ),
                    Err(e) => warn!(
                        "Failed to cancel job {} in queue: {}. Proceeding with DB update.",
                        job_id, e
                    ),
                }
            }
            Err(e) => {
                warn!(
                    "Could not get job queue instance to cancel job {}: {}. Proceeding with DB update.",
                    job_id, e
                );
            }
        }

        // Mark job as canceled
        self.mark_job_canceled(job_id, reason, None).await?;

        Ok(())
    }

    /// Mark a job as canceled with optional reason and cost tracking
    /// Preserves any accumulated cost for proper billing reconciliation
    pub async fn mark_job_canceled(
        &self,
        job_id: &str,
        reason: &str,
        cost: Option<f64>,
    ) -> AppResult<()> {
        let now = get_timestamp();

        // Log cancellation with cost information
        if let Some(cost_value) = cost {
            info!(
                "Marking job {} as canceled with cost: ${:.6}, reason: {}",
                job_id, cost_value, reason
            );
        } else {
            info!(
                "Marking job {} as canceled without cost, reason: {}",
                job_id, reason
            );
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
                "#,
            )
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
                "#,
            )
            .bind(JobStatus::Canceled.to_string())
            .bind(reason)
            .bind(now)
            .bind(now)
            .bind(job_id)
        };

        let result = query.execute(&*self.pool).await.map_err(|e| {
            AppError::DatabaseError(format!("Failed to mark job as canceled: {}", e))
        })?;

        if result.rows_affected() > 0 {
            debug!("Successfully marked job {} as canceled", job_id);
            if let Some(cost_value) = cost {
                debug!(
                    "Cost ${:.6} stored in database for canceled job {}",
                    cost_value, job_id
                );
            }

            // Emit granular events
            if let Some(ref app_handle) = self.app_handle {
                // Emit status changed event
                emit_job_status_changed(
                    app_handle,
                    JobStatusChangedEvent {
                        job_id: job_id.to_string(),
                        status: JobStatus::Canceled.to_string(),
                        start_time: None,
                        end_time: Some(now),
                        sub_status_message: Some(reason.to_string()),
                    },
                );

                // Emit finalized event if cost is provided
                if let Some(cost_value) = cost {
                    emit_job_finalized(
                        app_handle,
                        JobFinalizedEvent {
                            job_id: job_id.to_string(),
                            status: JobStatus::Canceled.to_string(),
                            response: None,
                            actual_cost: cost_value,
                            tokens_sent: None,
                            tokens_received: None,
                            cache_read_tokens: None,
                            cache_write_tokens: None,
                        },
                    );
                }
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
            info!(
                "Marking job {} as canceled with full usage tracking and cost: ${:.6}, reason: {}",
                job_id, cost, reason
            );
        } else {
            info!(
                "Marking job {} as canceled with usage tracking but no cost, reason: {}",
                job_id, reason
            );
        }

        // Build the SQL dynamically based on which parameters are provided
        let mut final_query = String::from(
            "UPDATE background_jobs SET status = $1, error_message = $2, updated_at = $3, end_time = $4",
        );
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
        query_obj = query_obj
            .bind(JobStatus::Canceled.to_string())
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
        let result = query_obj.execute(&*self.pool).await.map_err(|e| {
            AppError::DatabaseError(format!("Failed to mark job as canceled with usage: {}", e))
        })?;

        if result.rows_affected() > 0 {
            debug!(
                "Successfully marked job {} as canceled with usage tracking",
                job_id
            );
            if let Some(cost) = actual_cost {
                debug!(
                    "Cost ${:.6} and usage metrics stored for canceled job {}",
                    cost, job_id
                );
            }
        } else {
            warn!(
                "No rows affected when marking job {} as canceled with usage",
                job_id
            );
        }

        Ok(())
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
            "#,
        )
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
}
