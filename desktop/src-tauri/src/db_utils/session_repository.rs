use std::sync::Arc;
use sqlx::{sqlite::SqliteRow, Row, SqlitePool};
use crate::error::{AppError, AppResult};
use crate::models::Session;
use crate::utils::date_utils;

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
        let search_selected_files_only = row.try_get::<'_, i64, _>("search_selected_files_only").unwrap_or(0) == 1;
        let model_used: Option<String> = row.try_get("model_used")?;
        
        let created_at: i64 = row.try_get::<'_, i64, _>("created_at")?;
        let updated_at: i64 = row.try_get::<'_, i64, _>("updated_at")?;
        
        // Fetch included and excluded files
        let included_files = self.get_included_files(&id).await?;
        let force_excluded_files = self.get_excluded_files(&id).await?;
        
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
                },
                Err(e) => {
                    let session_id_for_log: String = row.try_get("id").unwrap_or_else(|_| "unknown_id".to_string());
                    log::error!("Failed to process session with id '{}': {}", session_id_for_log, e);
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
            },
            None => Ok(None)
        }
    }
    
    /// Get included files for a session
    pub async fn get_included_files(&self, session_id: &str) -> AppResult<Vec<String>> {
        let rows = sqlx::query("SELECT path FROM included_files WHERE session_id = $1")
            .bind(session_id)
            .fetch_all(&*self.pool)
            .await
            .map_err(|e| AppError::DatabaseError(format!("Failed to fetch included files: {}", e)))?;
            
        let mut included_files = Vec::new();
        
        for row in rows {
            let path: String = row.try_get::<'_, String, _>("path")?;
            included_files.push(path);
        }
        
        Ok(included_files)
    }
    
    /// Get excluded files for a session
    pub async fn get_excluded_files(&self, session_id: &str) -> AppResult<Vec<String>> {
        let rows = sqlx::query("SELECT path FROM excluded_files WHERE session_id = $1")
            .bind(session_id)
            .fetch_all(&*self.pool)
            .await
            .map_err(|e| AppError::DatabaseError(format!("Failed to fetch excluded files: {}", e)))?;
            
        let mut excluded_files = Vec::new();
        
        for row in rows {
            let path: String = row.try_get::<'_, String, _>("path")?;
            excluded_files.push(path);
        }
        
        Ok(excluded_files)
    }
    
    /// Create a new session
    pub async fn create_session(&self, session: &Session) -> AppResult<()> {
        log::debug!("Repository: Creating session with ID: {}, Name: {}, ProjectDirectory: {}", 
                   session.id, session.name, session.project_directory);
        
        // Start transaction
        let mut tx = self.pool.begin().await
            .map_err(|e| AppError::DatabaseError(format!("Failed to begin transaction: {}", e)))?;
            
        // Insert session
        let result = sqlx::query(
            r#"
            INSERT INTO sessions (
                id, name, project_directory, project_hash, 
                task_description, search_term, search_selected_files_only, model_used,
                created_at, updated_at
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
            "#)
            .bind(&session.id)
            .bind(&session.name)
            .bind(&session.project_directory)
            .bind(&session.project_hash)
            .bind(&session.task_description)
            .bind(&session.search_term)
            .bind(if session.search_selected_files_only { 1i64 } else { 0i64 })
            .bind(&session.model_used)
            .bind(session.created_at)
            .bind(session.updated_at)
            .execute(&mut *tx)
            .await;
            
        if let Err(e) = result {
            // Rollback transaction on error
            let _ = tx.rollback().await;
            log::error!("Repository: Failed to insert session {}: {}", session.id, e);
            return Err(AppError::DatabaseError(format!("Failed to insert session: {}", e)));
        }
        
        // Insert included files
        for path in &session.included_files {
            let result = sqlx::query("INSERT INTO included_files (session_id, path) VALUES ($1, $2)")
                .bind(&session.id)
                .bind(path)
                .execute(&mut *tx)
                .await;
                
            if let Err(e) = result {
                // Rollback transaction on error
                let _ = tx.rollback().await;
                log::error!("Repository: Failed to insert included file {} for session {}: {}", path, session.id, e);
                return Err(AppError::DatabaseError(format!("Failed to insert included file: {}", e)));
            }
        }
        
        // Insert excluded files
        for path in &session.force_excluded_files {
                let result = sqlx::query("INSERT INTO excluded_files (session_id, path) VALUES ($1, $2)")
                    .bind(&session.id)
                    .bind(path)
                    .execute(&mut *tx)
                    .await;
                    
                if let Err(e) = result {
                    // Rollback transaction on error
                    let _ = tx.rollback().await;
                    return Err(AppError::DatabaseError(format!("Failed to insert excluded file: {}", e)));
                }
            }
        
        // Commit transaction
        tx.commit().await
            .map_err(|e| AppError::DatabaseError(format!("Failed to commit transaction: {}", e)))?;

        if let Some(ref task_description) = session.task_description {
            self.add_task_description_history_entry(&session.id, task_description).await?;
        }
        
        Ok(())
    }
    
    /// Update an existing session
    pub async fn update_session(&self, session: &Session) -> AppResult<()> {
        log::debug!("Repository: Updating session with ID: {}, Name: {}, ProjectDirectory: {}", 
                   session.id, session.name, session.project_directory);
        
        // Start transaction
        let mut tx = self.pool.begin().await
            .map_err(|e| AppError::DatabaseError(format!("Failed to begin transaction: {}", e)))?;
            
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
                updated_at = $8
            WHERE id = $9
            "#)
            .bind(&session.name)
            .bind(&session.project_directory)
            .bind(&session.project_hash)
            .bind(&session.task_description)
            .bind(&session.search_term)
            .bind(if session.search_selected_files_only { 1i64 } else { 0i64 })
            .bind(&session.model_used)
            .bind(session.updated_at)
            .bind(&session.id)
            .execute(&mut *tx)
            .await;
            
        if let Err(e) = result {
            // Rollback transaction on error
            let _ = tx.rollback().await;
            log::error!("Repository: Failed to update session {}: {}", session.id, e);
            return Err(AppError::DatabaseError(format!("Failed to update session: {}", e)));
        }
        
        // Delete existing included files
        let result = sqlx::query("DELETE FROM included_files WHERE session_id = $1")
            .bind(&session.id)
            .execute(&mut *tx)
            .await;
            
        if let Err(e) = result {
            // Rollback transaction on error
            let _ = tx.rollback().await;
            return Err(AppError::DatabaseError(format!("Failed to delete existing included files: {}", e)));
        }
        
        // Delete existing excluded files
        let result = sqlx::query("DELETE FROM excluded_files WHERE session_id = $1")
            .bind(&session.id)
            .execute(&mut *tx)
            .await;
            
        if let Err(e) = result {
            // Rollback transaction on error
            let _ = tx.rollback().await;
            return Err(AppError::DatabaseError(format!("Failed to delete existing excluded files: {}", e)));
        }
        
        // Insert included files
        for path in &session.included_files {
            let result = sqlx::query("INSERT INTO included_files (session_id, path) VALUES ($1, $2)")
                .bind(&session.id)
                .bind(path)
                .execute(&mut *tx)
                .await;
                
            if let Err(e) = result {
                // Rollback transaction on error
                let _ = tx.rollback().await;
                return Err(AppError::DatabaseError(format!("Failed to insert included file: {}", e)));
            }
        }
        
        // Insert excluded files
        for path in &session.force_excluded_files {
                let result = sqlx::query("INSERT INTO excluded_files (session_id, path) VALUES ($1, $2)")
                    .bind(&session.id)
                    .bind(path)
                    .execute(&mut *tx)
                    .await;
                    
                if let Err(e) = result {
                    // Rollback transaction on error
                    let _ = tx.rollback().await;
                    return Err(AppError::DatabaseError(format!("Failed to insert excluded file: {}", e)));
                }
            }
        
        // Commit transaction
        tx.commit().await
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
    pub async fn get_session_by_project_hash(&self, project_hash: &str) -> AppResult<Option<Session>> {
        let row = sqlx::query("SELECT * FROM sessions WHERE project_hash = $1 ORDER BY updated_at DESC LIMIT 1")
            .bind(project_hash)
            .fetch_optional(&*self.pool)
            .await
            .map_err(|e| AppError::DatabaseError(format!("Failed to fetch session by project hash: {}", e)))?;
            
        match row {
            Some(row) => {
                let session = self.row_to_session(&row).await?;
                Ok(Some(session))
            },
            None => Ok(None)
        }
    }

    /// Get all sessions for a specific project hash, ordered by most recent first
    pub async fn get_sessions_by_project_hash(&self, project_hash: &str) -> AppResult<Vec<Session>> {
        let rows = sqlx::query("SELECT * FROM sessions WHERE project_hash = $1 ORDER BY updated_at DESC")
            .bind(project_hash)
            .fetch_all(&*self.pool)
            .await
            .map_err(|e| AppError::DatabaseError(format!("Failed to fetch sessions for project: {}", e)))?;
            
        let mut sessions = Vec::new();
        
        for row in rows {
            match self.row_to_session(&row).await {
                Ok(session) => {
                    sessions.push(session);
                },
                Err(e) => {
                    let session_id_for_log: String = row.try_get("id").unwrap_or_else(|_| "unknown_id".to_string());
                    log::error!("Failed to process session with id '{}': {}", session_id_for_log, e);
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
            .map_err(|e| AppError::DatabaseError(format!("Failed to delete sessions for project: {}", e)))?;
            
        Ok(())
    }

    pub async fn add_task_description_history_entry(&self, session_id: &str, description: &str) -> AppResult<()> {
        let now = date_utils::get_timestamp();
        
        sqlx::query("INSERT INTO task_description_history (session_id, description, created_at) VALUES ($1, $2, $3)")
            .bind(session_id)
            .bind(description)
            .bind(now)
            .execute(&*self.pool)
            .await
            .map_err(|e| AppError::DatabaseError(format!("Failed to insert task description history: {}", e)))?;
        
        sqlx::query(
            "DELETE FROM task_description_history 
             WHERE session_id = $1 
             AND id NOT IN (
                 SELECT id FROM task_description_history 
                 WHERE session_id = $1 
                 ORDER BY created_at DESC 
                 LIMIT 5
             )"
        )
        .bind(session_id)
        .execute(&*self.pool)
        .await
        .map_err(|e| AppError::DatabaseError(format!("Failed to prune task description history: {}", e)))?;
        
        Ok(())
    }

    pub async fn get_task_description_history(&self, session_id: &str) -> AppResult<Vec<(String, i64)>> {
        let rows = sqlx::query("SELECT description, created_at FROM task_description_history WHERE session_id = $1 ORDER BY created_at DESC")
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
            .map_err(|e| AppError::DatabaseError(format!("Failed to clear task description history: {}", e)))?;
        
        Ok(())
    }
}