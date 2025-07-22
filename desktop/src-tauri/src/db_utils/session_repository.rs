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
                created_at, updated_at
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
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
        .bind(&session.model_used)
        .bind(session.included_files.join("\n"))
        .bind(session.force_excluded_files.join("\n"))
        .bind(session.created_at)
        .bind(session.updated_at)
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

    /// Update an existing session
    pub async fn update_session(&self, session: &Session) -> AppResult<()> {
        log::debug!(
            "Repository: Updating session with ID: {}, Name: {}, ProjectDirectory: {}",
            session.id,
            session.name,
            session.project_directory
        );

        // Start transaction
        let mut tx =
            self.pool.begin().await.map_err(|e| {
                AppError::DatabaseError(format!("Failed to begin transaction: {}", e))
            })?;

        // Update session
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
                updated_at = $10
            WHERE id = $11
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
        .bind(session.included_files.join("\n"))
        .bind(session.force_excluded_files.join("\n"))
        .bind(session.updated_at)
        .bind(&session.id)
        .execute(&mut *tx)
        .await;

        if let Err(e) = result {
            // Rollback transaction on error
            let _ = tx.rollback().await;
            log::error!("Repository: Failed to update session {}: {}", session.id, e);
            return Err(AppError::DatabaseError(format!(
                "Failed to update session: {}",
                e
            )));
        }

        // Commit transaction
        tx.commit()
            .await
            .map_err(|e| AppError::DatabaseError(format!("Failed to commit transaction: {}", e)))?;

        Ok(())
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
        history: &[(String, String)],
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

        let now = crate::utils::date_utils::get_timestamp();
        for (included_files, force_excluded_files) in history {
            sqlx::query("INSERT INTO file_selection_history (session_id, included_files, force_excluded_files, created_at) VALUES ($1, $2, $3, $4)")
                .bind(session_id)
                .bind(included_files)
                .bind(force_excluded_files)
                .bind(now)
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
