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
        
        let task_description: Option<String> = row.try_get::<'_, Option<String>, _>("task_description").unwrap_or(None);
        let search_term: Option<String> = row.try_get::<'_, Option<String>, _>("search_term").unwrap_or(None);
        let title_regex: Option<String> = row.try_get::<'_, Option<String>, _>("title_regex").unwrap_or(None);
        let content_regex: Option<String> = row.try_get::<'_, Option<String>, _>("content_regex").unwrap_or(None);
        let negative_title_regex: Option<String> = row.try_get::<'_, Option<String>, _>("negative_title_regex").unwrap_or(None);
        let negative_content_regex: Option<String> = row.try_get::<'_, Option<String>, _>("negative_content_regex").unwrap_or(None);
        
        let is_regex_active: bool = row.try_get::<'_, i64, _>("is_regex_active").unwrap_or(0) == 1;
        let codebase_structure: Option<String> = row.try_get::<'_, Option<String>, _>("codebase_structure").unwrap_or(None);
        let search_selected_files_only: bool = row.try_get::<'_, i64, _>("search_selected_files_only").unwrap_or(0) == 1;
        let model_used: Option<String> = row.try_get::<'_, Option<String>, _>("model_used").unwrap_or(None);
        
        let created_at: i64 = row.try_get::<'_, i64, _>("created_at")?;
        let updated_at: i64 = row.try_get::<'_, i64, _>("updated_at")?;
        
        // Fetch included and excluded files
        let included_files = self.get_included_files(&id).await?;
        let excluded_files = self.get_excluded_files(&id).await?;
        
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
            is_regex_active,
            codebase_structure,
            search_selected_files_only,
            model_used,
            created_at,
            updated_at,
            included_files: Some(included_files),
            excluded_files: Some(excluded_files),
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
            let session = self.row_to_session(&row).await?;
            sessions.push(session);
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
        // Start transaction
        let mut tx = self.pool.begin().await
            .map_err(|e| AppError::DatabaseError(format!("Failed to begin transaction: {}", e)))?;
            
        // Insert session
        let result = sqlx::query(
            r#"
            INSERT INTO sessions (
                id, name, project_directory, project_hash, 
                task_description, search_term, title_regex, content_regex,
                negative_title_regex, negative_content_regex, is_regex_active,
                codebase_structure, search_selected_files_only, model_used,
                created_at, updated_at
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
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
            .bind(if session.is_regex_active { 1i64 } else { 0i64 })
            .bind(&session.codebase_structure)
            .bind(if session.search_selected_files_only { 1i64 } else { 0i64 })
            .bind(&session.model_used)
            .bind(session.created_at)
            .bind(session.updated_at)
            .execute(&mut *tx)
            .await;
            
        if let Err(e) = result {
            // Rollback transaction on error
            let _ = tx.rollback().await;
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
                    return Err(AppError::DatabaseError(format!("Failed to insert included file: {}", e)));
                }
            }
        }
        
        // Insert excluded files
        if let Some(excluded_files) = &session.excluded_files {
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
                is_regex_active = $10,
                codebase_structure = $11,
                search_selected_files_only = $12,
                model_used = $13,
                updated_at = $14
            WHERE id = $15
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
            .bind(if session.is_regex_active { 1i64 } else { 0i64 })
            .bind(&session.codebase_structure)
            .bind(if session.search_selected_files_only { 1i64 } else { 0i64 })
            .bind(&session.model_used)
            .bind(session.updated_at)
            .bind(&session.id)
            .execute(&mut *tx)
            .await;
            
        if let Err(e) = result {
            // Rollback transaction on error
            let _ = tx.rollback().await;
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
        if let Some(excluded_files) = &session.excluded_files {
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
}