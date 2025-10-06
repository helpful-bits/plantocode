use sqlx::{PgPool, Row};
use tokio::{
    task::JoinHandle,
    time::{Duration, sleep},
};
use tracing::{info, warn};

pub struct DbPoolMonitor {
    system_pool: PgPool,
    user_pool: PgPool,
    interval_secs: u64,
}

impl DbPoolMonitor {
    pub fn new(system_pool: PgPool, user_pool: PgPool, interval_secs: u64) -> Self {
        Self {
            system_pool,
            user_pool,
            interval_secs,
        }
    }

    pub fn spawn(self) -> JoinHandle<()> {
        tokio::spawn(async move {
            info!("DbPoolMonitor started");
            loop {
                if let Err(e) = self.log_snapshot().await {
                    warn!("DbPoolMonitor snapshot error: {e}");
                }
                sleep(Duration::from_secs(self.interval_secs)).await;
            }
        })
    }

    pub async fn log_snapshot(&self) -> Result<(), sqlx::Error> {
        let rows = sqlx::query(
            r#"
            SELECT application_name,
                   COUNT(*) FILTER (WHERE state = 'active') AS active,
                   COUNT(*) FILTER (WHERE state = 'idle') AS idle,
                   COUNT(*) FILTER (WHERE wait_event_type = 'Lock') AS waiting_locks
            FROM pg_stat_activity
            WHERE application_name LIKE 'vibe-manager-%'
            GROUP BY application_name
            "#,
        )
        .fetch_all(&self.system_pool)
        .await?;

        for row in rows {
            let app: String = row.get("application_name");
            let active: i64 = row.get("active");
            let idle: i64 = row.get("idle");
            let waiting: i64 = row.get("waiting_locks");
            info!(%app, %active, %idle, waiting_locks=%waiting, "Pool snapshot");
        }

        let long_running = sqlx::query(
            r#"
            SELECT pid, application_name, now() - query_start AS duration, state, left(query, 200) AS q
            FROM pg_stat_activity
            WHERE application_name LIKE 'vibe-manager-%'
              AND state = 'active'
              AND query_start IS NOT NULL
              AND now() - query_start > interval '10 seconds'
            ORDER BY duration DESC
            LIMIT 5
            "#
        ).fetch_all(&self.system_pool).await?;

        if !long_running.is_empty() {
            for row in long_running {
                let pid: i32 = row.get("pid");
                let app: String = row.get("application_name");
                let state: String = row.get("state");
                let q: String = row.get("q");
                warn!(%pid, %app, %state, query=%q, "Long-running query detected");
            }
        }

        Ok(())
    }
}
