use std::path::{Path, PathBuf};
use std::fs;
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tokio::time;
use log::{info, warn, error};
use chrono::{DateTime, Utc};
use sqlx::SqlitePool;
use crate::error::AppResult;
use crate::constants::DB_FILENAME;

/// Configuration for the backup service
#[derive(Clone, Debug, serde::Serialize, serde::Deserialize)]
pub struct BackupConfig {
    /// Interval between automatic backups (in minutes)
    pub backup_interval_minutes: u64,
    /// Maximum number of backups to retain
    pub max_backup_count: usize,
    /// Whether automatic backups are enabled
    pub enabled: bool,
}

impl Default for BackupConfig {
    fn default() -> Self {
        Self {
            backup_interval_minutes: 15, // 15 minute backups by default
            max_backup_count: 96,        // Keep 96 backups (24 hours worth at 15min intervals)
            enabled: true,
        }
    }
}

/// Service responsible for automatic database backups
pub struct BackupService {
    config: BackupConfig,
    app_data_dir: PathBuf,
    backup_dir: PathBuf,
    db_pool: SqlitePool,
}

impl BackupService {
    /// Create a new backup service
    pub fn new(app_data_dir: PathBuf, db_pool: SqlitePool, config: BackupConfig) -> Self {
        let backup_dir = app_data_dir.join("backups");
        
        Self {
            config,
            app_data_dir,
            backup_dir,
            db_pool,
        }
    }

    /// Initialize the backup service and start automatic backups
    pub async fn initialize(&self) -> AppResult<()> {
        if !self.config.enabled {
            info!("Backup service is disabled");
            return Ok(());
        }

        // Create backup directory if it doesn't exist
        if !self.backup_dir.exists() {
            fs::create_dir_all(&self.backup_dir)?;
            info!("Created backup directory: {}", self.backup_dir.display());
        }

        // Create initial backup on startup if no recent backup exists
        if self.should_create_backup().await? {
            self.create_backup().await?;
        }

        // Clean up old backups
        self.cleanup_old_backups().await?;

        info!("Backup service initialized successfully");
        Ok(())
    }

    /// Start the automatic backup scheduler
    pub async fn start_scheduler(&self) {
        if !self.config.enabled {
            return;
        }

        let interval_duration = Duration::from_secs(self.config.backup_interval_minutes * 60);
        let mut interval = time::interval(interval_duration);
        
        info!("Starting backup scheduler with interval: {} minutes", self.config.backup_interval_minutes);

        loop {
            interval.tick().await;
            
            match self.should_create_backup().await {
                Ok(should_backup) => {
                    if should_backup {
                        if let Err(e) = self.create_backup().await {
                            error!("Scheduled backup failed: {}", e);
                        }
                        
                        if let Err(e) = self.cleanup_old_backups().await {
                            warn!("Backup cleanup failed: {}", e);
                        }
                    }
                }
                Err(e) => {
                    error!("Error checking if backup is needed: {}", e);
                }
            }
        }
    }

    /// Check if a backup should be created
    async fn should_create_backup(&self) -> AppResult<bool> {
        // Check if the main database exists
        let db_path = self.app_data_dir.join(DB_FILENAME);
        if !db_path.exists() {
            return Ok(false);
        }

        // Get the latest backup file
        let latest_backup = self.get_latest_backup()?;
        
        match latest_backup {
            Some(backup_path) => {
                // Check if the latest backup is older than our interval
                let backup_age = self.get_file_age(&backup_path)?;
                let interval_seconds = self.config.backup_interval_minutes * 60;
                Ok(backup_age > interval_seconds)
            }
            None => {
                // No backups exist, create one
                Ok(true)
            }
        }
    }

    /// Create a backup of the database
    pub async fn create_manual_backup(&self) -> AppResult<PathBuf> {
        self.create_backup().await
    }

    /// Create a backup of the database (internal method)
    async fn create_backup(&self) -> AppResult<PathBuf> {
        let db_path = self.app_data_dir.join(DB_FILENAME);
        
        if !db_path.exists() {
            return Err(crate::error::AppError::DatabaseError(
                "Database file does not exist".to_string()
            ));
        }

        // Generate backup filename with timestamp
        let timestamp = Utc::now().format("%Y%m%d_%H%M%S");
        let backup_filename = format!("appdata_backup_{}.db", timestamp);
        let backup_path = self.backup_dir.join(&backup_filename);

        // Ensure WAL checkpoint before backup to get all data
        match sqlx::query("PRAGMA wal_checkpoint(FULL)").execute(&self.db_pool).await {
            Ok(_) => info!("WAL checkpoint completed before backup"),
            Err(e) => warn!("WAL checkpoint failed before backup: {}", e),
        }

        // Copy the database file
        fs::copy(&db_path, &backup_path)?;
        
        // Verify backup integrity
        self.verify_backup(&backup_path).await?;

        info!("Database backup created successfully: {}", backup_path.display());
        Ok(backup_path)
    }

    /// Verify backup integrity
    async fn verify_backup(&self, backup_path: &Path) -> AppResult<()> {
        let backup_url = format!("sqlite:{}", backup_path.display());
        
        // Create a temporary connection to the backup
        let backup_pool = SqlitePool::connect(&backup_url).await
            .map_err(|e| crate::error::AppError::DatabaseError(
                format!("Failed to connect to backup for verification: {}", e)
            ))?;

        // Run integrity check on backup
        let result = sqlx::query_scalar::<_, String>("PRAGMA integrity_check")
            .fetch_one(&backup_pool)
            .await
            .map_err(|e| crate::error::AppError::DatabaseError(
                format!("Backup integrity check failed: {}", e)
            ))?;

        backup_pool.close().await;

        if result != "ok" {
            return Err(crate::error::AppError::DatabaseError(
                format!("Backup integrity check failed: {}", result)
            ));
        }

        info!("Backup integrity verified successfully");
        Ok(())
    }

    /// Clean up old backups beyond the retention limit
    async fn cleanup_old_backups(&self) -> AppResult<()> {
        let mut backup_files = self.get_all_backups()?;
        
        if backup_files.len() <= self.config.max_backup_count {
            return Ok(()); // Nothing to clean up
        }

        // Sort by modification time (newest first)
        backup_files.sort_by(|a, b| {
            let a_time = fs::metadata(a).and_then(|m| m.modified()).unwrap_or(UNIX_EPOCH);
            let b_time = fs::metadata(b).and_then(|m| m.modified()).unwrap_or(UNIX_EPOCH);
            b_time.cmp(&a_time)
        });

        // Remove old backups beyond the retention limit
        let files_to_remove = backup_files.into_iter().skip(self.config.max_backup_count);
        
        for file_path in files_to_remove {
            match fs::remove_file(&file_path) {
                Ok(_) => info!("Removed old backup: {}", file_path.display()),
                Err(e) => warn!("Failed to remove old backup {}: {}", file_path.display(), e),
            }
        }

        Ok(())
    }

    /// Get all backup files
    fn get_all_backups(&self) -> AppResult<Vec<PathBuf>> {
        if !self.backup_dir.exists() {
            return Ok(Vec::new());
        }

        let mut backups = Vec::new();
        
        for entry in fs::read_dir(&self.backup_dir)? {
            let entry = entry?;
            let path = entry.path();
            
            if path.is_file() && 
               path.file_name()
                   .and_then(|n| n.to_str())
                   .map(|s| s.starts_with("appdata_backup_") && s.ends_with(".db"))
                   .unwrap_or(false) {
                backups.push(path);
            }
        }

        Ok(backups)
    }

    /// Get the most recent backup file
    fn get_latest_backup(&self) -> AppResult<Option<PathBuf>> {
        let backups = self.get_all_backups()?;
        
        if backups.is_empty() {
            return Ok(None);
        }

        let latest = backups
            .into_iter()
            .max_by_key(|path| {
                fs::metadata(path)
                    .and_then(|m| m.modified())
                    .unwrap_or(UNIX_EPOCH)
            });

        Ok(latest)
    }

    /// Get file age in seconds
    fn get_file_age(&self, file_path: &Path) -> AppResult<u64> {
        let metadata = fs::metadata(file_path)?;
        let modified = metadata.modified()?;
        let duration = SystemTime::now().duration_since(modified)
            .map_err(|e| crate::error::AppError::InitializationError(format!("Time calculation error: {}", e)))?;
        Ok(duration.as_secs())
    }

    /// Get backup statistics
    pub fn get_backup_stats(&self) -> AppResult<BackupStats> {
        let backups = self.get_all_backups()?;
        let backup_count = backups.len();
        
        let total_size = backups
            .iter()
            .map(|path| fs::metadata(path).map(|m| m.len()).unwrap_or(0))
            .sum();

        let latest_backup_time = backups
            .iter()
            .map(|path| {
                fs::metadata(path)
                    .and_then(|m| m.modified())
                    .map(|time| time.duration_since(UNIX_EPOCH).unwrap_or_default().as_secs())
                    .unwrap_or(0)
            })
            .max();

        Ok(BackupStats {
            backup_count,
            total_size_bytes: total_size,
            latest_backup_timestamp: latest_backup_time,
            backup_directory: self.backup_dir.to_string_lossy().to_string(),
        })
    }

    /// Get detailed information about all backups
    pub async fn get_backup_list(&self) -> AppResult<Vec<BackupInfo>> {
        let backup_files = self.get_all_backups()?;
        let mut backup_info = Vec::new();

        for backup_path in backup_files {
            let metadata = fs::metadata(&backup_path)?;
            let filename = backup_path
                .file_name()
                .and_then(|n| n.to_str())
                .unwrap_or("unknown")
                .to_string();

            let created_timestamp = metadata
                .modified()
                .map(|time| time.duration_since(UNIX_EPOCH).unwrap_or_default().as_secs())
                .unwrap_or(0);

            // Verify backup integrity
            let is_valid = self.verify_backup_file(&backup_path).await.is_ok();

            backup_info.push(BackupInfo {
                filename,
                full_path: backup_path.to_string_lossy().to_string(),
                size_bytes: metadata.len(),
                created_timestamp,
                is_valid,
            });
        }

        // Sort by creation time (newest first)
        backup_info.sort_by(|a, b| b.created_timestamp.cmp(&a.created_timestamp));

        Ok(backup_info)
    }

    /// Verify a backup file without opening the main database
    async fn verify_backup_file(&self, backup_path: &Path) -> AppResult<()> {
        let backup_url = format!("sqlite:{}", backup_path.display());
        
        // Create a temporary connection to the backup
        let backup_pool = SqlitePool::connect(&backup_url).await
            .map_err(|e| crate::error::AppError::DatabaseError(
                format!("Failed to connect to backup for verification: {}", e)
            ))?;

        // Run integrity check on backup
        let result = sqlx::query_scalar::<_, String>("PRAGMA integrity_check")
            .fetch_one(&backup_pool)
            .await
            .map_err(|e| crate::error::AppError::DatabaseError(
                format!("Backup integrity check failed: {}", e)
            ))?;

        backup_pool.close().await;

        if result != "ok" {
            return Err(crate::error::AppError::DatabaseError(
                format!("Backup integrity check failed: {}", result)
            ));
        }

        Ok(())
    }

    /// Restore database from a backup file
    pub async fn restore_from_backup(&self, backup_path: &Path) -> AppResult<()> {
        if !backup_path.exists() {
            return Err(crate::error::AppError::DatabaseError(
                "Backup file does not exist".to_string()
            ));
        }

        // Verify the backup before restoring
        self.verify_backup_file(backup_path).await?;

        let main_db_path = self.app_data_dir.join(DB_FILENAME);
        
        // Create a backup of the current database before restoring
        if main_db_path.exists() {
            let timestamp = Utc::now().format("%Y%m%d_%H%M%S");
            let pre_restore_backup = self.backup_dir.join(format!("pre_restore_backup_{}.db", timestamp));
            fs::copy(&main_db_path, &pre_restore_backup)?;
            info!("Created pre-restore backup: {}", pre_restore_backup.display());
        }

        // Perform WAL checkpoint on current database before replacement
        match sqlx::query("PRAGMA wal_checkpoint(TRUNCATE)").execute(&self.db_pool).await {
            Ok(_) => info!("WAL checkpoint completed before restore"),
            Err(e) => warn!("WAL checkpoint failed before restore: {}", e),
        }

        // Copy backup to replace main database
        fs::copy(backup_path, &main_db_path)?;
        
        info!("Database restored from backup: {}", backup_path.display());
        Ok(())
    }

    /// Find and restore from the latest valid backup automatically
    pub async fn auto_restore_latest_backup(&self) -> AppResult<Option<String>> {
        let backups = self.get_backup_list().await?;
        
        // Find the latest valid backup
        for backup in backups {
            if backup.is_valid {
                let backup_path = Path::new(&backup.full_path);
                self.restore_from_backup(backup_path).await?;
                return Ok(Some(backup.filename));
            }
        }

        Ok(None) // No valid backups found
    }
}

/// Statistics about backups
#[derive(Debug, Clone, serde::Serialize)]
pub struct BackupStats {
    pub backup_count: usize,
    pub total_size_bytes: u64,
    pub latest_backup_timestamp: Option<u64>,
    pub backup_directory: String,
}

/// Information about a single backup file
#[derive(Debug, Clone, serde::Serialize)]
pub struct BackupInfo {
    pub filename: String,
    pub full_path: String,
    pub size_bytes: u64,
    pub created_timestamp: u64,
    pub is_valid: bool,
}