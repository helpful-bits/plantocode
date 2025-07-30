use sqlx::{Row, SqlitePool};
use std::time::{SystemTime, UNIX_EPOCH};

pub async fn init_table(pool: &SqlitePool) -> Result<(), sqlx::Error> {
    sqlx::query(
        "CREATE TABLE IF NOT EXISTS temp_files (
            path TEXT PRIMARY KEY,
            job_id TEXT,
            created_at INTEGER NOT NULL
        )"
    )
    .execute(pool)
    .await?;
    
    Ok(())
}

pub async fn register_temp_file(
    pool: &SqlitePool,
    path: &str,
    job_id: Option<&str>,
) -> Result<(), sqlx::Error> {
    let created_at = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_secs() as i64;
    
    sqlx::query(
        "INSERT INTO temp_files (path, job_id, created_at) VALUES (?, ?, ?)"
    )
    .bind(path)
    .bind(job_id)
    .bind(created_at)
    .execute(pool)
    .await?;
    
    Ok(())
}

pub async fn delete_for_job(pool: &SqlitePool, job_id: &str) -> Result<(), sqlx::Error> {
    let paths: Vec<String> = sqlx::query("SELECT path FROM temp_files WHERE job_id = ?")
        .bind(job_id)
        .fetch_all(pool)
        .await?
        .into_iter()
        .map(|row| row.get::<String, _>("path"))
        .collect();
    
    for path in paths {
        let _ = std::fs::remove_file(&path);
    }
    
    sqlx::query("DELETE FROM temp_files WHERE job_id = ?")
        .bind(job_id)
        .execute(pool)
        .await?;
    
    Ok(())
}

pub async fn delete_expired_files(pool: &SqlitePool, max_age_secs: i64) -> Result<(), sqlx::Error> {
    let cutoff_time = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_secs() as i64 - max_age_secs;
    
    let paths: Vec<String> = sqlx::query("SELECT path FROM temp_files WHERE created_at < ?")
        .bind(cutoff_time)
        .fetch_all(pool)
        .await?
        .into_iter()
        .map(|row| row.get::<String, _>("path"))
        .collect();
    
    for path in paths {
        let _ = std::fs::remove_file(&path);
    }
    
    sqlx::query("DELETE FROM temp_files WHERE created_at < ?")
        .bind(cutoff_time)
        .execute(pool)
        .await?;
    
    Ok(())
}