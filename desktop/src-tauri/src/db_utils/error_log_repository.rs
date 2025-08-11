use std::sync::Arc;
use sqlx::SqlitePool;
use crate::error::AppResult;

#[derive(Clone)]
pub struct ErrorLogRepository {
  pool: Arc<SqlitePool>,
}

impl ErrorLogRepository {
  pub fn new(pool: Arc<SqlitePool>) -> Self {
    Self { pool }
  }

  pub async fn insert_error(
    &self,
    level: &str,
    error_type: Option<&str>,
    message: &str,
    context: Option<&str>,
    stack: Option<&str>,
    metadata_json: Option<&str>,
    app_version: Option<&str>,
    platform: Option<&str>,
  ) -> AppResult<()> {
    // Rely on DEFAULT timestamp at the DB level
    let query = r#"
      INSERT INTO error_logs
        (level, error_type, message, context, stack, metadata, app_version, platform)
      VALUES
        (?,     ?,          ?,       ?,       ?,     ?,        ?,           ?)
    "#;

    sqlx::query(query)
      .bind(level)
      .bind(error_type)
      .bind(message)
      .bind(context)
      .bind(stack)
      .bind(metadata_json)
      .bind(app_version)
      .bind(platform)
      .execute(&*self.pool)
      .await
      .map(|_| ())
      .map_err(Into::into)
  }

  pub async fn prune_older_than_days(&self, days: i64) -> AppResult<u64> {
    let query = r#"
      DELETE FROM error_logs
      WHERE timestamp < strftime('%s','now') - (? * 86400)
    "#;
    let res = sqlx::query(query)
      .bind(days)
      .execute(&*self.pool)
      .await?;
    Ok(res.rows_affected())
  }
}