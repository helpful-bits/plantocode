use super::base::BackgroundJobRepository;
use super::helpers::row_to_job;
use crate::error::{AppError, AppResult};
use crate::events::job_events::*;
use crate::models::BackgroundJob;
use crate::utils::get_timestamp;
use log::{debug, info, warn};
use sqlx::Row;
use serde_json::Value;
use tauri::Emitter;

impl BackgroundJobRepository {
    /// Validate cost consistency between database and metadata for a job
    /// This method helps ensure cost data integrity across different storage locations
    pub async fn validate_job_cost_consistency(&self, job_id: &str) -> AppResult<bool> {
        let job = self
            .get_job_by_id(job_id)
            .await?
            .ok_or_else(|| AppError::NotFoundError(format!("Job {} not found", job_id)))?;

        let db_cost = job.actual_cost;

        let metadata_cost = if let Some(metadata_str) = &job.metadata {
            if let Ok(metadata_json) = serde_json::from_str::<Value>(metadata_str) {
                metadata_json
                    .get("task_data")
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
                    warn!(
                        "Cost inconsistency detected in job {}: db=${:.6}, metadata=${:.6}",
                        job_id, db, meta
                    );
                }
                Ok(is_consistent)
            }
            (Some(_), None) => {
                debug!("Job {} has cost in database but not in metadata", job_id);
                Ok(true) // Not necessarily inconsistent
            }
            (None, Some(_)) => {
                debug!("Job {} has cost in metadata but not in database", job_id);
                Ok(true) // Not necessarily inconsistent
            }
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
        let total_cost = jobs.iter().filter_map(|job| job.actual_cost).sum::<f64>();

        info!(
            "Session {} total cost: ${:.6} across {} jobs",
            session_id,
            total_cost,
            jobs.len()
        );

        Ok(total_cost)
    }

    /// Update job cost in both database and metadata for consistency
    /// This method ensures cost is properly synchronized across storage locations
    pub async fn update_job_cost(&self, job_id: &str, cost: f64) -> AppResult<()> {
        // First get the current job to preserve existing metadata
        let job = self
            .get_job_by_id(job_id)
            .await?
            .ok_or_else(|| AppError::NotFoundError(format!("Job {} not found", job_id)))?;

        // Update metadata to include the cost
        let updated_metadata = if let Some(metadata_str) = &job.metadata {
            if let Ok(mut metadata_json) = serde_json::from_str::<Value>(metadata_str) {
                if let Some(task_data) = metadata_json.get_mut("task_data") {
                    if let serde_json::Value::Object(task_map) = task_data {
                        task_map.insert("actual_cost".to_string(), serde_json::json!(cost));
                    }
                }
                serde_json::to_string(&metadata_json).map_err(|e| {
                    AppError::SerializationError(format!("Failed to serialize metadata: {}", e))
                })?
            } else {
                // Invalid JSON, create new metadata with cost
                serde_json::to_string(&serde_json::json!({
                    "task_data": {
                        "actual_cost": cost
                    }
                }))
                .unwrap()
            }
        } else {
            // No existing metadata, create new
            serde_json::to_string(&serde_json::json!({
                "task_data": {
                    "actual_cost": cost
                }
            }))
            .unwrap()
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

        info!(
            "Updated cost for job {} to ${:.6} in both database and metadata",
            job_id, cost
        );

        Ok(())
    }

    /// Update job with final cost and token counts from StreamCompleted event
    /// This sets the is_finalized flag to true, indicating the cost is final
    pub async fn update_job_with_final_cost(
        &self,
        job_id: &str,
        final_cost: f64,
        tokens_input: Option<i32>,
        tokens_output: Option<i32>,
        cache_read_tokens: Option<i32>,
        cache_write_tokens: Option<i32>,
    ) -> AppResult<BackgroundJob> {
        debug!(
            "Finalizing job {} with cost {} and tokens: input={:?}, output={:?}",
            job_id, final_cost, tokens_input, tokens_output
        );

        let mut conn = self
            .pool
            .acquire()
            .await
            .map_err(|e| AppError::DatabaseError(e.to_string()))?;

        // Update the job with final metrics and mark as finalized
        sqlx::query(
            "UPDATE background_jobs
             SET actual_cost = ?,
                 tokens_sent = ?,
                 tokens_received = ?,
                 cache_read_tokens = ?,
                 cache_write_tokens = ?,
                 is_finalized = true,
                 updated_at = datetime('now')
             WHERE id = ?",
        )
        .bind(final_cost)
        .bind(tokens_input)
        .bind(tokens_output)
        .bind(cache_read_tokens)
        .bind(cache_write_tokens)
        .bind(job_id)
        .execute(&mut *conn)
        .await
        .map_err(|e| AppError::DatabaseError(e.to_string()))?;

        // Fetch the updated job
        let updated_job = self
            .get_job_by_id(job_id)
            .await?
            .ok_or_else(|| AppError::NotFoundError(format!("Job {} not found", job_id)))?;

        // Emit cost updated event with finalized flag
        if let Some(ref app_handle) = self.app_handle {
            emit_job_cost_updated(
                app_handle,
                JobCostUpdatedEvent {
                    job_id: job_id.to_string(),
                    actual_cost: final_cost,
                    is_finalized: Some(true),
                },
            );
        }

        Ok(updated_job)
    }
}
