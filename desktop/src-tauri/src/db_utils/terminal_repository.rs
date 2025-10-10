use crate::error::AppResult;
use sqlx::{Row, SqlitePool};
use std::sync::Arc;

const MAX_OUTPUT_LOG_SIZE: usize = 1_048_576; // 1 MiB

pub struct TerminalRepository {
    pool: Arc<SqlitePool>,
}

impl TerminalRepository {
    pub fn new(pool: Arc<SqlitePool>) -> Self {
        Self { pool }
    }

    pub async fn ensure_session(
        &self,
        session_id: &str,
        started_at: i64,
        working_directory: Option<String>,
    ) -> AppResult<()> {
        // First, check if a background job exists with this id (job_id)
        // If not, we need to create a minimal background job for this terminal session
        let job_exists: bool = sqlx::query_scalar(
            "SELECT EXISTS(SELECT 1 FROM background_jobs WHERE id = ?1)"
        )
        .bind(session_id)
        .fetch_one(&*self.pool)
        .await?;

        if !job_exists {
            // Create a minimal background job for standalone terminal sessions
            // We need a valid session_id from the sessions table
            // First, try to find a session or create a default one
            let default_session_id = "terminal-standalone";

            // Ensure a default session exists for standalone terminals
            let _ = sqlx::query(
                r#"
                INSERT OR IGNORE INTO sessions (
                    id, name, project_directory, project_hash, created_at, updated_at
                ) VALUES (
                    ?1, 'Terminal Sessions', '/tmp', '', ?2, ?2
                )
                "#
            )
            .bind(default_session_id)
            .bind(started_at)
            .execute(&*self.pool)
            .await;

            // Now create the background job for this terminal
            sqlx::query(
                r#"
                INSERT OR IGNORE INTO background_jobs (
                    id, session_id, task_type, status, prompt, created_at, updated_at
                ) VALUES (
                    ?1, ?2, 'terminal', 'running', 'Terminal session', ?3, ?3
                )
                "#
            )
            .bind(session_id)
            .bind(default_session_id)
            .bind(started_at)
            .execute(&*self.pool)
            .await?;
        }

        // Now create the terminal session record
        sqlx::query(
            r#"
            INSERT OR IGNORE INTO terminal_sessions (
                id, job_id, session_id, status, created_at, updated_at, started_at, working_directory, output_log
            ) VALUES (hex(randomblob(16)), ?1, ?1, 'running', ?2, ?2, ?2, ?3, '')
            "#,
        )
        .bind(session_id)
        .bind(started_at)
        .bind(working_directory)
        .execute(&*self.pool)
        .await?;
        Ok(())
    }

    pub async fn append_output(
        &self,
        session_id: &str,
        chunk: &[u8],
        ts_secs: i64,
    ) -> AppResult<()> {
        let text = String::from_utf8_lossy(chunk);

        sqlx::query(
            r#"
            UPDATE terminal_sessions
            SET
              output_log = CASE
                WHEN LENGTH(output_log) + LENGTH(?1) > ?2
                THEN substr(output_log, -((?2) - LENGTH(?1))) || ?1
                ELSE output_log || ?1
              END,
              last_output_at = ?3,
              updated_at = ?3
            WHERE session_id = ?4
            "#,
        )
        .bind(text.as_ref())
        .bind(MAX_OUTPUT_LOG_SIZE as i64)
        .bind(ts_secs)
        .bind(session_id)
        .execute(&*self.pool)
        .await?;
        Ok(())
    }

    pub async fn update_process_pid(
        &self,
        session_id: &str,
        pid: i64,
        ts_secs: i64,
    ) -> AppResult<()> {
        sqlx::query(
            r#"
            UPDATE terminal_sessions
            SET process_pid = ?2, updated_at = ?3
            WHERE session_id = ?1
            "#,
        )
        .bind(session_id)
        .bind(pid)
        .bind(ts_secs)
        .execute(&*self.pool)
        .await?;
        Ok(())
    }

    pub async fn save_session_result(
        &self,
        session_id: &str,
        ended_at: i64,
        exit_code: Option<i64>,
        final_log: Option<String>,
        working_directory: Option<String>,
    ) -> AppResult<()> {
        // Cap final_log to last ~512KB for output_snapshot
        let capped_log = final_log.as_deref().map(|s| {
            let max = 512 * 1024;
            if s.len() > max {
                s[(s.len() - max)..].to_string()
            } else {
                s.to_string()
            }
        });

        let status = match exit_code {
            Some(0) => "completed",
            _ => "failed",
        };

        sqlx::query(
            r#"
            UPDATE terminal_sessions SET
                ended_at = ?2,
                exit_code = ?3,
                output_snapshot = ?4,
                working_directory = COALESCE(?5, working_directory),
                status = ?6,
                updated_at = ?2
            WHERE session_id = ?1
            "#,
        )
        .bind(session_id)
        .bind(ended_at)
        .bind(exit_code)
        .bind(capped_log)
        .bind(working_directory)
        .bind(status)
        .execute(&*self.pool)
        .await?;
        Ok(())
    }

    pub async fn get_restorable_sessions(&self) -> AppResult<Vec<RestorableSession>> {
        let current_time = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_secs() as i64;
        let yesterday = current_time - 86400; // 24 hours ago

        let rows = sqlx::query(
            r#"
            SELECT
                session_id,
                working_directory,
                output_log,
                exit_code,
                created_at,
                ended_at
            FROM terminal_sessions
            WHERE status IN ('running', 'completed')
                AND created_at > ?1
            ORDER BY created_at DESC
            "#,
        )
        .bind(yesterday)
        .fetch_all(&*self.pool)
        .await?;

        let sessions = rows
            .into_iter()
            .map(|row| RestorableSession {
                session_id: row.get("session_id"),
                working_directory: row.get("working_directory"),
                output_log: row.get("output_log"),
                exit_code: row.get("exit_code"),
                created_at: row.get("created_at"),
                ended_at: row.get("ended_at"),
            })
            .collect();

        Ok(sessions)
    }

    pub async fn mark_session_as_restored(&self, session_id: &str) -> AppResult<()> {
        let current_time = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_secs() as i64;

        sqlx::query(
            r#"
            UPDATE terminal_sessions
            SET status = 'restored', updated_at = ?2
            WHERE session_id = ?1
            "#,
        )
        .bind(session_id)
        .bind(current_time)
        .execute(&*self.pool)
        .await?;
        Ok(())
    }

    pub async fn clear_output_log(&self, session_id: &str) -> AppResult<()> {
        sqlx::query(
            r#"
            UPDATE terminal_sessions
            SET output_log = '', updated_at = ?2
            WHERE session_id = ?1
            "#,
        )
        .bind(session_id)
        .bind(
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_secs() as i64,
        )
        .execute(&*self.pool)
        .await?;
        Ok(())
    }

    pub async fn get_output_log(&self, session_id: &str) -> AppResult<Option<(String, Option<i64>)>> {
        let row = sqlx::query(
            r#"
            SELECT output_log, last_output_at
            FROM terminal_sessions
            WHERE session_id = ?1
            LIMIT 1
            "#,
        )
        .bind(session_id)
        .fetch_optional(&*self.pool)
        .await?;

        match row {
            Some(row) => {
                let output_log: String = row.try_get("output_log")?;
                let last_output_at: Option<i64> = row.try_get("last_output_at").ok();
                Ok(Some((output_log, last_output_at)))
            }
            None => Ok(None)
        }
    }
}

#[derive(Debug)]
pub struct RestorableSession {
    pub session_id: String,
    pub working_directory: Option<String>,
    pub output_log: Option<String>,
    pub exit_code: Option<i64>,
    pub created_at: i64,
    pub ended_at: Option<i64>,
}
