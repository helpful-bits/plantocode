use crate::error::{AppError, AppResult};
use crate::models::Session;
use crate::utils::date_utils;
use crate::utils::hash_utils::sha256_hash;
use serde::{Deserialize, Serialize};
use sqlx::{Row, SqlitePool, sqlite::SqliteRow};
use std::collections::HashSet;
use std::sync::Arc;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TaskHistoryEntry {
    #[serde(rename = "value")]
    pub description: String,
    #[serde(rename = "timestampMs")]
    pub created_at: i64,
    pub device_id: Option<String>,
    pub op_type: Option<String>,
    pub sequence_number: i64,
    pub version: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FileSelectionHistoryEntry {
    pub included_files: String,
    pub force_excluded_files: String,
    #[serde(rename = "timestampMs")]
    pub created_at: i64,
    pub device_id: Option<String>,
    pub op_type: Option<String>,
    pub sequence_number: i64,
    pub version: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TaskHistoryState {
    pub entries: Vec<TaskHistoryEntry>,
    pub current_index: i64,
    pub version: i64,
    pub checksum: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FileHistoryState {
    pub entries: Vec<FileSelectionHistoryEntry>,
    pub current_index: i64,
    pub version: i64,
    pub checksum: String,
}

#[derive(Debug)]
pub struct SessionRepository {
    pool: Arc<SqlitePool>,
}

impl SessionRepository {
    pub fn new(pool: Arc<SqlitePool>) -> Self {
        Self { pool }
    }

    /// Helper function to convert a SQLite row to a Session object
    async fn row_to_session(&self, row: &SqliteRow) -> AppResult<Session> {
        let id: String = row.try_get::<'_, String, _>("id")?;
        let name: String = row.try_get::<'_, String, _>("name")?;
        let project_directory: String = row.try_get::<'_, String, _>("project_directory")?;
        let project_hash: String = row.try_get::<'_, String, _>("project_hash")?;

        let task_description: Option<String> = row.try_get("task_description")?;
        let search_term: Option<String> = row.try_get("search_term")?;
        let search_selected_files_only = row
            .try_get::<'_, i64, _>("search_selected_files_only")
            .unwrap_or(0)
            == 1;
        let model_used: Option<String> = row.try_get("model_used")?;

        let created_at: i64 = row.try_get::<'_, i64, _>("created_at")?;
        let updated_at: i64 = row.try_get::<'_, i64, _>("updated_at")?;

        // Read included and excluded files from TEXT columns
        let included_files_text: Option<String> = row.try_get("included_files")?;
        let force_excluded_files_text: Option<String> = row.try_get("force_excluded_files")?;

        let included_files = included_files_text
            .map(|text| {
                text.lines()
                    .filter(|line| !line.is_empty())
                    .map(|line| line.to_string())
                    .collect()
            })
            .unwrap_or_else(Vec::new);

        let force_excluded_files = force_excluded_files_text
            .map(|text| {
                text.lines()
                    .filter(|line| !line.is_empty())
                    .map(|line| line.to_string())
                    .collect()
            })
            .unwrap_or_else(Vec::new);

        // Read video_analysis_prompt - handle missing column gracefully
        let video_analysis_prompt: Option<String> =
            row.try_get("video_analysis_prompt").ok().flatten();

        let merge_instructions: Option<String> =
            row.try_get("merge_instructions").ok().flatten();

        Ok(Session {
            id,
            name,
            project_directory,
            project_hash,
            task_description,
            search_term,
            search_selected_files_only,
            model_used,
            created_at,
            updated_at,
            included_files,
            force_excluded_files,
            video_analysis_prompt,
            merge_instructions,
        })
    }

    /// Get all sessions
    pub async fn get_all_sessions(&self) -> AppResult<Vec<Session>> {
        let rows = sqlx::query("SELECT * FROM sessions ORDER BY updated_at DESC")
            .fetch_all(&*self.pool)
            .await
            .map_err(|e| AppError::DatabaseError(format!("Failed to fetch sessions: {}", e)))?;

        let mut sessions = Vec::new();

        for row in rows {
            match self.row_to_session(&row).await {
                Ok(session) => {
                    sessions.push(session);
                }
                Err(e) => {
                    let session_id_for_log: String = row
                        .try_get("id")
                        .unwrap_or_else(|_| "unknown_id".to_string());
                    log::error!(
                        "Failed to process session with id '{}': {}",
                        session_id_for_log,
                        e
                    );
                    continue;
                }
            }
        }

        Ok(sessions)
    }

    /// Get a session by ID
    pub async fn get_session_by_id(&self, id: &str) -> AppResult<Option<Session>> {
        let row = sqlx::query("SELECT * FROM sessions WHERE id = $1")
            .bind(id)
            .fetch_optional(&*self.pool)
            .await
            .map_err(|e| AppError::DatabaseError(format!("Failed to fetch session: {}", e)))?;

        match row {
            Some(row) => {
                let session = self.row_to_session(&row).await?;
                Ok(Some(session))
            }
            None => Ok(None),
        }
    }

    /// Create a new session
    pub async fn create_session(&self, session: &Session) -> AppResult<()> {
        // Start transaction
        let mut tx =
            self.pool.begin().await.map_err(|e| {
                AppError::DatabaseError(format!("Failed to begin transaction: {}", e))
            })?;

        // Insert session
        let result = sqlx::query(
            r#"
            INSERT INTO sessions (
                id, name, project_directory, project_hash,
                task_description, search_term, search_selected_files_only, model_used,
                included_files, force_excluded_files,
                created_at, updated_at, video_analysis_prompt, merge_instructions
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
            "#,
        )
        .bind(&session.id)
        .bind(&session.name)
        .bind(&session.project_directory)
        .bind(&session.project_hash)
        .bind(&session.task_description)
        .bind(&session.search_term)
        .bind(if session.search_selected_files_only {
            1i64
        } else {
            0i64
        })
        .bind(&session.model_used);

        let result = result
            .bind(session.included_files.join("\n"))
            .bind(session.force_excluded_files.join("\n"))
            .bind(session.created_at)
            .bind(session.updated_at)
            .bind(&session.video_analysis_prompt)
            .bind(&session.merge_instructions)
            .execute(&mut *tx)
            .await;

        if let Err(e) = result {
            // Rollback transaction on error
            let _ = tx.rollback().await;
            return Err(AppError::DatabaseError(format!(
                "Failed to insert session: {}",
                e
            )));
        }

        // Commit transaction
        tx.commit()
            .await
            .map_err(|e| AppError::DatabaseError(format!("Failed to commit transaction: {}", e)))?;

        Ok(())
    }

    /// Update an existing session with conflict-aware merge
    /// If DB has been updated since client's last read (updated_at comparison),
    /// merge changes: excluded_final = db_excluded ∪ client_excluded,
    /// included_final = (db_included ∪ client_included) \ excluded_final
    pub async fn update_session(&self, session: &Session) -> AppResult<()> {
        use std::collections::BTreeSet;

        // Acquire connection and start IMMEDIATE transaction
        let mut conn =
            self.pool.acquire().await.map_err(|e| {
                AppError::DatabaseError(format!("Failed to acquire connection: {}", e))
            })?;

        sqlx::query("BEGIN IMMEDIATE")
            .execute(&mut *conn)
            .await
            .map_err(|e| {
                AppError::DatabaseError(format!("Failed to begin immediate transaction: {}", e))
            })?;

        // Fetch current DB state within transaction
        let row = sqlx::query(
            "SELECT included_files, force_excluded_files, updated_at
             FROM sessions
             WHERE id = $1",
        )
        .bind(&session.id)
        .fetch_optional(&mut *conn)
        .await
        .map_err(|e| {
            AppError::DatabaseError(format!("Failed to fetch session for update: {}", e))
        })?;

        let (included_final, excluded_final) = match row {
            Some(row) => {
                let current_updated_at: i64 = row.try_get("updated_at")?;

                // Conflict detection: if DB is newer than client's timestamp, merge
                if current_updated_at > session.updated_at {
                    // Parse DB state
                    let db_included_text: Option<String> = row.try_get("included_files")?;
                    let db_excluded_text: Option<String> = row.try_get("force_excluded_files")?;

                    let db_included: BTreeSet<String> = db_included_text
                        .unwrap_or_default()
                        .lines()
                        .filter(|line| !line.trim().is_empty())
                        .map(|s| s.trim().to_string())
                        .collect();

                    let db_excluded: BTreeSet<String> = db_excluded_text
                        .unwrap_or_default()
                        .lines()
                        .filter(|line| !line.trim().is_empty())
                        .map(|s| s.trim().to_string())
                        .collect();

                    // Build client sets
                    let client_included: BTreeSet<String> = session
                        .included_files
                        .iter()
                        .map(|s| s.trim().to_string())
                        .filter(|s| !s.is_empty())
                        .collect();

                    let client_excluded: BTreeSet<String> = session
                        .force_excluded_files
                        .iter()
                        .map(|s| s.trim().to_string())
                        .filter(|s| !s.is_empty())
                        .collect();

                    // Merge logic: client exclusions are authoritative (don't union with DB)
                    // This allows users to remove exclusions and have them stay removed
                    // Union inclusions (preserve both client changes and backend additions)
                    let excluded_final: BTreeSet<String> = client_excluded.clone();
                    let included_union: BTreeSet<String> =
                        db_included.union(&client_included).cloned().collect();
                    let included_final: BTreeSet<String> = included_union
                        .difference(&excluded_final)
                        .cloned()
                        .collect();

                    (
                        included_final.into_iter().collect::<Vec<_>>().join("\n"),
                        excluded_final.into_iter().collect::<Vec<_>>().join("\n"),
                    )
                } else {
                    // No conflict: use client state but still enforce consistency
                    let client_included: BTreeSet<String> = session
                        .included_files
                        .iter()
                        .map(|s| s.trim().to_string())
                        .filter(|s| !s.is_empty())
                        .collect();

                    let client_excluded: BTreeSet<String> = session
                        .force_excluded_files
                        .iter()
                        .map(|s| s.trim().to_string())
                        .filter(|s| !s.is_empty())
                        .collect();

                    // Ensure included doesn't contain excluded
                    let included_final: BTreeSet<String> = client_included
                        .difference(&client_excluded)
                        .cloned()
                        .collect();

                    (
                        included_final.into_iter().collect::<Vec<_>>().join("\n"),
                        client_excluded.into_iter().collect::<Vec<_>>().join("\n"),
                    )
                }
            }
            None => {
                let _ = sqlx::query("ROLLBACK").execute(&mut *conn).await;
                return Err(AppError::DatabaseError(format!(
                    "Session not found for update: {}",
                    session.id
                )));
            }
        };

        // Update with merged/consistent values and current timestamp
        let result = sqlx::query(
            r#"
            UPDATE sessions SET
                name = $1,
                project_directory = $2,
                project_hash = $3,
                task_description = $4,
                search_term = $5,
                search_selected_files_only = $6,
                model_used = $7,
                included_files = $8,
                force_excluded_files = $9,
                updated_at = $10,
                video_analysis_prompt = $11,
                merge_instructions = $12
            WHERE id = $13
            "#,
        )
        .bind(&session.name)
        .bind(&session.project_directory)
        .bind(&session.project_hash)
        .bind(&session.task_description)
        .bind(&session.search_term)
        .bind(if session.search_selected_files_only {
            1i64
        } else {
            0i64
        })
        .bind(&session.model_used)
        .bind(&included_final)
        .bind(&excluded_final)
        .bind(date_utils::get_timestamp())
        .bind(&session.video_analysis_prompt)
        .bind(&session.merge_instructions)
        .bind(&session.id)
        .execute(&mut *conn)
        .await;

        match result {
            Ok(_) => {
                sqlx::query("COMMIT")
                    .execute(&mut *conn)
                    .await
                    .map_err(|e| {
                        AppError::DatabaseError(format!(
                            "Failed to commit update transaction: {}",
                            e
                        ))
                    })?;
                Ok(())
            }
            Err(e) => {
                let _ = sqlx::query("ROLLBACK").execute(&mut *conn).await;
                Err(AppError::DatabaseError(format!(
                    "Failed to update session: {}",
                    e
                )))
            }
        }
    }

    /// Delete a session
    pub async fn delete_session(&self, id: &str) -> AppResult<()> {
        // Delete the session (cascade will delete included and excluded files)
        sqlx::query("DELETE FROM sessions WHERE id = $1")
            .bind(id)
            .execute(&*self.pool)
            .await
            .map_err(|e| AppError::DatabaseError(format!("Failed to delete session: {}", e)))?;

        Ok(())
    }

    /// Atomically merge files into included_files while RESPECTING user force_excluded_files.
    /// Files that are in force_excluded_files will NOT be added to included_files.
    /// This ensures background jobs never override manual user selections.
    /// Uses BEGIN IMMEDIATE for race-free concurrency.
    pub async fn atomic_merge_included_files_respecting_exclusions(
        &self,
        session_id: &str,
        files_to_add: &[String],
    ) -> AppResult<Vec<String>> {
        use std::collections::BTreeSet;

        // Acquire connection and start IMMEDIATE transaction to lock before any reads
        let mut conn =
            self.pool.acquire().await.map_err(|e| {
                AppError::DatabaseError(format!("Failed to acquire connection: {}", e))
            })?;

        sqlx::query("BEGIN IMMEDIATE")
            .execute(&mut *conn)
            .await
            .map_err(|e| {
                AppError::DatabaseError(format!("Failed to begin immediate transaction: {}", e))
            })?;

        // SELECT current state within transaction (after lock acquired)
        let row = sqlx::query(
            "SELECT included_files, force_excluded_files
             FROM sessions
             WHERE id = $1",
        )
        .bind(session_id)
        .fetch_optional(&mut *conn)
        .await
        .map_err(|e| {
            AppError::DatabaseError(format!(
                "Failed to fetch session {} for merge: {}",
                session_id, e
            ))
        })?;

        let row = match row {
            Some(r) => r,
            None => {
                let _ = sqlx::query("ROLLBACK").execute(&mut *conn).await;
                return Err(AppError::DatabaseError(format!(
                    "Session not found: {}",
                    session_id
                )));
            }
        };

        // Parse current files from database
        let included_text: Option<String> = row.try_get("included_files")?;
        let excluded_text: Option<String> = row.try_get("force_excluded_files")?;

        let mut db_included: BTreeSet<String> = included_text
            .unwrap_or_default()
            .lines()
            .filter(|line| !line.trim().is_empty())
            .map(|s| s.trim().to_string())
            .collect();

        let db_excluded: BTreeSet<String> = excluded_text
            .unwrap_or_default()
            .lines()
            .filter(|line| !line.trim().is_empty())
            .map(|s| s.trim().to_string())
            .collect();

        // Track which files are actually new
        let mut newly_added = Vec::new();

        // Merge new files, but SKIP any that are in excluded set
        for file in files_to_add {
            let trimmed = file.trim();
            if trimmed.is_empty() {
                continue;
            }

            // CRITICAL: Respect user exclusions - do not add if excluded
            if db_excluded.contains(trimmed) {
                continue;
            }

            // Only track as "newly added" if it wasn't already included
            if !db_included.contains(trimmed) {
                newly_added.push(trimmed.to_string());
            }

            db_included.insert(trimmed.to_string());
        }

        // Convert back to newline-delimited strings
        let included_str: String = db_included.into_iter().collect::<Vec<_>>().join("\n");
        // DO NOT modify force_excluded_files here
        let excluded_str: String = db_excluded.into_iter().collect::<Vec<_>>().join("\n");
        let now = date_utils::get_timestamp();

        // Update the session
        let update_result = sqlx::query(
            "UPDATE sessions
             SET included_files = $1,
                 force_excluded_files = $2,
                 updated_at = $3
             WHERE id = $4",
        )
        .bind(&included_str)
        .bind(&excluded_str)
        .bind(now)
        .bind(session_id)
        .execute(&mut *conn)
        .await;

        match update_result {
            Ok(_) => {
                // Commit transaction
                sqlx::query("COMMIT")
                    .execute(&mut *conn)
                    .await
                    .map_err(|e| {
                        AppError::DatabaseError(format!(
                            "Failed to commit merge transaction: {}",
                            e
                        ))
                    })?;

                Ok(newly_added)
            }
            Err(e) => {
                let _ = sqlx::query("ROLLBACK").execute(&mut *conn).await;
                Err(AppError::DatabaseError(format!(
                    "Failed to update session {} with merged files: {}",
                    session_id, e
                )))
            }
        }
    }

    /// Get a session by project hash
    pub async fn get_session_by_project_hash(
        &self,
        project_hash: &str,
    ) -> AppResult<Option<Session>> {
        let row = sqlx::query(
            "SELECT * FROM sessions WHERE project_hash = $1 ORDER BY updated_at DESC LIMIT 1",
        )
        .bind(project_hash)
        .fetch_optional(&*self.pool)
        .await
        .map_err(|e| {
            AppError::DatabaseError(format!("Failed to fetch session by project hash: {}", e))
        })?;

        match row {
            Some(row) => {
                let session = self.row_to_session(&row).await?;
                Ok(Some(session))
            }
            None => Ok(None),
        }
    }

    /// Get all sessions for a specific project hash, ordered by most recent first
    pub async fn get_sessions_by_project_hash(
        &self,
        project_hash: &str,
    ) -> AppResult<Vec<Session>> {
        let rows =
            sqlx::query("SELECT * FROM sessions WHERE project_hash = $1 ORDER BY updated_at DESC")
                .bind(project_hash)
                .fetch_all(&*self.pool)
                .await
                .map_err(|e| {
                    AppError::DatabaseError(format!("Failed to fetch sessions for project: {}", e))
                })?;

        let mut sessions = Vec::new();

        for row in rows {
            match self.row_to_session(&row).await {
                Ok(session) => {
                    sessions.push(session);
                }
                Err(e) => {
                    let session_id_for_log: String = row
                        .try_get("id")
                        .unwrap_or_else(|_| "unknown_id".to_string());
                    log::error!(
                        "Failed to process session with id '{}': {}",
                        session_id_for_log,
                        e
                    );
                    continue;
                }
            }
        }

        Ok(sessions)
    }

    /// Get sessions for a project with pagination support
    /// Returns (sessions, total_count) to support pagination metadata
    pub async fn get_sessions_by_project_hash_paginated(
        &self,
        project_hash: &str,
        limit: Option<u32>,
        offset: u32,
    ) -> AppResult<(Vec<Session>, u32)> {
        // Get total count first
        let total_count: i64 = sqlx::query_scalar(
            "SELECT COUNT(*) FROM sessions WHERE project_hash = $1"
        )
        .bind(project_hash)
        .fetch_one(&*self.pool)
        .await
        .map_err(|e| {
            AppError::DatabaseError(format!("Failed to count sessions: {}", e))
        })?;

        // Build query with pagination
        let query = if let Some(limit) = limit {
            format!(
                "SELECT * FROM sessions WHERE project_hash = $1 ORDER BY updated_at DESC LIMIT {} OFFSET {}",
                limit, offset
            )
        } else {
            "SELECT * FROM sessions WHERE project_hash = $1 ORDER BY updated_at DESC".to_string()
        };

        let rows = sqlx::query(&query)
            .bind(project_hash)
            .fetch_all(&*self.pool)
            .await
            .map_err(|e| {
                AppError::DatabaseError(format!("Failed to fetch sessions for project: {}", e))
            })?;

        let mut sessions = Vec::new();

        for row in rows {
            match self.row_to_session(&row).await {
                Ok(session) => {
                    sessions.push(session);
                }
                Err(e) => {
                    let session_id_for_log: String = row
                        .try_get("id")
                        .unwrap_or_else(|_| "unknown_id".to_string());
                    log::error!(
                        "Failed to process session with id '{}': {}",
                        session_id_for_log,
                        e
                    );
                    continue;
                }
            }
        }

        Ok((sessions, total_count as u32))
    }

    /// Delete all sessions for a project
    pub async fn delete_all_sessions(&self, project_hash: &str) -> AppResult<()> {
        // Delete all sessions with the given project hash
        sqlx::query("DELETE FROM sessions WHERE project_hash = $1")
            .bind(project_hash)
            .execute(&*self.pool)
            .await
            .map_err(|e| {
                AppError::DatabaseError(format!("Failed to delete sessions for project: {}", e))
            })?;

        Ok(())
    }

    pub async fn sync_task_description_history(
        &self,
        session_id: &str,
        history: &[String],
    ) -> AppResult<()> {
        let mut tx =
            self.pool.begin().await.map_err(|e| {
                AppError::DatabaseError(format!("Failed to begin transaction: {}", e))
            })?;

        sqlx::query("DELETE FROM task_description_history WHERE session_id = $1")
            .bind(session_id)
            .execute(&mut *tx)
            .await
            .map_err(|e| {
                AppError::DatabaseError(format!(
                    "Failed to delete existing task description history: {}",
                    e
                ))
            })?;

        let now = date_utils::get_timestamp();
        for description in history {
            sqlx::query("INSERT INTO task_description_history (session_id, description, created_at) VALUES ($1, $2, $3)")
                .bind(session_id)
                .bind(description)
                .bind(now)
                .execute(&mut *tx)
                .await
                .map_err(|e| AppError::DatabaseError(format!("Failed to insert task description history: {}", e)))?;
        }

        tx.commit()
            .await
            .map_err(|e| AppError::DatabaseError(format!("Failed to commit transaction: {}", e)))?;

        Ok(())
    }

    pub async fn get_task_description_history(
        &self,
        session_id: &str,
    ) -> AppResult<Vec<(String, i64)>> {
        let rows = sqlx::query("SELECT description, created_at FROM task_description_history WHERE session_id = $1 ORDER BY created_at ASC")
            .bind(session_id)
            .fetch_all(&*self.pool)
            .await
            .map_err(|e| AppError::DatabaseError(format!("Failed to fetch task description history: {}", e)))?;

        let mut history = Vec::new();
        for row in rows {
            let description: String = row.try_get("description")?;
            let created_at: i64 = row.try_get("created_at")?;
            history.push((description, created_at));
        }

        Ok(history)
    }

    pub async fn clear_task_description_history(&self, session_id: &str) -> AppResult<()> {
        sqlx::query("DELETE FROM task_description_history WHERE session_id = $1")
            .bind(session_id)
            .execute(&*self.pool)
            .await
            .map_err(|e| {
                AppError::DatabaseError(format!("Failed to clear task description history: {}", e))
            })?;

        Ok(())
    }

    /// Append a new task description to history
    pub async fn append_task_description_history(
        &self,
        session_id: &str,
        description: &str,
    ) -> AppResult<()> {
        let now = date_utils::get_timestamp();
        sqlx::query("INSERT INTO task_description_history (session_id, description, created_at) VALUES ($1, $2, $3)")
            .bind(session_id)
            .bind(description)
            .bind(now)
            .execute(&*self.pool)
            .await
            .map_err(|e| AppError::DatabaseError(format!("Failed to append task description history: {}", e)))?;

        Ok(())
    }

    pub async fn update_session_fields(
        &self,
        session_id: &str,
        task_description: Option<&str>,
        merge_instructions: Option<&str>,
    ) -> AppResult<()> {
        let mut conn = self.pool.acquire().await.map_err(|e| {
            AppError::DatabaseError(format!("Failed to acquire connection: {}", e))
        })?;

        sqlx::query("BEGIN IMMEDIATE")
            .execute(&mut *conn)
            .await
            .map_err(|e| {
                AppError::DatabaseError(format!("Failed to begin immediate transaction: {}", e))
            })?;

        let mut updates = Vec::new();
        let mut param_index = 1;

        if task_description.is_some() {
            updates.push(format!("task_description = ${}", param_index));
            param_index += 1;
        }

        if merge_instructions.is_some() {
            updates.push(format!("merge_instructions = ${}", param_index));
            param_index += 1;
        }

        updates.push(format!("updated_at = ${}", param_index));

        let sql = format!(
            "UPDATE sessions SET {} WHERE id = ${}",
            updates.join(", "),
            param_index + 1
        );

        let now = date_utils::get_timestamp();
        let mut query = sqlx::query(&sql);

        if let Some(desc) = task_description {
            query = query.bind(desc);
        }

        if let Some(instr) = merge_instructions {
            query = query.bind(instr);
        }

        query = query.bind(now).bind(session_id);

        let result = query.execute(&mut *conn).await;

        match result {
            Ok(_) => {
                sqlx::query("COMMIT")
                    .execute(&mut *conn)
                    .await
                    .map_err(|e| {
                        AppError::DatabaseError(format!("Failed to commit transaction: {}", e))
                    })?;
                Ok(())
            }
            Err(e) => {
                let _ = sqlx::query("ROLLBACK").execute(&mut *conn).await;
                Err(AppError::DatabaseError(format!(
                    "Failed to update session fields: {}",
                    e
                )))
            }
        }
    }

    pub async fn get_file_selection_history(
        &self,
        session_id: &str,
    ) -> AppResult<Vec<(String, String, i64)>> {
        let rows = sqlx::query("SELECT included_files, force_excluded_files, created_at FROM file_selection_history WHERE session_id = $1 ORDER BY created_at ASC")
            .bind(session_id)
            .fetch_all(&*self.pool)
            .await
            .map_err(|e| AppError::DatabaseError(format!("Failed to fetch file selection history: {}", e)))?;

        let mut history = Vec::new();
        for row in rows {
            let included_files: String = row.try_get("included_files")?;
            let force_excluded_files: String = row.try_get("force_excluded_files")?;
            let created_at: i64 = row.try_get("created_at")?;
            history.push((included_files, force_excluded_files, created_at));
        }

        Ok(history)
    }

    pub async fn sync_file_selection_history(
        &self,
        session_id: &str,
        history: &[(String, String, i64)],
    ) -> AppResult<()> {
        let mut tx =
            self.pool.begin().await.map_err(|e| {
                AppError::DatabaseError(format!("Failed to begin transaction: {}", e))
            })?;

        sqlx::query("DELETE FROM file_selection_history WHERE session_id = $1")
            .bind(session_id)
            .execute(&mut *tx)
            .await
            .map_err(|e| {
                AppError::DatabaseError(format!(
                    "Failed to delete existing file selection history: {}",
                    e
                ))
            })?;

        // Now each history entry has its own timestamp
        for (included_files, force_excluded_files, created_at) in history {
            sqlx::query("INSERT INTO file_selection_history (session_id, included_files, force_excluded_files, created_at) VALUES ($1, $2, $3, $4)")
                .bind(session_id)
                .bind(included_files)
                .bind(force_excluded_files)
                .bind(created_at) // Use the individual timestamp from each entry
                .execute(&mut *tx)
                .await
                .map_err(|e| AppError::DatabaseError(format!("Failed to insert file selection history: {}", e)))?;
        }

        tx.commit()
            .await
            .map_err(|e| AppError::DatabaseError(format!("Failed to commit transaction: {}", e)))?;

        Ok(())
    }

    pub async fn get_task_history_state(&self, session_id: &str) -> AppResult<TaskHistoryState> {
        // First, get the current version and index from sessions table
        let session_row = sqlx::query(
            "SELECT task_history_version, task_history_current_index FROM sessions WHERE id = $1"
        )
        .bind(session_id)
        .fetch_optional(&*self.pool)
        .await
        .map_err(|e| AppError::DatabaseError(format!("Failed to fetch session for task history: {}", e)))?;

        let (version, mut current_index) = match session_row {
            Some(row) => {
                let version: i64 = row.try_get("task_history_version").unwrap_or(1);
                let current_index: i64 = row.try_get("task_history_current_index").unwrap_or(0);
                (version, current_index)
            }
            None => {
                return Err(AppError::DatabaseError(format!("Session not found: {}", session_id)));
            }
        };

        // Select all metadata columns with deterministic ordering
        let rows = sqlx::query(
            "SELECT description, created_at, device_id, sequence_number, version
             FROM task_description_history
             WHERE session_id = $1
             ORDER BY sequence_number ASC, created_at ASC"
        )
        .bind(session_id)
        .fetch_all(&*self.pool)
        .await
        .map_err(|e| AppError::DatabaseError(format!("Failed to fetch task history: {}", e)))?;

        let mut entries: Vec<TaskHistoryEntry> = Vec::new();
        for row in rows.iter() {
            let description: String = row.try_get("description")?;
            let created_at: i64 = row.try_get("created_at")?;
            // Defensive unwrap_or for optional metadata fields
            let device_id: Option<String> = row.try_get("device_id").ok().flatten();
            let sequence_number: i64 = row.try_get("sequence_number").unwrap_or(0);
            let entry_version: i64 = row.try_get("version").unwrap_or(1);

            entries.push(TaskHistoryEntry {
                description,
                created_at,
                device_id,
                op_type: None, // op_type not in schema
                sequence_number,
                version: entry_version,
            });
        }

        // Clamp current_index to valid range before validation
        let max_valid_index = if entries.is_empty() { 0 } else { (entries.len() as i64) - 1 };
        let original_index = current_index;
        current_index = current_index.clamp(0, max_valid_index.max(0));

        let (validated_entries, validated_index) = validate_task_history_entries(entries, current_index);
        let checksum = compute_task_history_checksum(&validated_entries, validated_index, version);

        Ok(TaskHistoryState {
            entries: validated_entries,
            current_index: validated_index,
            version,
            checksum,
        })
    }

    pub async fn sync_task_history_state(
        &self,
        session_id: &str,
        state: &TaskHistoryState,
        expected_version: i64,
    ) -> AppResult<TaskHistoryState> {
        let mut conn = self.pool.acquire().await.map_err(|e| {
            AppError::DatabaseError(format!("Failed to acquire connection: {}", e))
        })?;

        sqlx::query("BEGIN IMMEDIATE")
            .execute(&mut *conn)
            .await
            .map_err(|e| {
                AppError::DatabaseError(format!("Failed to begin immediate transaction: {}", e))
            })?;

        // Read current version and current_index from database
        let version_row = sqlx::query(
            "SELECT task_history_version, task_history_current_index FROM sessions WHERE id = $1"
        )
        .bind(session_id)
        .fetch_optional(&mut *conn)
        .await
        .map_err(|e| {
            AppError::DatabaseError(format!("Failed to fetch session version: {}", e))
        })?;

        let (current_version, current_index) = match version_row {
            Some(row) => {
                let version = row.try_get::<i64, _>("task_history_version").unwrap_or(1);
                let index = row.try_get::<i64, _>("task_history_current_index").unwrap_or(0);
                (version, index)
            }
            None => {
                let _ = sqlx::query("ROLLBACK").execute(&mut *conn).await;
                return Err(AppError::DatabaseError(format!("Session not found: {}", session_id)));
            }
        };

        if current_version != expected_version {
            let _ = sqlx::query("ROLLBACK").execute(&mut *conn).await;
            return Err(AppError::Conflict(format!(
                "Version mismatch: expected {}, got {}",
                expected_version, current_version
            )));
        }

        // Fetch current entries from database
        let current_rows = sqlx::query(
            "SELECT description, created_at, device_id, sequence_number, version
             FROM task_description_history
             WHERE session_id = $1
             ORDER BY sequence_number ASC, created_at ASC"
        )
        .bind(session_id)
        .fetch_all(&mut *conn)
        .await
        .map_err(|e| {
            AppError::DatabaseError(format!("Failed to fetch current task history: {}", e))
        })?;

        let mut current_entries: Vec<TaskHistoryEntry> = Vec::new();
        for row in current_rows.iter() {
            let description: String = row.try_get("description")?;
            let created_at: i64 = row.try_get("created_at")?;
            let device_id: Option<String> = row.try_get("device_id").ok().flatten();
            let sequence_number: i64 = row.try_get("sequence_number").unwrap_or(0);
            let entry_version: i64 = row.try_get("version").unwrap_or(1);

            current_entries.push(TaskHistoryEntry {
                description,
                created_at,
                device_id,
                op_type: None,
                sequence_number,
                version: entry_version,
            });
        }
        for entry in current_entries.iter_mut() {
            if let Some(device_id) = entry.device_id.as_ref() {
                entry.device_id = Some(device_id.to_lowercase());
            }
        }
        current_entries.sort_by(compare_task_entries);

        let (validated_entries, validated_index) =
            validate_task_history_entries(state.entries.clone(), state.current_index);

        // Idempotency check: skip writes if data is unchanged
        if equal_task_entries(&validated_entries, &current_entries) && validated_index == current_index {
            sqlx::query("COMMIT")
                .execute(&mut *conn)
                .await
                .map_err(|e| {
                    AppError::DatabaseError(format!("Failed to commit transaction: {}", e))
                })?;

            let checksum = compute_task_history_checksum(&current_entries, current_index, current_version);
            return Ok(TaskHistoryState {
                entries: current_entries,
                current_index,
                version: current_version,
                checksum,
            });
        }

        sqlx::query("DELETE FROM task_description_history WHERE session_id = $1")
            .bind(session_id)
            .execute(&mut *conn)
            .await
            .map_err(|e| {
                AppError::DatabaseError(format!("Failed to delete existing task history: {}", e))
            })?;

        for entry in &validated_entries {
            sqlx::query(
                "INSERT INTO task_description_history
                 (session_id, description, created_at, device_id, sequence_number, version)
                 VALUES ($1, $2, $3, $4, $5, $6)"
            )
            .bind(session_id)
            .bind(&entry.description)
            .bind(entry.created_at)
            .bind(&entry.device_id)
            .bind(entry.sequence_number)
            .bind(entry.version)
            .execute(&mut *conn)
            .await
            .map_err(|e| {
                AppError::DatabaseError(format!("Failed to insert task history entry: {}", e))
            })?;
        }

        let new_version = current_version + 1;
        let new_checksum = compute_task_history_checksum(&validated_entries, validated_index, new_version);

        // Extract task_description from current entry
        let new_task_description: Option<String> = validated_entries
            .get(validated_index as usize)
            .map(|e| e.description.clone());

        // Update version, current_index, and task_description in sessions table
        sqlx::query(
            "UPDATE sessions SET task_history_version = $1, task_description = $2, task_history_current_index = $3, updated_at = $4 WHERE id = $5"
        )
        .bind(new_version)
        .bind(&new_task_description)
        .bind(validated_index)
        .bind(crate::utils::date_utils::get_timestamp())
        .bind(session_id)
        .execute(&mut *conn)
        .await
        .map_err(|e| {
            AppError::DatabaseError(format!("Failed to update session version: {}", e))
        })?;

        sqlx::query("COMMIT")
            .execute(&mut *conn)
            .await
            .map_err(|e| {
                AppError::DatabaseError(format!("Failed to commit transaction: {}", e))
            })?;

        Ok(TaskHistoryState {
            entries: validated_entries,
            current_index: validated_index,
            version: new_version,
            checksum: new_checksum,
        })
    }

    pub async fn get_file_history_state(&self, session_id: &str) -> AppResult<FileHistoryState> {
        // First, get the current version and index from sessions table
        let session_row = sqlx::query(
            "SELECT file_history_version, file_history_current_index FROM sessions WHERE id = $1"
        )
        .bind(session_id)
        .fetch_optional(&*self.pool)
        .await
        .map_err(|e| AppError::DatabaseError(format!("Failed to fetch session for file history: {}", e)))?;

        let (version, current_index) = match session_row {
            Some(row) => {
                let version: i64 = row.try_get("file_history_version").unwrap_or(1);
                let current_index: i64 = row.try_get("file_history_current_index").unwrap_or(0);
                (version, current_index)
            }
            None => {
                return Err(AppError::DatabaseError(format!("Session not found: {}", session_id)));
            }
        };

        let rows = sqlx::query(
            "SELECT included_files, force_excluded_files, created_at, device_id, sequence_number, version
             FROM file_selection_history
             WHERE session_id = $1 ORDER BY created_at ASC"
        )
        .bind(session_id)
        .fetch_all(&*self.pool)
        .await
        .map_err(|e| AppError::DatabaseError(format!("Failed to fetch file history: {}", e)))?;

        let mut entries: Vec<FileSelectionHistoryEntry> = Vec::new();
        for (seq, row) in rows.iter().enumerate() {
            let included_files_raw: String = row.try_get("included_files")?;
            let force_excluded_files_raw: String = row.try_get("force_excluded_files")?;
            let created_at: i64 = row.try_get("created_at")?;
            let device_id: Option<String> = row.try_get("device_id").ok().flatten();
            let sequence_number: i64 = row.try_get("sequence_number").unwrap_or(seq as i64);
            let entry_version: i64 = row.try_get("version").unwrap_or(1);

            entries.push(FileSelectionHistoryEntry {
                included_files: normalize_file_list_text(&included_files_raw),
                force_excluded_files: normalize_file_list_text(&force_excluded_files_raw),
                created_at,
                device_id,
                op_type: None,
                sequence_number,
                version: entry_version,
            });
        }

        let (validated_entries, validated_index) = validate_file_history_entries(entries, current_index);
        let checksum = compute_file_history_checksum(&validated_entries, validated_index, version);

        Ok(FileHistoryState {
            entries: validated_entries,
            current_index: validated_index,
            version,
            checksum,
        })
    }

    pub async fn sync_file_history_state(
        &self,
        session_id: &str,
        state: &FileHistoryState,
        expected_version: i64,
    ) -> AppResult<FileHistoryState> {
        let mut conn = self.pool.acquire().await.map_err(|e| {
            AppError::DatabaseError(format!("Failed to acquire connection: {}", e))
        })?;

        sqlx::query("BEGIN IMMEDIATE")
            .execute(&mut *conn)
            .await
            .map_err(|e| {
                AppError::DatabaseError(format!("Failed to begin immediate transaction: {}", e))
            })?;

        // Read current version and current_index from database
        let version_row = sqlx::query(
            "SELECT file_history_version, file_history_current_index FROM sessions WHERE id = $1"
        )
        .bind(session_id)
        .fetch_optional(&mut *conn)
        .await
        .map_err(|e| {
            AppError::DatabaseError(format!("Failed to fetch session version: {}", e))
        })?;

        let (current_version, current_index) = match version_row {
            Some(row) => {
                let version = row.try_get::<i64, _>("file_history_version").unwrap_or(1);
                let index = row.try_get::<i64, _>("file_history_current_index").unwrap_or(0);
                (version, index)
            }
            None => {
                let _ = sqlx::query("ROLLBACK").execute(&mut *conn).await;
                return Err(AppError::DatabaseError(format!("Session not found: {}", session_id)));
            }
        };

        if current_version != expected_version {
            let _ = sqlx::query("ROLLBACK").execute(&mut *conn).await;
            return Err(AppError::Conflict(format!(
                "Version mismatch: expected {}, got {}",
                expected_version, current_version
            )));
        }

        // Fetch current entries from database
        let current_rows = sqlx::query(
            "SELECT included_files, force_excluded_files, created_at, device_id, sequence_number, version
             FROM file_selection_history
             WHERE session_id = $1
             ORDER BY created_at ASC"
        )
        .bind(session_id)
        .fetch_all(&mut *conn)
        .await
        .map_err(|e| {
            AppError::DatabaseError(format!("Failed to fetch current file history: {}", e))
        })?;

        let mut current_entries: Vec<FileSelectionHistoryEntry> = Vec::new();
        for row in current_rows.iter() {
            let included_files_raw: String = row.try_get("included_files")?;
            let force_excluded_files_raw: String = row.try_get("force_excluded_files")?;
            let created_at: i64 = row.try_get("created_at")?;
            let device_id: Option<String> = row.try_get("device_id").ok().flatten();
            let sequence_number: i64 = row.try_get("sequence_number").unwrap_or(0);
            let entry_version: i64 = row.try_get("version").unwrap_or(1);

            current_entries.push(FileSelectionHistoryEntry {
                included_files: normalize_file_list_text(&included_files_raw),
                force_excluded_files: normalize_file_list_text(&force_excluded_files_raw),
                created_at,
                device_id,
                op_type: None,
                sequence_number,
                version: entry_version,
            });
        }
        for entry in current_entries.iter_mut() {
            if let Some(device_id) = entry.device_id.as_ref() {
                entry.device_id = Some(device_id.to_lowercase());
            }
        }
        let mut current_entries = normalize_file_history_entries(current_entries);
        current_entries.sort_by(compare_file_entries);

        let normalized_state_entries = normalize_file_history_entries(state.entries.clone());
        let (validated_entries, validated_index) =
            validate_file_history_entries(normalized_state_entries, state.current_index);

        // Idempotency check: skip writes if data is unchanged
        if equal_file_entries(&validated_entries, &current_entries) && validated_index == current_index {
            sqlx::query("COMMIT")
                .execute(&mut *conn)
                .await
                .map_err(|e| {
                    AppError::DatabaseError(format!("Failed to commit transaction: {}", e))
                })?;

            let checksum = compute_file_history_checksum(&current_entries, current_index, current_version);
            return Ok(FileHistoryState {
                entries: current_entries,
                current_index,
                version: current_version,
                checksum,
            });
        }

        sqlx::query("DELETE FROM file_selection_history WHERE session_id = $1")
            .bind(session_id)
            .execute(&mut *conn)
            .await
            .map_err(|e| {
                AppError::DatabaseError(format!("Failed to delete existing file history: {}", e))
            })?;

        for entry in &validated_entries {
            sqlx::query(
                "INSERT INTO file_selection_history (session_id, included_files, force_excluded_files, created_at, device_id, sequence_number, version)
                 VALUES ($1, $2, $3, $4, $5, $6, $7)"
            )
            .bind(session_id)
            .bind(&entry.included_files)
            .bind(&entry.force_excluded_files)
            .bind(entry.created_at)
            .bind(&entry.device_id)
            .bind(entry.sequence_number)
            .bind(entry.version)
            .execute(&mut *conn)
            .await
            .map_err(|e| {
                AppError::DatabaseError(format!("Failed to insert file history entry: {}", e))
            })?;
        }

        let new_version = current_version + 1;
        let new_checksum = compute_file_history_checksum(&validated_entries, validated_index, new_version);

        // Extract included_files and force_excluded_files from current entry
        let current_entry_opt = validated_entries.get(validated_index as usize);
        let new_included_files = current_entry_opt.map(|e| e.included_files.clone());
        let new_force_excluded_files = current_entry_opt.map(|e| e.force_excluded_files.clone());

        // Update version, current_index, included_files, and force_excluded_files in sessions table
        sqlx::query(
            "UPDATE sessions SET file_history_version = $1, file_history_current_index = $2, included_files = $3, force_excluded_files = $4, updated_at = $5 WHERE id = $6"
        )
        .bind(new_version)
        .bind(validated_index)
        .bind(&new_included_files)
        .bind(&new_force_excluded_files)
        .bind(crate::utils::date_utils::get_timestamp())
        .bind(session_id)
        .execute(&mut *conn)
        .await
        .map_err(|e| {
            AppError::DatabaseError(format!("Failed to update session version: {}", e))
        })?;

        sqlx::query("COMMIT")
            .execute(&mut *conn)
            .await
            .map_err(|e| {
                AppError::DatabaseError(format!("Failed to commit transaction: {}", e))
            })?;

        Ok(FileHistoryState {
            entries: validated_entries,
            current_index: validated_index,
            version: new_version,
            checksum: new_checksum,
        })
    }

    pub fn merge_task_history_states(
        &self,
        local: &TaskHistoryState,
        remote: &TaskHistoryState,
    ) -> TaskHistoryState {
        let mut combined: Vec<TaskHistoryEntry> = Vec::new();
        combined.extend(local.entries.clone());
        combined.extend(remote.entries.clone());

        combined.sort_by(compare_task_entries);

        let mut deduped: Vec<TaskHistoryEntry> = Vec::new();
        for entry in combined {
            if let Some(last) = deduped.last() {
                if last.description == entry.description {
                    continue;
                }
            }
            deduped.push(entry);
        }

        let trimmed: Vec<TaskHistoryEntry> = deduped.into_iter().rev().take(200).rev().collect();

        let clamped_index = if trimmed.is_empty() {
            0
        } else {
            (trimmed.len() as i64) - 1
        };

        let new_version = std::cmp::max(local.version, remote.version) + 1;
        let checksum = compute_task_history_checksum(&trimmed, clamped_index, new_version);

        TaskHistoryState {
            entries: trimmed,
            current_index: clamped_index,
            version: new_version,
            checksum,
        }
    }

    pub fn merge_file_history_states(
        &self,
        local: &FileHistoryState,
        remote: &FileHistoryState,
    ) -> FileHistoryState {
        let mut combined: Vec<FileSelectionHistoryEntry> = Vec::new();
        combined.extend(local.entries.clone());
        combined.extend(remote.entries.clone());

        combined.sort_by(compare_file_entries);

        let mut deduped: Vec<FileSelectionHistoryEntry> = Vec::new();
        let mut seen: HashSet<String> = HashSet::new();

        for entry in combined {
            let key = format!("{}|{}", entry.included_files, entry.force_excluded_files);
            if !seen.contains(&key) {
                seen.insert(key);
                deduped.push(entry);
            }
        }

        let trimmed: Vec<FileSelectionHistoryEntry> = deduped.into_iter().rev().take(50).rev().collect();

        let clamped_index = if trimmed.is_empty() {
            0
        } else {
            (trimmed.len() as i64) - 1
        };

        let new_version = std::cmp::max(local.version, remote.version) + 1;
        let checksum = compute_file_history_checksum(&trimmed, clamped_index, new_version);

        FileHistoryState {
            entries: trimmed,
            current_index: clamped_index,
            version: new_version,
            checksum,
        }
    }
}

fn validate_task_history_entries(
    mut entries: Vec<TaskHistoryEntry>,
    current_index: i64,
) -> (Vec<TaskHistoryEntry>, i64) {
    if entries.is_empty() {
        return (entries, 0);
    }

    let mut repairs = Vec::new();
    let original_len = entries.len();

    for entry in entries.iter_mut() {
        if let Some(device_id) = entry.device_id.as_ref() {
            entry.device_id = Some(device_id.to_lowercase());
        }
    }

    let mut current_key: Option<(String, i64, Option<String>, i64)> = None;
    let pre_sort_index = current_index.clamp(0, (entries.len() as i64) - 1) as usize;
    if let Some(entry) = entries.get(pre_sort_index) {
        current_key = Some((
            entry.description.clone(),
            entry.created_at,
            entry.device_id.clone(),
            entry.sequence_number,
        ));
    }

    entries.sort_by(compare_task_entries);

    let mut deduped: Vec<TaskHistoryEntry> = Vec::new();
    for entry in entries {
        if let Some(last) = deduped.last() {
            if last.description == entry.description {
                continue;
            }
        }
        deduped.push(entry);
    }

    let deduplicated_len = deduped.len();
    if deduplicated_len != original_len {
        repairs.push(format!("Deduplicated {} -> {} entries", original_len, deduplicated_len));
    }

    let trimmed: Vec<TaskHistoryEntry> = deduped.into_iter().rev().take(200).rev().collect();

    let trimmed_len = trimmed.len();
    if trimmed_len != deduplicated_len {
        repairs.push(format!("Trimmed {} -> {} entries", deduplicated_len, trimmed_len));
    }

    let mut clamped_index = if trimmed.is_empty() {
        0
    } else {
        std::cmp::max(0, std::cmp::min(current_index, (trimmed.len() as i64) - 1))
    };

    if let Some((desc, created_at, device_id, sequence_number)) = current_key.as_ref() {
        if let Some(idx) = trimmed.iter().position(|entry| {
            entry.description == *desc
                && entry.created_at == *created_at
                && entry.device_id == *device_id
                && entry.sequence_number == *sequence_number
        }) {
            clamped_index = idx as i64;
        }
    }

    if clamped_index != current_index {
        repairs.push(format!("Clamped index {} -> {}", current_index, clamped_index));
    }

    if !repairs.is_empty() {
        eprintln!("[REPAIR] Task history state repaired: {}", repairs.join(", "));
    }

    (trimmed, clamped_index)
}

fn validate_file_history_entries(
    mut entries: Vec<FileSelectionHistoryEntry>,
    current_index: i64,
) -> (Vec<FileSelectionHistoryEntry>, i64) {
    if entries.is_empty() {
        return (entries, 0);
    }

    let mut repairs = Vec::new();
    let original_len = entries.len();

    for entry in entries.iter_mut() {
        if let Some(device_id) = entry.device_id.as_ref() {
            entry.device_id = Some(device_id.to_lowercase());
        }
    }

    let mut current_key: Option<(String, String, i64, Option<String>, i64)> = None;
    let pre_sort_index = current_index.clamp(0, (entries.len() as i64) - 1) as usize;
    if let Some(entry) = entries.get(pre_sort_index) {
        current_key = Some((
            entry.included_files.clone(),
            entry.force_excluded_files.clone(),
            entry.created_at,
            entry.device_id.clone(),
            entry.sequence_number,
        ));
    }

    entries.sort_by(compare_file_entries);

    let mut deduped: Vec<FileSelectionHistoryEntry> = Vec::new();
    let mut seen: HashSet<String> = HashSet::new();

    for entry in entries {
        let key = format!("{}|{}", entry.included_files, entry.force_excluded_files);
        if !seen.contains(&key) {
            seen.insert(key);
            deduped.push(entry);
        }
    }

    let deduplicated_len = deduped.len();
    if deduplicated_len != original_len {
        repairs.push(format!("Deduplicated {} -> {} entries", original_len, deduplicated_len));
    }

    let trimmed: Vec<FileSelectionHistoryEntry> = deduped.into_iter().rev().take(50).rev().collect();

    let trimmed_len = trimmed.len();
    if trimmed_len != deduplicated_len {
        repairs.push(format!("Trimmed {} -> {} entries", deduplicated_len, trimmed_len));
    }

    let mut clamped_index = if trimmed.is_empty() {
        0
    } else {
        std::cmp::max(0, std::cmp::min(current_index, (trimmed.len() as i64) - 1))
    };

    if let Some((included_files, force_excluded_files, created_at, device_id, sequence_number)) =
        current_key.as_ref()
    {
        if let Some(idx) = trimmed.iter().position(|entry| {
            entry.included_files == *included_files
                && entry.force_excluded_files == *force_excluded_files
                && entry.created_at == *created_at
                && entry.device_id == *device_id
                && entry.sequence_number == *sequence_number
        }) {
            clamped_index = idx as i64;
        }
    }

    if clamped_index != current_index {
        repairs.push(format!("Clamped index {} -> {}", current_index, clamped_index));
    }

    if !repairs.is_empty() {
        eprintln!("[REPAIR] File history state repaired: {}", repairs.join(", "));
    }

    (trimmed, clamped_index)
}

fn compute_task_history_checksum(entries: &[TaskHistoryEntry], current_index: i64, version: i64) -> String {
    #[derive(Serialize)]
    #[serde(rename_all = "camelCase")]
    struct ChecksumEntry {
        value: String,
        timestamp_ms: i64,
        #[serde(skip_serializing_if = "Option::is_none")]
        device_id: Option<String>,
        sequence_number: i64,
        version: i64,
    }

    #[derive(Serialize)]
    #[serde(rename_all = "camelCase")]
    struct ChecksumData {
        current_index: i64,
        entries: Vec<ChecksumEntry>,
        version: i64,
    }

    let checksum_entries = entries
        .iter()
        .map(|entry| ChecksumEntry {
            value: entry.description.clone(),
            timestamp_ms: entry.created_at,
            device_id: entry.device_id.clone(),
            sequence_number: entry.sequence_number,
            version: entry.version,
        })
        .collect();

    let data = ChecksumData {
        current_index,
        entries: checksum_entries,
        version,
    };

    let json = serde_json::to_string(&data).unwrap_or_default();
    sha256_hash(&json)
}

fn compute_file_history_checksum(entries: &[FileSelectionHistoryEntry], current_index: i64, version: i64) -> String {
    #[derive(Serialize)]
    #[serde(rename_all = "camelCase")]
    struct ChecksumEntry {
        included_files: String,
        force_excluded_files: String,
        timestamp_ms: i64,
        #[serde(skip_serializing_if = "Option::is_none")]
        device_id: Option<String>,
        sequence_number: i64,
        version: i64,
    }

    #[derive(Serialize)]
    #[serde(rename_all = "camelCase")]
    struct ChecksumData {
        current_index: i64,
        entries: Vec<ChecksumEntry>,
        version: i64,
    }

    let checksum_entries = entries
        .iter()
        .map(|entry| ChecksumEntry {
            included_files: entry.included_files.clone(),
            force_excluded_files: entry.force_excluded_files.clone(),
            timestamp_ms: entry.created_at,
            device_id: entry.device_id.clone(),
            sequence_number: entry.sequence_number,
            version: entry.version,
        })
        .collect();

    let data = ChecksumData {
        current_index,
        entries: checksum_entries,
        version,
    };

    let json = serde_json::to_string(&data).unwrap_or_default();
    sha256_hash(&json)
}

fn equal_task_entries(a: &[TaskHistoryEntry], b: &[TaskHistoryEntry]) -> bool {
    a.len() == b.len() &&
    a.iter().zip(b.iter()).all(|(entry_a, entry_b)| {
        entry_a.description == entry_b.description &&
        entry_a.created_at == entry_b.created_at &&
        entry_a.device_id == entry_b.device_id &&
        entry_a.sequence_number == entry_b.sequence_number
    })
}

fn compare_task_entries(a: &TaskHistoryEntry, b: &TaskHistoryEntry) -> std::cmp::Ordering {
    let device_a = a.device_id.as_deref().unwrap_or("");
    let device_b = b.device_id.as_deref().unwrap_or("");

    if device_a == device_b {
        let seq_cmp = a.sequence_number.cmp(&b.sequence_number);
        if seq_cmp != std::cmp::Ordering::Equal {
            return seq_cmp;
        }
    }

    let time_diff = (a.created_at - b.created_at).abs();
    if time_diff <= 100 {
        device_a.cmp(device_b)
    } else {
        a.created_at.cmp(&b.created_at)
    }
}

fn compare_file_entries(a: &FileSelectionHistoryEntry, b: &FileSelectionHistoryEntry) -> std::cmp::Ordering {
    let device_a = a.device_id.as_deref().unwrap_or("");
    let device_b = b.device_id.as_deref().unwrap_or("");

    if device_a == device_b {
        let seq_cmp = a.sequence_number.cmp(&b.sequence_number);
        if seq_cmp != std::cmp::Ordering::Equal {
            return seq_cmp;
        }
    }

    let time_diff = (a.created_at - b.created_at).abs();
    if time_diff <= 100 {
        device_a.cmp(device_b)
    } else {
        a.created_at.cmp(&b.created_at)
    }
}

fn equal_file_entries(a: &[FileSelectionHistoryEntry], b: &[FileSelectionHistoryEntry]) -> bool {
    a.len() == b.len() &&
    a.iter().zip(b.iter()).all(|(entry_a, entry_b)| {
        entry_a.included_files == entry_b.included_files &&
        entry_a.force_excluded_files == entry_b.force_excluded_files &&
        entry_a.created_at == entry_b.created_at &&
        entry_a.sequence_number == entry_b.sequence_number
    })
}

fn normalize_file_history_entries(entries: Vec<FileSelectionHistoryEntry>) -> Vec<FileSelectionHistoryEntry> {
    entries
        .into_iter()
        .map(|mut entry| {
            entry.included_files = normalize_file_list_text(&entry.included_files);
            entry.force_excluded_files = normalize_file_list_text(&entry.force_excluded_files);
            entry
        })
        .collect()
}

fn normalize_file_list_text(raw: &str) -> String {
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return "[]".to_string();
    }

    let parsed = if trimmed.starts_with('[') && trimmed.ends_with(']') {
        serde_json::from_str::<Vec<String>>(trimmed).ok()
    } else {
        None
    };

    let mut items: Vec<String> = if let Some(list) = parsed {
        list
    } else {
        trimmed
            .lines()
            .map(|line| line.trim().to_string())
            .filter(|line| !line.is_empty())
            .collect()
    };

    items.sort();
    items.dedup();

    serde_json::to_string(&items).unwrap_or_else(|_| "[]".to_string())
}
