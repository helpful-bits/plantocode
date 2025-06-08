use std::sync::Arc;
use sqlx::{sqlite::SqliteRow, Row, SqlitePool};
use crate::error::{AppError, AppResult};
use crate::models::Session;
use crate::utils::get_timestamp;

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
        let title_regex: Option<String> = row.try_get("title_regex")?;
        let content_regex: Option<String> = row.try_get("content_regex")?;
        let negative_title_regex: Option<String> = row.try_get("negative_title_regex")?;
        let negative_content_regex: Option<String> = row.try_get("negative_content_regex")?;
        let title_regex_description: Option<String> = row.try_get("title_regex_description")?;
        let content_regex_description: Option<String> = row.try_get("content_regex_description")?;
        let negative_title_regex_description: Option<String> = row.try_get("negative_title_regex_description")?;
        let negative_content_regex_description: Option<String> = row.try_get("negative_content_regex_description")?;
        let regex_summary_explanation: Option<String> = row.try_get("regex_summary_explanation")?;
        
        let is_regex_active: bool = row.try_get::<'_, i64, _>("is_regex_active").unwrap_or(0) == 1;
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
            title_regex,
            content_regex,
            negative_title_regex,
            negative_content_regex,
            title_regex_description,
            content_regex_description,
            negative_title_regex_description,
            negative_content_regex_description,
            regex_summary_explanation,
            is_regex_active,
            search_selected_files_only,
            model_used,
            created_at,
            updated_at,
            included_files: Some(included_files),
            force_excluded_files: Some(force_excluded_files),
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
                task_description, search_term, title_regex, content_regex,
                negative_title_regex, negative_content_regex, 
                title_regex_description, content_regex_description,
                negative_title_regex_description, negative_content_regex_description,
                regex_summary_explanation, is_regex_active,
                search_selected_files_only, model_used,
                created_at, updated_at
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20)
            "#)
            .bind(&session.id)
            .bind(&session.name)
            .bind(&session.project_directory)
            .bind(&session.project_hash)
            .bind(&session.task_description)
            .bind(&session.search_term)
            .bind(&session.title_regex)
            .bind(&session.content_regex)
            .bind(&session.negative_title_regex)
            .bind(&session.negative_content_regex)
            .bind(&session.title_regex_description)
            .bind(&session.content_regex_description)
            .bind(&session.negative_title_regex_description)
            .bind(&session.negative_content_regex_description)
            .bind(&session.regex_summary_explanation)
            .bind(if session.is_regex_active { 1i64 } else { 0i64 })
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
        if let Some(included_files) = &session.included_files {
            for path in included_files {
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
        }
        
        // Insert excluded files
        if let Some(excluded_files) = &session.force_excluded_files {
            for path in excluded_files {
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
        }
        
        // Commit transaction
        tx.commit().await
            .map_err(|e| AppError::DatabaseError(format!("Failed to commit transaction: {}", e)))?;
        
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
                title_regex = $6,
                content_regex = $7,
                negative_title_regex = $8,
                negative_content_regex = $9,
                title_regex_description = $10,
                content_regex_description = $11,
                negative_title_regex_description = $12,
                negative_content_regex_description = $13,
                regex_summary_explanation = $14,
                is_regex_active = $15,
                search_selected_files_only = $17,
                model_used = $18,
                updated_at = $19
            WHERE id = $20
            "#)
            .bind(&session.name)
            .bind(&session.project_directory)
            .bind(&session.project_hash)
            .bind(&session.task_description)
            .bind(&session.search_term)
            .bind(&session.title_regex)
            .bind(&session.content_regex)
            .bind(&session.negative_title_regex)
            .bind(&session.negative_content_regex)
            .bind(&session.title_regex_description)
            .bind(&session.content_regex_description)
            .bind(&session.negative_title_regex_description)
            .bind(&session.negative_content_regex_description)
            .bind(&session.regex_summary_explanation)
            .bind(if session.is_regex_active { 1i64 } else { 0i64 })
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
        if let Some(included_files) = &session.included_files {
            for path in included_files {
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
        }
        
        // Insert excluded files
        if let Some(excluded_files) = &session.force_excluded_files {
            for path in excluded_files {
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
}