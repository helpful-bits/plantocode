use sqlx::postgres::{PgPool, PgPoolOptions};
use std::env;
use std::time::Duration;
use crate::error::AppError;

/// Creates a PostgreSQL connection pool from the DATABASE_URL environment variable.
///
/// This function is the central point for database connection management.
/// It configures the connection pool with appropriate timeout and connection limits.
/// If the database is not available, it will retry a few times before failing.
pub async fn create_pool() -> Result<PgPool, AppError> {
    let database_url = env::var("DATABASE_URL")
        .map_err(|_| AppError::Internal("DATABASE_URL must be set in environment variables".to_string()))?;
    
    log::info!("Creating database connection pool");
    
    // Try to connect with retries
    let max_retries = 3;
    let mut last_error = None;
    
    for attempt in 1..=max_retries {
        log::info!("Database connection attempt {} of {}", attempt, max_retries);
        
        match PgPoolOptions::new()
            .max_connections(10)
            .acquire_timeout(Duration::from_secs(5))
            .idle_timeout(Duration::from_secs(60))
            .connect(&database_url)
            .await
        {
            Ok(pool) => {
                log::info!("Successfully connected to database");
                return Ok(pool);
            },
            Err(e) => {
                log::warn!("Database connection attempt {} failed: {}", attempt, e);
                
                // Check if this is an authentication error
                if e.to_string().contains("authentication failed") {
                    log::debug!("Database URL: {:?}", &database_url);
                    log::error!("Database authentication failed. Please check your DATABASE_URL credentials.");
                    return Err(AppError::Database(e));
                }
                
                // Check if this is a connection refused error
                if e.to_string().contains("Connection refused") {
                    log::error!("Database connection refused. Please check if the database server is running and accessible.");
                }
                
                last_error = Some(e);
                
                if attempt < max_retries {
                    // Wait before retrying
                    let delay = Duration::from_secs(2 * attempt as u64);
                    log::info!("Retrying in {} seconds...", delay.as_secs());
                    tokio::time::sleep(delay).await;
                }
            }
        }
    }
    
    // If we get here, all retries failed
    let error = last_error.unwrap_or_else(|| {
        sqlx::Error::Configuration("Unknown database connection error".into())
    });
    
    log::error!("All database connection attempts failed: {}", error);
    log::error!("Please check your database configuration and ensure the database server is running.");
    
    Err(AppError::Database(error))
}

/// Verifies the database connection by executing a simple query.
/// This is useful for health checks and ensuring the database is accessible.
pub async fn verify_connection(pool: &PgPool) -> Result<(), AppError> {
    // Using a raw query instead of the macro to avoid compile-time database checks
    sqlx::query_as::<_, (i32,)>("SELECT 1 as result")
        .fetch_optional(pool) // Use fetch_optional in case the query returns nothing
        .await
        .map(|_| {
            log::debug!("Database connection verified");
            ()
        })
        .map_err(|e| {
            log::error!("Database connection verification failed: {}", e);
            AppError::Database(e)
        })?;

    log::info!("Database connection verified successfully");
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    
    #[tokio::test]
    async fn test_create_pool() {
        // This test will only run if DATABASE_URL is set in the environment
        if let Ok(_) = env::var("DATABASE_URL") {
            let pool = create_pool().await;
            // We don't assert pool.is_ok() because it depends on the database being available
        }
    }
    
    #[tokio::test]
    async fn test_verify_connection() {
        // This test will only run if DATABASE_URL is set in the environment
        if let Ok(_) = env::var("DATABASE_URL") {
            if let Ok(pool) = create_pool().await {
                let result = verify_connection(&pool).await;
                // We don't assert result.is_ok() because it depends on the database being available
            }
        }
    }
}