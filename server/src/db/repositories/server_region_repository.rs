use crate::models::region::ServerRegion;
use sqlx::PgPool;
use std::sync::Arc;

pub struct ServerRegionRepository {
    db: Arc<PgPool>,
}

impl ServerRegionRepository {
    pub fn new(db: Arc<PgPool>) -> Self {
        Self { db }
    }

    /// Get all server regions ordered by is_default DESC, label ASC
    pub async fn get_all(&self) -> Result<Vec<ServerRegion>, sqlx::Error> {
        let regions = sqlx::query_as!(
            ServerRegion,
            r#"
            SELECT 
                id,
                label,
                url,
                is_default,
                created_at,
                updated_at
            FROM server_regions 
            ORDER BY is_default DESC, label ASC
            "#
        )
        .fetch_all(self.db.as_ref())
        .await?;

        Ok(regions)
    }
}
