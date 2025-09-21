use crate::error::AppResult;
use crate::events::terminal_events::{emit_terminal_status_changed, emit_terminal_deleted, TerminalStatusChangedPayload, TerminalDeletedPayload};
use serde::{Deserialize, Serialize};
use sqlx::{Row, SqlitePool, sqlite::SqliteRow};
use std::sync::Arc;
use tauri::AppHandle;
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TerminalSession {
    pub id: String,
    pub job_id: String,
    pub status: String,
    pub process_pid: Option<i64>,
    pub created_at: i64,
    pub updated_at: i64,
    pub last_output_at: Option<i64>,
    pub exit_code: Option<i64>,
    pub working_directory: Option<String>,
    pub environment_vars: Option<String>, // JSON string
    pub title: Option<String>,
    pub output_log: Option<String>, // Terminal output log
}

impl TerminalSession {
    fn from_row(row: &SqliteRow) -> AppResult<Self> {
        Ok(TerminalSession {
            id: row.try_get("id")?,
            job_id: row.try_get("job_id")?,
            status: row.try_get("status")?,
            process_pid: row.try_get("process_pid")?,
            created_at: row.try_get("created_at")?,
            updated_at: row.try_get("updated_at")?,
            last_output_at: row.try_get("last_output_at")?,
            exit_code: row.try_get("exit_code")?,
            working_directory: row.try_get("working_directory")?,
            environment_vars: row.try_get("environment_vars")?,
            title: row.try_get("title")?,
            output_log: row.try_get("output_log").ok(),
        })
    }
}

pub struct TerminalSessionsRepository {
    pool: Arc<SqlitePool>,
    app_handle: Option<AppHandle>,
}

impl TerminalSessionsRepository {
    pub fn new(pool: Arc<SqlitePool>) -> Self {
        Self { pool, app_handle: None }
    }

    pub fn new_with_app_handle(app_handle: AppHandle, pool: Arc<SqlitePool>) -> Self {
        Self { pool, app_handle: Some(app_handle) }
    }

    pub async fn create_session(&self, session: &TerminalSession) -> AppResult<()> {
        sqlx::query(
            r#"
            INSERT INTO terminal_sessions (
                id, job_id, status, process_pid, created_at, updated_at,
                last_output_at, exit_code, working_directory, environment_vars, title, output_log
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)
            "#,
        )
        .bind(&session.id)
        .bind(&session.job_id)
        .bind(&session.status)
        .bind(session.process_pid)
        .bind(session.created_at)
        .bind(session.updated_at)
        .bind(session.last_output_at)
        .bind(session.exit_code)
        .bind(&session.working_directory)
        .bind(&session.environment_vars)
        .bind(&session.title)
        .bind(&session.output_log)
        .execute(&*self.pool)
        .await?;
        Ok(())
    }

    pub async fn update_session(&self, session: &TerminalSession) -> AppResult<()> {
        sqlx::query(
            r#"
            UPDATE terminal_sessions SET
                status = ?2,
                process_pid = ?3,
                updated_at = ?4,
                last_output_at = ?5,
                exit_code = ?6,
                working_directory = ?7,
                environment_vars = ?8,
                title = ?9,
                output_log = ?10
            WHERE id = ?1
            "#,
        )
        .bind(&session.id)
        .bind(&session.status)
        .bind(session.process_pid)
        .bind(session.updated_at)
        .bind(session.last_output_at)
        .bind(session.exit_code)
        .bind(&session.working_directory)
        .bind(&session.environment_vars)
        .bind(&session.title)
        .bind(&session.output_log)
        .execute(&*self.pool)
        .await?;

        if let Some(ref app_handle) = self.app_handle {
            let payload = TerminalStatusChangedPayload {
                job_id: session.job_id.clone(),
                status: session.status.clone(),
                updated_at: session.updated_at.to_string(),
            };
            emit_terminal_status_changed(app_handle, payload);
        }

        Ok(())
    }

    pub async fn get_session_by_id(&self, session_id: &str) -> AppResult<Option<TerminalSession>> {
        let row = sqlx::query("SELECT * FROM terminal_sessions WHERE id = ?1")
            .bind(session_id)
            .fetch_optional(&*self.pool)
            .await?;

        match row {
            Some(r) => Ok(Some(TerminalSession::from_row(&r)?)),
            None => Ok(None),
        }
    }

    pub async fn get_session_by_job_id(&self, job_id: &str) -> AppResult<Option<TerminalSession>> {
        let row = sqlx::query("SELECT * FROM terminal_sessions WHERE job_id = ?1")
            .bind(job_id)
            .fetch_optional(&*self.pool)
            .await?;

        match row {
            Some(r) => Ok(Some(TerminalSession::from_row(&r)?)),
            None => Ok(None),
        }
    }

    pub async fn get_or_create_session(&self, job_id: &str) -> AppResult<TerminalSession> {
        // First try to get existing session
        if let Some(existing) = self.get_session_by_job_id(job_id).await? {
            // Ensure output_log is never null
            if existing.output_log.is_none() {
                let mut updated = existing.clone();
                updated.output_log = Some(String::new());
                self.update_session(&updated).await?;
                return Ok(updated);
            }
            return Ok(existing);
        }

        // Create new session if none exists
        let new_session = TerminalSession {
            id: format!("session_{}", uuid::Uuid::new_v4()),
            job_id: job_id.to_string(),
            status: "initializing".to_string(),
            process_pid: None,
            created_at: chrono::Utc::now().timestamp(),
            updated_at: chrono::Utc::now().timestamp(),
            last_output_at: None,
            exit_code: None,
            working_directory: None,
            environment_vars: None,
            title: None,
            output_log: Some(String::new()), // Ensure it's never null
        };

        self.create_session(&new_session).await?;
        Ok(new_session)
    }

    pub async fn list_active_sessions(&self) -> AppResult<Vec<TerminalSession>> {
        let rows = sqlx::query(
            "SELECT * FROM terminal_sessions WHERE status = 'running' ORDER BY updated_at DESC",
        )
        .fetch_all(&*self.pool)
        .await?;

        let mut sessions = Vec::new();
        for row in rows {
            sessions.push(TerminalSession::from_row(&row)?);
        }

        Ok(sessions)
    }

    pub async fn append_output_log(&self, job_id: &str, chunk: &str) -> AppResult<()> {
        // Ring buffer: Keep only last 5MB of output to prevent unbounded growth
        const MAX_LOG_SIZE: i32 = 5242880; // 5 MiB

        // Handle the case where output_log is NULL in DB - use COALESCE to ensure it's never null
        let rows_affected = sqlx::query(
            r#"
            UPDATE terminal_sessions
            SET output_log = SUBSTR(COALESCE(output_log, '') || ?2, -?3),
                last_output_at = strftime('%s', 'now'),
                updated_at = strftime('%s', 'now')
            WHERE job_id = ?1
            "#,
        )
        .bind(job_id)
        .bind(chunk)
        .bind(MAX_LOG_SIZE)
        .execute(&*self.pool)
        .await?
        .rows_affected();

        // If no rows were affected, the session might not exist - create it
        if rows_affected == 0 {
            self.get_or_create_session(job_id).await?;

            // Try the append again
            sqlx::query(
                r#"
                UPDATE terminal_sessions
                SET output_log = SUBSTR(COALESCE(output_log, '') || ?2, -?3),
                    last_output_at = strftime('%s', 'now'),
                    updated_at = strftime('%s', 'now')
                WHERE job_id = ?1
                "#,
            )
            .bind(job_id)
            .bind(chunk)
            .bind(MAX_LOG_SIZE)
            .execute(&*self.pool)
            .await?;
        }

        Ok(())
    }

    pub async fn has_output(&self, job_id: &str) -> AppResult<bool> {
        let row: Option<(i32,)> = sqlx::query_as(
            "SELECT CASE WHEN COALESCE(output_log, '') = '' THEN 0 ELSE 1 END FROM terminal_sessions WHERE job_id = ?1",
        )
        .bind(job_id)
        .fetch_optional(&*self.pool)
        .await?;

        Ok(row.map(|(has_output,)| has_output == 1).unwrap_or(false))
    }

    pub async fn get_output_log(&self, job_id: &str) -> AppResult<String> {
        let row: Option<(String,)> = sqlx::query_as(
            "SELECT COALESCE(output_log, '') FROM terminal_sessions WHERE job_id = ?1",
        )
        .bind(job_id)
        .fetch_optional(&*self.pool)
        .await?;

        Ok(row.map(|(log,)| log).unwrap_or_default())
    }

    pub async fn clear_output_log(&self, job_id: &str) -> AppResult<()> {
        sqlx::query(
            r#"
            UPDATE terminal_sessions 
            SET output_log = '',
                updated_at = strftime('%s', 'now')
            WHERE job_id = ?1
            "#,
        )
        .bind(job_id)
        .execute(&*self.pool)
        .await?;
        Ok(())
    }

    pub async fn delete_session_by_job_id(&self, job_id: &str) -> AppResult<()> {
        sqlx::query("DELETE FROM terminal_sessions WHERE job_id = ?1")
            .bind(job_id)
            .execute(&*self.pool)
            .await?;

        if let Some(ref app_handle) = self.app_handle {
            let payload = TerminalDeletedPayload {
                job_id: job_id.to_string(),
            };
            emit_terminal_deleted(app_handle, payload);
        }

        Ok(())
    }

    pub async fn list_sessions_by_status(&self, status: &str) -> AppResult<Vec<TerminalSession>> {
        let rows = sqlx::query(
            "SELECT * FROM terminal_sessions WHERE status = ?1 ORDER BY updated_at DESC",
        )
        .bind(status)
        .fetch_all(&*self.pool)
        .await?;

        let mut sessions = Vec::new();
        for row in rows {
            sessions.push(TerminalSession::from_row(&row)?);
        }

        Ok(sessions)
    }

    pub async fn delete_session(&self, session_id: &str) -> AppResult<()> {
        sqlx::query("DELETE FROM terminal_sessions WHERE id = ?1")
            .bind(session_id)
            .execute(&*self.pool)
            .await?;
        Ok(())
    }

    pub async fn update_session_status(
        &self,
        session_id: &str,
        status: &str,
        exit_code: Option<i64>,
    ) -> AppResult<()> {
        let now = chrono::Utc::now().timestamp();

        sqlx::query(
            r#"
            UPDATE terminal_sessions SET
                status = ?2,
                updated_at = ?3,
                exit_code = ?4
            WHERE id = ?1
            "#,
        )
        .bind(session_id)
        .bind(status)
        .bind(now)
        .bind(exit_code)
        .execute(&*self.pool)
        .await?;

        if let Some(ref app_handle) = self.app_handle {
            if let Ok(Some(session)) = self.get_session_by_id(session_id).await {
                let payload = TerminalStatusChangedPayload {
                    job_id: session.job_id,
                    status: status.to_string(),
                    updated_at: now.to_string(),
                };
                emit_terminal_status_changed(app_handle, payload);
            }
        }

        Ok(())
    }

    pub async fn update_last_output(&self, session_id: &str) -> AppResult<()> {
        let now = chrono::Utc::now().timestamp();

        sqlx::query(
            r#"
            UPDATE terminal_sessions SET
                last_output_at = ?2,
                updated_at = ?2
            WHERE id = ?1
            "#,
        )
        .bind(session_id)
        .bind(now)
        .execute(&*self.pool)
        .await?;
        Ok(())
    }
}
