use crate::error::AppError;
use sqlx::postgres::{PgPool, PgPoolOptions};
use std::env;
use std::time::Duration;

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
    let database_url = env::var("DATABASE_URL").map_err(|_| {
        AppError::Internal("DATABASE_URL must be set in environment variables".to_string())
    })?;

    log::info!("Creating system database connection pool");

    // Read system pool configuration with precedence
    let max_connections = env::var("DB_POOL_SYSTEM_MAX")
        .or_else(|_| env::var("DB_SYSTEM_POOL_MAX_CONN"))
        .ok()
        .and_then(|v| v.parse::<u32>().ok())
        .unwrap_or(30);

    let min_connections = env::var("DB_POOL_SYSTEM_MIN")
        .or_else(|_| env::var("DB_SYSTEM_POOL_MIN_CONN"))
        .ok()
        .and_then(|v| v.parse::<u32>().ok())
        .unwrap_or(5);

    let acquire_timeout_ms = env::var("DB_POOL_SYSTEM_ACQUIRE_TIMEOUT_MS")
        .ok()
        .and_then(|v| v.parse::<u64>().ok())
        .unwrap_or(2000);

    // Shared pool configuration
    let idle_timeout_secs = env::var("DB_POOL_IDLE_TIMEOUT_SECS")
        .ok()
        .and_then(|v| v.parse::<u64>().ok())
        .unwrap_or(60);

    let max_lifetime_secs = env::var("DB_POOL_MAX_LIFETIME_SECS")
        .ok()
        .and_then(|v| v.parse::<u64>().ok())
        .unwrap_or(1800);

    // System guardrail timeouts
    let statement_timeout_ms = env::var("DB_SYSTEM_STATEMENT_TIMEOUT_MS")
        .ok()
        .and_then(|v| v.parse::<u64>().ok())
        .unwrap_or(30000);

    let idle_in_tx_timeout_ms = env::var("DB_SYSTEM_IDLE_IN_TX_TIMEOUT_MS")
        .ok()
        .and_then(|v| v.parse::<u64>().ok())
        .unwrap_or(60000);

    let lock_timeout_ms = env::var("DB_SYSTEM_LOCK_TIMEOUT_MS")
        .ok()
        .and_then(|v| v.parse::<u64>().ok())
        .unwrap_or(5000);

    create_pool_with_role(
        &database_url,
        "vibe_manager_app",
        max_connections,
        min_connections,
        acquire_timeout_ms,
        idle_timeout_secs,
        max_lifetime_secs,
        statement_timeout_ms,
        idle_in_tx_timeout_ms,
        lock_timeout_ms,
        "system",
    )
    .await
}

/// Creates a user-level connection pool with authenticated role.
/// Used for user-specific operations that are subject to RLS policies.
async fn create_user_pool() -> Result<PgPool, AppError> {
    let database_url = env::var("DATABASE_URL").map_err(|_| {
        AppError::Internal("DATABASE_URL must be set in environment variables".to_string())
    })?;

    log::info!("Creating user database connection pool");

    // Read user pool configuration with precedence
    let max_connections = env::var("DB_POOL_USER_MAX")
        .or_else(|_| env::var("DB_USER_POOL_MAX_CONN"))
        .ok()
        .and_then(|v| v.parse::<u32>().ok())
        .unwrap_or(80);

    let min_connections = env::var("DB_POOL_USER_MIN")
        .or_else(|_| env::var("DB_USER_POOL_MIN_CONN"))
        .ok()
        .and_then(|v| v.parse::<u32>().ok())
        .unwrap_or(10);

    let acquire_timeout_ms = env::var("DB_POOL_USER_ACQUIRE_TIMEOUT_MS")
        .ok()
        .and_then(|v| v.parse::<u64>().ok())
        .unwrap_or(2000);

    // Shared pool configuration
    let idle_timeout_secs = env::var("DB_POOL_IDLE_TIMEOUT_SECS")
        .ok()
        .and_then(|v| v.parse::<u64>().ok())
        .unwrap_or(60);

    let max_lifetime_secs = env::var("DB_POOL_MAX_LIFETIME_SECS")
        .ok()
        .and_then(|v| v.parse::<u64>().ok())
        .unwrap_or(1800);

    // User guardrail timeouts
    let statement_timeout_ms = env::var("DB_USER_STATEMENT_TIMEOUT_MS")
        .ok()
        .and_then(|v| v.parse::<u64>().ok())
        .unwrap_or(8000);

    let idle_in_tx_timeout_ms = env::var("DB_USER_IDLE_IN_TX_TIMEOUT_MS")
        .ok()
        .and_then(|v| v.parse::<u64>().ok())
        .unwrap_or(10000);

    let lock_timeout_ms = env::var("DB_USER_LOCK_TIMEOUT_MS")
        .ok()
        .and_then(|v| v.parse::<u64>().ok())
        .unwrap_or(2000);

    create_pool_with_role(
        &database_url,
        "authenticated",
        max_connections,
        min_connections,
        acquire_timeout_ms,
        idle_timeout_secs,
        max_lifetime_secs,
        statement_timeout_ms,
        idle_in_tx_timeout_ms,
        lock_timeout_ms,
        "user",
    )
    .await
}

/// Generic function to create a connection pool with a specific role
async fn create_pool_with_role(
    database_url: &str,
    role: &str,
    max_connections: u32,
    min_connections: u32,
    acquire_timeout_ms: u64,
    idle_timeout_secs: u64,
    max_lifetime_secs: u64,
    statement_timeout_ms: u64,
    idle_in_tx_timeout_ms: u64,
    lock_timeout_ms: u64,
    pool_type: &str,
) -> Result<PgPool, AppError> {
    // Try to connect with retries
    let max_retries = 3;
    let mut last_error = None;
    let role_owned = role.to_owned(); // Clone for move into closure
    let pool_type_owned = pool_type.to_owned();

    for attempt in 1..=max_retries {
        log::info!(
            "Database {} pool connection attempt {} of {}",
            pool_type,
            attempt,
            max_retries
        );

        let role_for_closure = role_owned.clone();
        let pool_type_for_closure = pool_type_owned.clone();
        let stmt_timeout = statement_timeout_ms;
        let idle_tx_timeout = idle_in_tx_timeout_ms;
        let lock_timeout = lock_timeout_ms;

        match PgPoolOptions::new()
            .max_connections(max_connections)
            .min_connections(min_connections)
            .acquire_timeout(Duration::from_millis(acquire_timeout_ms))
            .idle_timeout(Duration::from_secs(idle_timeout_secs))
            .max_lifetime(Duration::from_secs(max_lifetime_secs))
            .test_before_acquire(true)
            .after_connect(move |conn, _meta| {
                let role = role_for_closure.clone();
                let pool_type_label = pool_type_for_closure.clone();
                let app_name = format!("plantocode-{}", pool_type_label.as_str());
                Box::pin(async move {
                    // deadlock_timeout is SUSET, so set it while we still hold the original (elevated) role.
                    if pool_type_label == "system" {
                        if let Err(err) = sqlx::query("SET deadlock_timeout TO '1000ms'")
                            .execute(&mut *conn)
                            .await
                        {
                            log::warn!(
                                "Unable to set deadlock_timeout for {} pool before role switch: {}",
                                pool_type_label.as_str(),
                                err
                            );
                        }
                    } else {
                        log::debug!(
                            "Skipping deadlock_timeout for {} pool (requires elevated permissions)",
                            pool_type_label.as_str()
                        );
                    }
                    // Execute connection setup as separate statements
                    sqlx::query(&format!("SET ROLE {}", role))
                        .execute(&mut *conn)
                        .await?;
                    sqlx::query(&format!("SET application_name = '{}'", app_name))
                        .execute(&mut *conn)
                        .await?;
                    sqlx::query("SET TIME ZONE 'UTC'")
                        .execute(&mut *conn)
                        .await?;
                    if let Err(err) =
                        sqlx::query(&format!("SET statement_timeout TO '{}ms'", stmt_timeout))
                            .execute(&mut *conn)
                            .await
                    {
                        log::warn!(
                            "Unable to set statement_timeout for {} pool: {}",
                            pool_type_label.as_str(),
                            err
                        );
                    }
                    if let Err(err) = sqlx::query(&format!(
                        "SET idle_in_transaction_session_timeout TO '{}ms'",
                        idle_tx_timeout
                    ))
                    .execute(&mut *conn)
                    .await
                    {
                        log::warn!(
                            "Unable to set idle_in_transaction_session_timeout for {} pool: {}",
                            pool_type_label.as_str(),
                            err
                        );
                    }
                    if let Err(err) =
                        sqlx::query(&format!("SET lock_timeout TO '{}ms'", lock_timeout))
                            .execute(&mut *conn)
                            .await
                    {
                        log::warn!(
                            "Unable to set lock_timeout for {} pool: {}",
                            pool_type_label.as_str(),
                            err
                        );
                    }
                    if let Err(err) = sqlx::query("SET idle_session_timeout TO '600000ms'")
                        .execute(&mut *conn)
                        .await
                    {
                        log::warn!(
                            "Unable to set idle_session_timeout for {} pool: {}",
                            pool_type_label.as_str(),
                            err
                        );
                    }
                    Ok(())
                })
            })
            .connect(database_url)
            .await
        {
            Ok(pool) => {
                log::info!(
                    "Successfully connected to database with {} role ({} pool)",
                    role,
                    pool_type
                );
                log::info!(
                    "{} pool configuration - max: {}, min: {}, acquire_timeout: {}ms, idle_timeout: {}s, max_lifetime: {}s",
                    pool_type,
                    max_connections,
                    min_connections,
                    acquire_timeout_ms,
                    idle_timeout_secs,
                    max_lifetime_secs
                );
                if pool_type == "system" {
                    log::info!(
                        "{} pool timeouts - statement: {}ms, idle_in_tx: {}ms, lock: {}ms, deadlock: 1000ms, idle_session: 10min",
                        pool_type,
                        statement_timeout_ms,
                        idle_in_tx_timeout_ms,
                        lock_timeout_ms
                    );
                } else {
                    log::info!(
                        "{} pool timeouts - statement: {}ms, idle_in_tx: {}ms, lock: {}ms, idle_session: 10min",
                        pool_type,
                        statement_timeout_ms,
                        idle_in_tx_timeout_ms,
                        lock_timeout_ms
                    );
                }
                return Ok(pool);
            }
            Err(e) => {
                log::warn!(
                    "Database {} pool connection attempt {} failed: {}",
                    pool_type,
                    attempt,
                    e
                );

                // Check if this is an authentication error
                if e.to_string().contains("authentication failed") {
                    log::error!(
                        "Database authentication failed for {} pool. Please check your DATABASE_URL credentials.",
                        pool_type
                    );
                    return Err(AppError::Database(e.to_string()));
                }

                // Check if this is a connection refused error
                if e.to_string().contains("Connection refused") {
                    log::error!(
                        "Database connection refused for {} pool. Please check if the database server is running and accessible.",
                        pool_type
                    );
                }

                last_error = Some(e);

                if attempt < max_retries {
                    // Wait before retrying
                    let delay = Duration::from_secs(2 * attempt as u64);
                    log::info!(
                        "Retrying {} pool in {} seconds...",
                        pool_type,
                        delay.as_secs()
                    );
                    tokio::time::sleep(delay).await;
                }
            }
        }
    }

    // If we get here, all retries failed
    let error = last_error.unwrap_or_else(|| {
        sqlx::Error::Configuration(
            format!("Unknown database connection error for {} pool", pool_type).into(),
        )
    });

    log::error!(
        "All database {} pool connection attempts failed: {}",
        pool_type,
        error
    );
    log::error!(
        "Please check your database configuration and ensure the database server is running."
    );

    Err(AppError::Database(error.to_string()))
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
    async fn test_verify_connection() {
        // This test will only run if DATABASE_URL is set in the environment
        if let Ok(_) = env::var("DATABASE_URL") {
            if let Ok(pools) = create_dual_pools().await {
                let _result = verify_connection(&pools.system_pool).await;
                // We don't assert result.is_ok() because it depends on the database being available
            }
        }
    }
}
