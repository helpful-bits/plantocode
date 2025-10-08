use super::base::BackgroundJobRepository;
use super::helpers::row_to_job;
use crate::error::{AppError, AppResult};
use crate::models::BackgroundJob;
use crate::utils::get_timestamp;
use log::debug;
use sqlx::Row;
use crate::models::JobStatus;

impl BackgroundJobRepository {
    /// Get jobs from the database that are queued and have worker-specific metadata
    /// These jobs will be atomically updated to have 'acknowledged_by_worker' status
    pub async fn get_and_acknowledge_queued_jobs_for_worker(
        &self,
        limit: u32,
    ) -> AppResult<Vec<BackgroundJob>> {
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
            "#,
        )
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
            let job = row_to_job(row)?;
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

    /// Reset jobs that have been acknowledged by the worker but not completed within the timeout
    pub async fn reset_stale_acknowledged_jobs(
        &self,
        timeout_threshold_seconds: u64,
    ) -> AppResult<u32> {
        let timestamp = get_timestamp();
        let timeout_ms = timeout_threshold_seconds as i64 * 1000;
        let threshold_time = timestamp - timeout_ms;

        let result = sqlx::query(
            r#"
            UPDATE background_jobs
            SET status = $1, updated_at = $2
            WHERE status = $3
            AND updated_at < $4
            "#,
        )
        .bind(JobStatus::Queued.to_string())
        .bind(timestamp)
        .bind(JobStatus::AcknowledgedByWorker.to_string())
        .bind(threshold_time)
        .execute(&*self.pool)
        .await
        .map_err(|e| AppError::DatabaseError(format!("Failed to reset stale jobs: {}", e)))?;

        Ok(result.rows_affected() as u32)
    }
}
