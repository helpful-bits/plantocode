use crate::error::{AppError, AppResult};
use crate::models::Session;
use crate::utils::date_utils;
use sqlx::{Row, SqlitePool, sqlite::SqliteRow};
use std::sync::Arc;

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
        log::debug!(
            "Repository: Creating session with ID: {}, Name: {}, ProjectDirectory: {}",
            session.id,
            session.name,
            session.project_directory
        );

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
                created_at, updated_at, video_analysis_prompt
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
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

        let log_shape = |items: &Vec<String>, label: &str| {
            let total = items.len();
            let abs = items
                .iter()
                .filter(|s| std::path::Path::new(s).is_absolute())
                .count();
            let rel = total.saturating_sub(abs);
            let sample = items.iter().take(3).cloned().collect::<Vec<_>>();
            log::debug!(
                "SessionRepository {} paths: total={}, rel={}, abs={}, sample={:?}",
                label,
                total,
                rel,
                abs,
                sample
            );
        };
        log_shape(&session.included_files, "included_files");
        log_shape(&session.force_excluded_files, "force_excluded_files");

        let result = result
            .bind(session.included_files.join("\n"))
            .bind(session.force_excluded_files.join("\n"))
            .bind(session.created_at)
            .bind(session.updated_at)
            .bind(&session.video_analysis_prompt)
            .execute(&mut *tx)
            .await;

        if let Err(e) = result {
            // Rollback transaction on error
            let _ = tx.rollback().await;
            log::error!("Repository: Failed to insert session {}: {}", session.id, e);
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

        log::debug!(
            "Repository: Updating session with ID: {}, Name: {}, ProjectDirectory: {}",
            session.id,
            session.name,
            session.project_directory
        );

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
                    log::debug!(
                        "Conflict detected for session {}: DB updated_at={}, client updated_at={}. Merging changes.",
                        session.id,
                        current_updated_at,
                        session.updated_at
                    );

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

                    log::debug!(
                        "Merged session {}: included {} + {} -> {} (client exclusions: {})",
                        session.id,
                        db_included.len(),
                        client_included.len(),
                        included_final.len(),
                        excluded_final.len()
                    );

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

        let log_shape = |items: &str, label: &str| {
            let lines: Vec<&str> = items.lines().filter(|l| !l.is_empty()).collect();
            let total = lines.len();
            let abs = lines
                .iter()
                .filter(|s| std::path::Path::new(s).is_absolute())
                .count();
            let rel = total.saturating_sub(abs);
            let sample: Vec<&str> = lines.iter().take(3).copied().collect();
            log::debug!(
                "SessionRepository {} paths: total={}, rel={}, abs={}, sample={:?}",
                label,
                total,
                rel,
                abs,
                sample
            );
        };
        log_shape(&included_final, "included_files");
        log_shape(&excluded_final, "force_excluded_files");

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
                video_analysis_prompt = $11
            WHERE id = $12
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
        .bind(date_utils::get_timestamp()) // Use current timestamp, not client's
        .bind(&session.video_analysis_prompt)
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
                log::error!("Repository: Failed to update session {}: {}", session.id, e);
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

        log::debug!(
            "Repository: Atomically merging {} files (respecting exclusions) into session {}",
            files_to_add.len(),
            session_id
        );

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
                log::debug!("Skipping file in force_excluded_files: {}", trimmed);
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

                log::debug!(
                    "Repository: Successfully merged {} new files (respecting exclusions) into session {}",
                    newly_added.len(),
                    session_id
                );

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
}
