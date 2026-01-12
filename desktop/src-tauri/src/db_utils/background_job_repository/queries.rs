use super::base::BackgroundJobRepository;
use super::helpers::{row_to_job, row_to_job_summary};
use crate::error::{AppError, AppResult};
use crate::models::{BackgroundJob, BackgroundJobSummary, JobStatus};
use crate::utils::get_timestamp;
use sqlx::Row;

/// Calculate priority score for a job (lower = higher priority)
fn calculate_job_priority(job: &BackgroundJob, thirty_minutes_ago: i64, seven_days_ago: i64) -> u8 {
    let updated_at = job.updated_at.unwrap_or(job.created_at);
    let status = job.status.as_str();

    // Active jobs updated in last 30 minutes (highest priority)
    if updated_at > thirty_minutes_ago {
        return match status {
            "running" => 0,
            "preparing" => 1,
            "queued" => 2,
            "acknowledged_by_worker" => 3,
            "created" => 4,
            "idle" => 5,
            _ => 12,
        };
    }

    // Recent completed/failed/canceled jobs (last 7 days)
    if job.created_at > seven_days_ago {
        return match status {
            "completed" => 6,
            "failed" => 7,
            "canceled" => 8,
            _ => 12,
        };
    }

    // Older completed/failed/canceled jobs
    match status {
        "completed" => 9,
        "failed" => 10,
        "canceled" => 11,
        _ => 12,
    }
}

impl BackgroundJobRepository {
    /// Get all jobs
    pub async fn get_all_jobs(&self) -> AppResult<Vec<BackgroundJob>> {
        let rows = sqlx::query("SELECT * FROM background_jobs ORDER BY created_at DESC")
            .fetch_all(&*self.pool)
            .await
            .map_err(|e| AppError::DatabaseError(format!("Failed to fetch jobs: {}", e)))?;

        let mut jobs = Vec::new();

        for row in rows {
            let job = row_to_job(&row)?;
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
                let job = row_to_job(&row)?;
                Ok(Some(job))
            }
            None => Ok(None),
        }
    }

    /// Get jobs by session ID
    pub async fn get_jobs_by_session_id(&self, session_id: &str) -> AppResult<Vec<BackgroundJob>> {
        let rows = sqlx::query(
            "SELECT * FROM background_jobs WHERE session_id = $1 ORDER BY created_at DESC",
        )
        .bind(session_id)
        .fetch_all(&*self.pool)
        .await
        .map_err(|e| {
            AppError::DatabaseError(format!("Failed to fetch jobs by session ID: {}", e))
        })?;

        let mut jobs = Vec::new();

        for row in rows {
            let job = row_to_job(&row)?;
            jobs.push(job);
        }

        Ok(jobs)
    }

    /// Get active jobs (pending or running)
    pub async fn get_active_jobs(&self) -> AppResult<Vec<BackgroundJob>> {
        let rows = sqlx::query(
            r#"
            SELECT * FROM background_jobs
            WHERE status IN ($1, $2)
            ORDER BY created_at ASC
            "#,
        )
        .bind(JobStatus::Queued.to_string())
        .bind(JobStatus::Running.to_string())
        .fetch_all(&*self.pool)
        .await
        .map_err(|e| AppError::DatabaseError(format!("Failed to fetch active jobs: {}", e)))?;

        let mut jobs = Vec::new();

        for row in rows {
            let job = row_to_job(&row)?;
            jobs.push(job);
        }

        Ok(jobs)
    }

    /// Get all jobs, sorted by status priority and updated time
    /// Prioritizes recent jobs and deprioritizes old jobs requiring attention
    pub async fn get_all_visible_jobs(&self) -> AppResult<Vec<BackgroundJob>> {
        // Get current timestamp for recency calculation
        let thirty_minutes_ago = get_timestamp() - (30 * 60 * 1000); // 30 minutes in milliseconds
        let seven_days_ago = get_timestamp() - (7 * 24 * 60 * 60 * 1000); // For completed jobs history

        let rows = sqlx::query(
            r#"
            SELECT * FROM background_jobs
            ORDER BY
                -- First priority: Active jobs updated in last 30 minutes
                CASE
                    WHEN status = $1 AND updated_at > $2 THEN 0  -- Running (recent)
                    WHEN status = $3 AND updated_at > $2 THEN 1  -- Preparing (recent)
                    WHEN status = $4 AND updated_at > $2 THEN 2  -- Queued (recent)
                    WHEN status = $5 AND updated_at > $2 THEN 3  -- AcknowledgedByWorker (recent)
                    WHEN status = $6 AND updated_at > $2 THEN 4  -- Created (recent)
                    WHEN status = $7 AND updated_at > $2 THEN 5  -- Idle (recent)
                    -- Recent completed/failed/canceled jobs (last 7 days for history)
                    WHEN status = $8 AND created_at > $9 THEN 6   -- Completed (recent)
                    WHEN status = $10 AND created_at > $9 THEN 7  -- Failed (recent)
                    WHEN status = $11 AND created_at > $9 THEN 8  -- Canceled (recent)
                    -- Older completed/failed/canceled jobs
                    WHEN status = $8 THEN 9   -- Completed (old)
                    WHEN status = $10 THEN 10 -- Failed (old)
                    WHEN status = $11 THEN 11 -- Canceled (old)
                    -- Everything else (jobs requiring attention older than 30 minutes)
                    ELSE 12
                END,
                -- Within each priority group, sort by most recently updated
                updated_at DESC
            LIMIT 100
            "#,
        )
        .bind(JobStatus::Running.to_string()) // $1
        .bind(thirty_minutes_ago) // $2
        .bind(JobStatus::Preparing.to_string()) // $3
        .bind(JobStatus::Queued.to_string()) // $4
        .bind(JobStatus::AcknowledgedByWorker.to_string()) // $5
        .bind(JobStatus::Created.to_string()) // $6
        .bind(JobStatus::Idle.to_string()) // $7
        .bind(JobStatus::Completed.to_string()) // $8
        .bind(seven_days_ago) // $9
        .bind(JobStatus::Failed.to_string()) // $10
        .bind(JobStatus::Canceled.to_string()) // $11
        .fetch_all(&*self.pool)
        .await
        .map_err(|e| AppError::DatabaseError(format!("Failed to fetch jobs: {}", e)))?;

        let mut jobs = Vec::new();

        for row in rows {
            let job = row_to_job(&row)?;
            jobs.push(job);
        }

        Ok(jobs)
    }

    /// Get all visible jobs for a specific project, sorted by status priority and updated time
    pub async fn get_all_visible_jobs_for_project(
        &self,
        project_hash: &str,
    ) -> AppResult<Vec<BackgroundJob>> {
        // Get current timestamp for recency calculation
        let thirty_minutes_ago = get_timestamp() - (30 * 60 * 1000); // 30 minutes in milliseconds
        let seven_days_ago = get_timestamp() - (7 * 24 * 60 * 60 * 1000); // For completed jobs history

        let rows = sqlx::query(
            r#"
            SELECT bj.* FROM background_jobs bj
            INNER JOIN sessions s ON bj.session_id = s.id
            WHERE s.project_hash = $1
            ORDER BY
                -- First priority: Active jobs updated in last 30 minutes
                CASE
                    WHEN bj.status = $2 AND bj.updated_at > $3 THEN 0  -- Running (recent)
                    WHEN bj.status = $4 AND bj.updated_at > $3 THEN 1  -- Preparing (recent)
                    WHEN bj.status = $5 AND bj.updated_at > $3 THEN 2  -- Queued (recent)
                    WHEN bj.status = $6 AND bj.updated_at > $3 THEN 3  -- AcknowledgedByWorker (recent)
                    WHEN bj.status = $7 AND bj.updated_at > $3 THEN 4  -- Created (recent)
                    WHEN bj.status = $8 AND bj.updated_at > $3 THEN 5  -- Idle (recent)
                    -- Recent completed/failed/canceled jobs (last 7 days for history)
                    WHEN bj.status = $9 AND bj.created_at > $10 THEN 6   -- Completed (recent)
                    WHEN bj.status = $11 AND bj.created_at > $10 THEN 7  -- Failed (recent)
                    WHEN bj.status = $12 AND bj.created_at > $10 THEN 8  -- Canceled (recent)
                    -- Older completed/failed/canceled jobs
                    WHEN bj.status = $9 THEN 9   -- Completed (old)
                    WHEN bj.status = $11 THEN 10 -- Failed (old)
                    WHEN bj.status = $12 THEN 11 -- Canceled (old)
                    -- Everything else (jobs requiring attention older than 30 minutes)
                    ELSE 12
                END,
                -- Within each priority group, sort by most recently updated
                bj.updated_at DESC
            LIMIT 100
            "#,
        )
        .bind(project_hash)                          // $1
        .bind(JobStatus::Running.to_string())        // $2
        .bind(thirty_minutes_ago)                    // $3
        .bind(JobStatus::Preparing.to_string())      // $4
        .bind(JobStatus::Queued.to_string())         // $5
        .bind(JobStatus::AcknowledgedByWorker.to_string()) // $6
        .bind(JobStatus::Created.to_string())        // $7
        .bind(JobStatus::Idle.to_string())           // $8
        .bind(JobStatus::Completed.to_string())      // $9
        .bind(seven_days_ago)                        // $10
        .bind(JobStatus::Failed.to_string())         // $11
        .bind(JobStatus::Canceled.to_string())       // $12
        .fetch_all(&*self.pool)
        .await
        .map_err(|e| AppError::DatabaseError(format!("Failed to fetch jobs for project: {}", e)))?;

        let mut jobs = Vec::new();

        for row in rows {
            let job = row_to_job(&row)?;
            jobs.push(job);
        }

        Ok(jobs)
    }

    /// Get all visible jobs for a specific session within a project
    pub async fn get_all_visible_jobs_for_session(
        &self,
        session_id: &str,
    ) -> AppResult<Vec<BackgroundJob>> {
        // Simple, fast query - let Rust handle the sorting
        let query_str = r#"
            SELECT bj.* FROM background_jobs bj
            WHERE bj.session_id = $1
            AND bj.task_type NOT IN ('file_finder_workflow', 'web_search_workflow')
            ORDER BY bj.updated_at DESC
            LIMIT 100
            "#;

        let rows = sqlx::query(query_str)
            .bind(session_id)
            .fetch_all(&*self.pool)
            .await
            .map_err(|e| AppError::DatabaseError(format!("Failed to fetch jobs for session: {}", e)))?;

        let mut jobs = Vec::new();
        for row in rows {
            let job = row_to_job(&row)?;
            jobs.push(job);
        }

        // Fast in-memory sorting by priority (much faster than SQL CASE for <100 items)
        let thirty_minutes_ago = get_timestamp() - (30 * 60 * 1000);
        let seven_days_ago = get_timestamp() - (7 * 24 * 60 * 60 * 1000);

        jobs.sort_by(|a, b| {
            let priority_a = calculate_job_priority(a, thirty_minutes_ago, seven_days_ago);
            let priority_b = calculate_job_priority(b, thirty_minutes_ago, seven_days_ago);

            priority_a.cmp(&priority_b).then_with(|| {
                let time_a = a.updated_at.unwrap_or(a.created_at);
                let time_b = b.updated_at.unwrap_or(b.created_at);
                time_b.cmp(&time_a)
            })
        });

        Ok(jobs)
    }

    /// Get jobs by their IDs
    pub async fn get_jobs_by_ids(&self, ids: &[String]) -> AppResult<Vec<BackgroundJob>> {
        if ids.is_empty() {
            return Ok(Vec::new());
        }

        // Create placeholders for the query
        let placeholders: Vec<String> = ids
            .iter()
            .enumerate()
            .map(|(i, _)| format!("${}", i + 1))
            .collect();
        let placeholder_str = placeholders.join(",");

        let query = format!(
            "SELECT * FROM background_jobs WHERE id IN ({}) ORDER BY created_at DESC",
            placeholder_str
        );

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
            let job = row_to_job(&row)?;
            jobs.push(job);
        }

        Ok(jobs)
    }

    /// Get jobs by a specific metadata field value (for workflow management)
    pub async fn get_jobs_by_metadata_field(
        &self,
        field_name: &str,
        field_value: &str,
    ) -> AppResult<Vec<BackgroundJob>> {
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
            .map_err(|e| {
                AppError::DatabaseError(format!("Failed to fetch jobs by metadata field: {}", e))
            })?;

        let mut jobs = Vec::new();

        for row in rows {
            let job = row_to_job(&row)?;
            jobs.push(job);
        }

        Ok(jobs)
    }

    /// Get jobs by status
    pub async fn get_jobs_by_status(
        &self,
        statuses: &[JobStatus],
    ) -> AppResult<Vec<BackgroundJob>> {
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

        let rows = query_builder.fetch_all(&*self.pool).await.map_err(|e| {
            AppError::DatabaseError(format!("Failed to fetch jobs by status: {}", e))
        })?;

        let mut jobs = Vec::new();

        for row in rows {
            let job = row_to_job(&row)?;
            jobs.push(job);
        }

        Ok(jobs)
    }

    /// Get jobs with filtering and pagination
    /// Always excludes internal workflow jobs (file_finder_workflow, web_search_workflow)
    pub async fn get_jobs_filtered(
        &self,
        project_hash: Option<String>,
        session_id: Option<String>,
        status_filter: Option<Vec<String>>,
        task_type_filter: Option<Vec<String>>,
        page: u32,
        page_size: u32,
    ) -> AppResult<(Vec<BackgroundJob>, u32, bool)> {
        let project_hash = if session_id.is_some() { None } else { project_hash };
        let mut param_index = 1;
        let mut where_clauses: Vec<String> = Vec::new();
        let mut bindings: Vec<String> = Vec::new();

        let use_session_join = project_hash.is_some() && session_id.is_none();
        let table_prefix = if use_session_join { "bj." } else { "" };

        // Always exclude internal workflow jobs for "visible jobs" semantics
        where_clauses.push(format!(
            "{}task_type NOT IN ('file_finder_workflow', 'web_search_workflow')",
            table_prefix
        ));

        if let Some(ref sid) = session_id {
            where_clauses.push(format!("{}session_id = ${}", table_prefix, param_index));
            bindings.push(sid.clone());
            param_index += 1;
        }

        if let Some(ref ph) = project_hash {
            if session_id.is_none() {
                where_clauses.push(format!("s.project_hash = ${}", param_index));
                bindings.push(ph.clone());
                param_index += 1;
            }
        }

        if let Some(ref statuses) = status_filter {
            if !statuses.is_empty() {
                let placeholders: Vec<String> = statuses
                    .iter()
                    .map(|_| {
                        let p = format!("${}", param_index);
                        param_index += 1;
                        p
                    })
                    .collect();
                where_clauses.push(format!("{}status IN ({})", table_prefix, placeholders.join(", ")));
                bindings.extend(statuses.clone());
            }
        }

        if let Some(ref task_types) = task_type_filter {
            if !task_types.is_empty() {
                let placeholders: Vec<String> = task_types
                    .iter()
                    .map(|_| {
                        let p = format!("${}", param_index);
                        param_index += 1;
                        p
                    })
                    .collect();
                where_clauses.push(format!("{}task_type IN ({})", table_prefix, placeholders.join(", ")));
                bindings.extend(task_types.clone());
            }
        }

        // where_clauses is never empty due to the unconditional task_type exclusion above
        let where_clause = format!("WHERE {}", where_clauses.join(" AND "));

        let offset = page * page_size;
        let limit = page_size + 1;

        let (data_query, count_query) = if use_session_join {
            (
                format!(
                    r#"SELECT bj.* FROM background_jobs bj
                    INNER JOIN sessions s ON bj.session_id = s.id
                    {}
                    ORDER BY COALESCE(bj.updated_at, bj.created_at) DESC
                    LIMIT {} OFFSET {}"#,
                    where_clause, limit, offset
                ),
                format!(
                    r#"SELECT COUNT(*) as cnt FROM background_jobs bj
                    INNER JOIN sessions s ON bj.session_id = s.id
                    {}"#,
                    where_clause
                ),
            )
        } else {
            (
                format!(
                    r#"SELECT * FROM background_jobs
                    {}
                    ORDER BY COALESCE(updated_at, created_at) DESC
                    LIMIT {} OFFSET {}"#,
                    where_clause, limit, offset
                ),
                format!(
                    r#"SELECT COUNT(*) as cnt FROM background_jobs
                    {}"#,
                    where_clause
                ),
            )
        };

        let mut data_query_builder = sqlx::query(&data_query);
        for binding in &bindings {
            data_query_builder = data_query_builder.bind(binding);
        }

        let rows = data_query_builder
            .fetch_all(&*self.pool)
            .await
            .map_err(|e| AppError::DatabaseError(format!("Failed to fetch filtered jobs: {}", e)))?;

        let mut jobs = Vec::new();
        for row in rows {
            let job = row_to_job(&row)?;
            jobs.push(job);
        }

        let has_more = jobs.len() > page_size as usize;
        if has_more {
            jobs.pop();
        }

        let mut count_query_builder = sqlx::query(&count_query);
        for binding in &bindings {
            count_query_builder = count_query_builder.bind(binding);
        }

        let count_row = count_query_builder
            .fetch_one(&*self.pool)
            .await
            .map_err(|e| AppError::DatabaseError(format!("Failed to count filtered jobs: {}", e)))?;

        let total_count: i64 = count_row.try_get("cnt").unwrap_or(0);

        Ok((jobs, total_count as u32, has_more))
    }

    pub async fn get_job_summaries_filtered(
        &self,
        project_hash: Option<String>,
        session_id: Option<String>,
        status_filter: Option<Vec<String>>,
        task_type_filter: Option<Vec<String>>,
        page: u32,
        page_size: u32,
    ) -> AppResult<(Vec<BackgroundJobSummary>, u32, bool)> {
        let project_hash = if session_id.is_some() { None } else { project_hash };
        let mut param_index = 1;
        let mut where_clauses: Vec<String> = Vec::new();
        let mut bindings: Vec<String> = Vec::new();

        let use_session_join = project_hash.is_some() && session_id.is_none();
        let table_prefix = if use_session_join { "bj." } else { "" };

        where_clauses.push(format!(
            "{}task_type NOT IN ('file_finder_workflow', 'web_search_workflow')",
            table_prefix
        ));

        if let Some(ref sid) = session_id {
            where_clauses.push(format!("{}session_id = ${}", table_prefix, param_index));
            bindings.push(sid.clone());
            param_index += 1;
        }

        if let Some(ref ph) = project_hash {
            if session_id.is_none() {
                where_clauses.push(format!("s.project_hash = ${}", param_index));
                bindings.push(ph.clone());
                param_index += 1;
            }
        }

        if let Some(ref statuses) = status_filter {
            if !statuses.is_empty() {
                let placeholders: Vec<String> = statuses
                    .iter()
                    .map(|_| {
                        let p = format!("${}", param_index);
                        param_index += 1;
                        p
                    })
                    .collect();
                where_clauses.push(format!("{}status IN ({})", table_prefix, placeholders.join(", ")));
                bindings.extend(statuses.clone());
            }
        }

        if let Some(ref task_types) = task_type_filter {
            if !task_types.is_empty() {
                let placeholders: Vec<String> = task_types
                    .iter()
                    .map(|_| {
                        let p = format!("${}", param_index);
                        param_index += 1;
                        p
                    })
                    .collect();
                where_clauses.push(format!("{}task_type IN ({})", table_prefix, placeholders.join(", ")));
                bindings.extend(task_types.clone());
            }
        }

        let where_clause = format!("WHERE {}", where_clauses.join(" AND "));

        let offset = page * page_size;
        let limit = page_size + 1;

        let summary_columns = "id, session_id, task_type, status, error_message, tokens_sent, tokens_received, cache_write_tokens, cache_read_tokens, model_used, actual_cost, created_at, updated_at, start_time, end_time, is_finalized, COALESCE(json_extract(metadata, '$.planTitle'), json_extract(metadata, '$.generatedTitle'), json_extract(metadata, '$.taskData.planTitle')) as plan_title, json_extract(metadata, '$.markdownConversionStatus') as markdown_conversion_status";

        let (data_query, count_query) = if use_session_join {
            (
                format!(
                    r#"SELECT bj.{} FROM background_jobs bj
                    INNER JOIN sessions s ON bj.session_id = s.id
                    {}
                    ORDER BY COALESCE(bj.updated_at, bj.created_at) DESC
                    LIMIT {} OFFSET {}"#,
                    summary_columns, where_clause, limit, offset
                ),
                format!(
                    r#"SELECT COUNT(*) as cnt FROM background_jobs bj
                    INNER JOIN sessions s ON bj.session_id = s.id
                    {}"#,
                    where_clause
                ),
            )
        } else {
            (
                format!(
                    r#"SELECT {} FROM background_jobs
                    {}
                    ORDER BY COALESCE(updated_at, created_at) DESC
                    LIMIT {} OFFSET {}"#,
                    summary_columns, where_clause, limit, offset
                ),
                format!(
                    r#"SELECT COUNT(*) as cnt FROM background_jobs
                    {}"#,
                    where_clause
                ),
            )
        };

        let mut data_query_builder = sqlx::query(&data_query);
        for binding in &bindings {
            data_query_builder = data_query_builder.bind(binding);
        }

        let rows = data_query_builder
            .fetch_all(&*self.pool)
            .await
            .map_err(|e| AppError::DatabaseError(format!("Failed to fetch filtered job summaries: {}", e)))?;

        log::debug!("[get_job_summaries_filtered] Returned {} rows", rows.len());

        let mut summaries = Vec::new();
        for row in rows {
            let summary = row_to_job_summary(&row)?;
            summaries.push(summary);
        }

        let has_more = summaries.len() > page_size as usize;
        if has_more {
            summaries.pop();
        }

        let mut count_query_builder = sqlx::query(&count_query);
        for binding in &bindings {
            count_query_builder = count_query_builder.bind(binding);
        }

        let count_row = count_query_builder
            .fetch_one(&*self.pool)
            .await
            .map_err(|e| AppError::DatabaseError(format!("Failed to count filtered job summaries: {}", e)))?;

        let total_count: i64 = count_row.try_get("cnt").unwrap_or(0);

        Ok((summaries, total_count as u32, has_more))
    }
}
