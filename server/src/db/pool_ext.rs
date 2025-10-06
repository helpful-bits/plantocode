use sqlx::{Error as SqlxError, PgPool, Postgres, Transaction};
use tokio::time::{Duration, sleep};

pub struct AcquireRetry;

impl AcquireRetry {
    pub async fn begin_with_retry(
        pool: &PgPool,
        attempts: usize,
        base_backoff_ms: u64,
    ) -> Result<Transaction<'_, Postgres>, SqlxError> {
        let mut tries = 0;
        loop {
            match pool.begin().await {
                Ok(tx) => return Ok(tx),
                Err(e) => {
                    let timed_out = matches!(e, SqlxError::PoolTimedOut)
                        || e.to_string().to_lowercase().contains("timed out");
                    if timed_out && tries + 1 < attempts {
                        let backoff = base_backoff_ms.saturating_mul(1 << tries);
                        log::warn!(
                            "begin() PoolTimedOut; retrying (attempt={}, backoff_ms={})",
                            tries + 1,
                            backoff
                        );
                        sleep(Duration::from_millis(backoff)).await;
                        tries += 1;
                        continue;
                    }
                    return Err(e);
                }
            }
        }
    }

    pub async fn acquire_with_retry(
        pool: &PgPool,
        attempts: usize,
        base_backoff_ms: u64,
    ) -> Result<sqlx::pool::PoolConnection<Postgres>, SqlxError> {
        let mut tries = 0;
        loop {
            match pool.acquire().await {
                Ok(conn) => return Ok(conn),
                Err(e) => {
                    let timed_out = matches!(e, SqlxError::PoolTimedOut)
                        || e.to_string().to_lowercase().contains("timed out");
                    if timed_out && tries + 1 < attempts {
                        let backoff = base_backoff_ms.saturating_mul(1 << tries);
                        log::warn!(
                            "acquire() PoolTimedOut; retrying (attempt={}, backoff_ms={})",
                            tries + 1,
                            backoff
                        );
                        sleep(Duration::from_millis(backoff)).await;
                        tries += 1;
                        continue;
                    }
                    return Err(e);
                }
            }
        }
    }
}
