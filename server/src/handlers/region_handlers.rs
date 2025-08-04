use actix_web::{web, HttpResponse, Result};
use crate::db::repositories::server_region_repository::ServerRegionRepository;
use crate::db::connection::DatabasePools;
use std::sync::Arc;

/// GET /config/regions - Get all server regions
pub async fn get_regions_handler(
    db_pools: web::Data<DatabasePools>,
) -> Result<HttpResponse> {
    let repository = ServerRegionRepository::new(Arc::new(db_pools.system_pool.clone()));
    
    match repository.get_all().await {
        Ok(regions) => Ok(HttpResponse::Ok().json(regions)),
        Err(e) => {
            log::error!("Failed to fetch server regions: {}", e);
            Ok(HttpResponse::InternalServerError().json(serde_json::json!({
                "error": "Failed to fetch server regions"
            })))
        }
    }
}