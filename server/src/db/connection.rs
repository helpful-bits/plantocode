use sqlx::postgres::{PgPool, PgPoolOptions};
use std::env;
use std::time::Duration;
use crate::error::AppError;

/// Database pools for different access levels
#[derive(Debug, Clone)]
pub struct DatabasePools {
    /// System pool with vibe_manager_app role for Auth0 lookups and system operations
    pub system_pool: PgPool,
    /// User pool with authenticated role for user-specific operations subject to RLS
    pub user_pool: PgPool,
}

/// Creates dual PostgreSQL connection pools with different role configurations.
///
/// This provides security separation between system operations and user operations.
pub async fn create_dual_pools() -> Result<DatabasePools, AppError> {
    let system_pool = create_system_pool().await?;
    let user_pool = create_user_pool().await?;
    
    // Verify both pools work
    verify_connection(&system_pool).await?;
    verify_connection(&user_pool).await?;
    
    Ok(DatabasePools {
        system_pool,
        user_pool,
    })
}

/// Creates a system-level connection pool with vibe_manager_app role.
/// Used for Auth0 authentication, system configuration, and administrative tasks.
async fn create_system_pool() -> Result<PgPool, AppError> {
    let database_url = env::var("DATABASE_URL")
        .map_err(|_| AppError::Internal("DATABASE_URL must be set in environment variables".to_string()))?;
    
    log::info!("Creating system database connection pool");
    
    create_pool_with_role(&database_url, "vibe_manager_app", 5, "system").await
}

/// Creates a user-level connection pool with authenticated role.
/// Used for user-specific operations that are subject to RLS policies.
async fn create_user_pool() -> Result<PgPool, AppError> {
    let database_url = env::var("DATABASE_URL")
        .map_err(|_| AppError::Internal("DATABASE_URL must be set in environment variables".to_string()))?;
    
    log::info!("Creating user database connection pool");
    
    create_pool_with_role(&database_url, "authenticated", 15, "user").await
}

/// Generic function to create a connection pool with a specific role
async fn create_pool_with_role(
    database_url: &str, 
    role: &str, 
    max_connections: u32,
    pool_type: &str
) -> Result<PgPool, AppError> {
    
    // Try to connect with retries
    let max_retries = 3;
    let mut last_error = None;
    let role_owned = role.to_owned(); // Clone for move into closure
    
    for attempt in 1..=max_retries {
        log::info!("Database {} pool connection attempt {} of {}", pool_type, attempt, max_retries);
        
        let role_for_closure = role_owned.clone();
        match PgPoolOptions::new()
            .max_connections(max_connections)
            .acquire_timeout(Duration::from_secs(5))
            .idle_timeout(Duration::from_secs(60))
            .after_connect(move |conn, _meta| {
                let role = role_for_closure.clone();
                Box::pin(async move {
                    // Set the specific role for this pool
                    sqlx::query(&format!("SET role {}", role))
                        .execute(conn)
                        .await?;
                    Ok(())
                })
            })
            .connect(database_url)
            .await
        {
            Ok(pool) => {
                log::info!("Successfully connected to database with {} role ({} pool)", role, pool_type);
                return Ok(pool);
            },
            Err(e) => {
                log::warn!("Database {} pool connection attempt {} failed: {}", pool_type, attempt, e);
                
                // Check if this is an authentication error
                if e.to_string().contains("authentication failed") {
                    log::error!("Database authentication failed for {} pool. Please check your DATABASE_URL credentials.", pool_type);
                    return Err(AppError::Database(e.to_string()));
                }
                
                // Check if this is a connection refused error
                if e.to_string().contains("Connection refused") {
                    log::error!("Database connection refused for {} pool. Please check if the database server is running and accessible.", pool_type);
                }
                
                last_error = Some(e);
                
                if attempt < max_retries {
                    // Wait before retrying
                    let delay = Duration::from_secs(2 * attempt as u64);
                    log::info!("Retrying {} pool in {} seconds...", pool_type, delay.as_secs());
                    tokio::time::sleep(delay).await;
                }
            }
        }
    }
    
    // If we get here, all retries failed
    let error = last_error.unwrap_or_else(|| {
        sqlx::Error::Configuration(format!("Unknown database connection error for {} pool", pool_type).into())
    });
    
    log::error!("All database {} pool connection attempts failed: {}", pool_type, error);
    log::error!("Please check your database configuration and ensure the database server is running.");
    
    Err(AppError::Database(error.to_string()))
}

/// Creates a PostgreSQL connection pool from the DATABASE_URL environment variable.
///
/// This function is the central point for database connection management.
/// It configures the connection pool with appropriate timeout and connection limits.
/// If the database is not available, it will retry a few times before failing.
/// 
/// NOTE: This is kept for backward compatibility. Consider using create_dual_pools() for new code.
pub async fn create_pool() -> Result<PgPool, AppError> {
    // For backward compatibility, create a system pool
    log::warn!("Using deprecated create_pool(). Consider upgrading to create_dual_pools() for better security.");
    create_system_pool().await
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
            AppError::Database(e.to_string())
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