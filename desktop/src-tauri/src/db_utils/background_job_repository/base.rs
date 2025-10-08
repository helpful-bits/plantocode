use std::sync::Arc;
use sqlx::SqlitePool;

#[derive(Debug, Clone)]
pub struct BackgroundJobRepository {
    pub(super) pool: Arc<SqlitePool>,
    pub(super) app_handle: Option<tauri::AppHandle>,
}

impl BackgroundJobRepository {
    pub fn new(pool: Arc<SqlitePool>) -> Self {
        Self {
            pool,
            app_handle: None,
        }
    }

    pub fn new_with_app_handle(pool: Arc<SqlitePool>, app_handle: tauri::AppHandle) -> Self {
        Self {
            pool,
            app_handle: Some(app_handle),
        }
    }

    pub fn get_pool(&self) -> Arc<SqlitePool> {
        self.pool.clone()
    }
}
