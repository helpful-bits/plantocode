use crate::error::AppResult;
use async_trait::async_trait;
use std::fmt::Debug;

#[async_trait]
pub trait SecureStorage: Send + Sync + Debug {
    async fn set_item(&self, key: &str, value: &str) -> AppResult<()>;
    async fn get_item(&self, key: &str) -> AppResult<Option<String>>;
    async fn remove_item(&self, key: &str) -> AppResult<()>;
}