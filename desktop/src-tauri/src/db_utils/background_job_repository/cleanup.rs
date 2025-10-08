use super::base::BackgroundJobRepository;
use crate::error::{AppError, AppResult};
use crate::models::{JobStatus, TaskType};
use crate::utils::get_timestamp;
use log::info;
use sqlx::Row;

impl BackgroundJobRepository {
    /// Delete job history based on days_to_keep
    pub async fn clear_job_history(&self, days_to_keep: i64) -> AppResult<()> {
        let current_ts = get_timestamp();

        if days_to_keep == -2 {
            // Delete all completed, failed, or canceled jobs (including implementation plans)
            sqlx::query("DELETE FROM background_jobs WHERE status IN ($1, $2, $3)")
                .bind(JobStatus::Completed.to_string())
                .bind(JobStatus::Failed.to_string())
                .bind(JobStatus::Canceled.to_string())
                .execute(&*self.pool)
                .await
                .map_err(|e| {
                    AppError::DatabaseError(format!("Failed to delete job history: {}", e))
                })?;
        } else if days_to_keep == -1 {
            // Delete all completed, failed, or canceled jobs (excluding implementation plans)
            sqlx::query(
                "DELETE FROM background_jobs WHERE status IN ($1, $2, $3) AND task_type <> $4",
            )
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

    /// Delete all completed jobs
    pub async fn clear_all_completed_jobs(&self) -> AppResult<usize> {
        // Delete completed, failed, or canceled jobs (excluding implementation plans)
        let result = sqlx::query(
            "DELETE FROM background_jobs WHERE status IN ($1, $2, $3) AND task_type <> $4",
        )
        .bind(JobStatus::Completed.to_string())
        .bind(JobStatus::Failed.to_string())
        .bind(JobStatus::Canceled.to_string())
        .bind(crate::models::TaskType::ImplementationPlan.to_string())
        .execute(&*self.pool)
        .await
        .map_err(|e| {
            AppError::DatabaseError(format!("Failed to delete all completed jobs: {}", e))
        })?;

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
}
