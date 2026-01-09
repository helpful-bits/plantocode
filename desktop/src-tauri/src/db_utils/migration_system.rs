use crate::db_utils::migration_utils::{execute_script_in_transaction, has_column};
use crate::error::{AppError, AppResult};
use log::{error, info, warn};
use semver::{Version, VersionReq};
use serde::{Deserialize, Serialize};
use sqlx::SqlitePool;
use std::sync::Arc;
use tauri::{AppHandle, Manager};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MigrationRule {
    /// Unique identifier for this migration
    pub id: String,
    /// Migration SQL file path
    #[serde(alias = "path")]
    pub migration_file: String,
    /// Semantic version requirement (e.g., ">=1.0.0, <2.0.0" or "1.x" or "*")
    #[serde(default = "default_version")]
    pub from_version: String,
    /// Target version pattern (e.g., "2.0.0" or ">=2.0.0")
    #[serde(default = "default_version")]
    pub to_version: String,
    /// Optional description
    pub description: Option<String>,
    /// Whether this migration is required (if false, failures are non-fatal)
    #[serde(default)]
    pub required: bool,
    /// Order priority (lower numbers run first)
    #[serde(default)]
    pub priority: i32,
    /// Optional guard: only run if this column is absent
    #[serde(default)]
    pub run_if_absent_column: Option<RunIfAbsentColumn>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RunIfAbsentColumn {
    pub table: String,
    pub column: String,
}

fn default_version() -> String {
    "*".to_string()
}

#[derive(Deserialize)]
struct MigrationRulesConfig {
    migrations: Vec<MigrationRule>,
}

pub struct MigrationSystem {
    pool: Arc<SqlitePool>,
}

impl MigrationSystem {
    pub fn new(pool: Arc<SqlitePool>) -> Self {
        Self { pool }
    }

    pub async fn run_migrations(
        &self,
        app_handle: &AppHandle,
        current_version: &str,
    ) -> AppResult<()> {
        // Check for concurrent migration
        let guard_key = "migrations_in_progress";
        if let Ok(Some(val)) = sqlx::query_scalar::<_, String>(
            "SELECT value FROM key_value_store WHERE key = ?"
        ).bind(guard_key).fetch_optional(&*self.pool).await {
            if let Ok(timestamp) = val.parse::<i64>() {
                let now = std::time::SystemTime::now()
                    .duration_since(std::time::UNIX_EPOCH)
                    .unwrap()
                    .as_secs() as i64;
                if now - timestamp < 120 {
                    return Err(AppError::DatabaseError(
                        "Migrations already in progress".to_string()
                    ));
                }
            }
        }
        // Set guard
        let guard_timestamp = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_secs()
            .to_string();
        sqlx::query(
            "INSERT OR REPLACE INTO key_value_store (key, value, updated_at)
             VALUES (?, ?, strftime('%s','now'))"
        )
        .bind(guard_key)
        .bind(&guard_timestamp)
        .execute(&*self.pool)
        .await?;

        // Ensure guard is cleared on exit
        struct GuardCleaner {
            pool: Arc<SqlitePool>,
            key: String,
        }
        impl Drop for GuardCleaner {
            fn drop(&mut self) {
                let pool = self.pool.clone();
                let key = self.key.clone();
                tokio::spawn(async move {
                    let _ = sqlx::query("DELETE FROM key_value_store WHERE key = ?")
                        .bind(key)
                        .execute(&*pool)
                        .await;
                });
            }
        }
        let _guard_cleaner = GuardCleaner {
            pool: self.pool.clone(),
            key: guard_key.to_string(),
        };

        // Get stored version from database
        let stored_version = self.get_stored_version().await?;

        // Parse current version
        let current = match Version::parse(current_version) {
            Ok(v) => v,
            Err(e) => {
                warn!(
                    "Failed to parse current version '{}': {}",
                    current_version, e
                );
                return Ok(());
            }
        };

        // If no stored version, this is a fresh install or pre-migration system
        if stored_version.is_none() {
            info!(
                "No stored version found. Setting current version: {}",
                current_version
            );
            self.set_stored_version(current_version).await?;
            return Ok(());
        }

        let stored_version_str = stored_version.unwrap();
        let stored = match Version::parse(&stored_version_str) {
            Ok(v) => v,
            Err(e) => {
                warn!(
                    "Failed to parse stored version '{}': {}",
                    stored_version_str, e
                );
                // Set current version and continue
                self.set_stored_version(current_version).await?;
                return Ok(());
            }
        };

        // Detect downgrade
        if stored > current {
            return Err(AppError::DatabaseError(format!(
                "Database downgrade detected: database version {} is newer than app version {}. \
                 Please upgrade the app or reset the database.",
                stored_version_str, current_version
            )));
        }

        // If versions match, no migration needed
        if stored == current {
            info!("App version unchanged: {}", current_version);
            return Ok(());
        }

        info!("Version change detected: {} -> {}", stored, current);

        // Get applicable migrations
        let migrations =
            self.get_applicable_migrations(&stored_version_str, current_version, app_handle).await?;

        if migrations.is_empty() {
            info!("No migrations needed for version change");
            self.set_stored_version(current_version).await?;
            return Ok(());
        }

        // Execute migrations
        for migration in migrations {
            if let Err(e) = self.execute_migration(&migration, app_handle).await {
                if migration.required {
                    error!("Required migration '{}' failed: {}", migration.id, e);
                    return Err(e);
                } else {
                    warn!("Optional migration '{}' failed: {}", migration.id, e);
                }
            }
        }

        // Validate database (quick_check is faster than integrity_check, ~3.3s improvement)
        let quick_check_result: String = sqlx::query_scalar("PRAGMA quick_check")
            .fetch_one(&*self.pool)
            .await?;
        if quick_check_result != "ok" {
            return Err(AppError::DatabaseError(format!(
                "Database quick check failed: {}",
                quick_check_result
            )));
        }

        // Check foreign keys
        let fk_violations: Vec<String> = sqlx::query_scalar("PRAGMA foreign_key_check")
            .fetch_all(&*self.pool)
            .await?;
        if !fk_violations.is_empty() {
            warn!(
                "Foreign key violations detected after migration: {:?}",
                fk_violations
            );
        }

        // Update stored version
        self.set_stored_version(current_version).await?;

        Ok(())
    }

    async fn get_applicable_migrations(
        &self,
        from_version: &str,
        to_version: &str,
        app_handle: &AppHandle,
    ) -> AppResult<Vec<MigrationRule>> {
        // Load all available migrations
        let all_migrations = self.load_migration_rules(app_handle);

        let from = match Version::parse(from_version) {
            Ok(v) => v,
            Err(_) => return Ok(Vec::new()),
        };

        let to = match Version::parse(to_version) {
            Ok(v) => v,
            Err(_) => return Ok(Vec::new()),
        };

        // Filter applicable migrations
        let mut applicable: Vec<MigrationRule> = Vec::new();
        for rule in all_migrations {
            // Check if this migration applies to our version transition
            if !self.is_migration_applicable(&rule, &from, &to) {
                continue;
            }

            // Check run_if_absent_column guard
            if let Some(ref guard) = rule.run_if_absent_column {
                if has_column(&self.pool, &guard.table, &guard.column).await? {
                    // Column exists, skip but mark as applied
                    info!(
                        "Migration '{}' skipped: column {}.{} already exists",
                        rule.id, guard.table, guard.column
                    );
                    // Mark as applied to avoid running in future
                    let key = format!("migration_{}_applied", rule.id);
                    let _ = sqlx::query(
                        "INSERT OR IGNORE INTO key_value_store (key, value, updated_at)
                         VALUES (?, 'true', strftime('%s', 'now'))"
                    )
                    .bind(&key)
                    .execute(&*self.pool)
                    .await;
                    continue;
                }
            }

            applicable.push(rule);
        }

        // Sort by priority
        applicable.sort_by_key(|m| m.priority);

        // Remove duplicates (keep first occurrence based on priority)
        let mut seen_ids = std::collections::HashSet::new();
        applicable.retain(|m| seen_ids.insert(m.id.clone()));

        info!("Found {} applicable migrations", applicable.len());
        for migration in &applicable {
            info!(
                "  - {} (priority: {}): {}",
                migration.id,
                migration.priority,
                migration
                    .description
                    .as_ref()
                    .unwrap_or(&"No description".to_string())
            );
        }

        Ok(applicable)
    }

    fn is_migration_applicable(&self, rule: &MigrationRule, from: &Version, to: &Version) -> bool {
        // Parse version requirements
        let from_matches = self.version_matches(&rule.from_version, from);
        let to_matches = self.version_matches(&rule.to_version, to);

        from_matches && to_matches
    }

    fn version_matches(&self, pattern: &str, version: &Version) -> bool {
        // Try VersionReq first for proper semver handling
        if let Ok(req) = VersionReq::parse(pattern) {
            return req.matches(version);
        }

        // Fallback to special cases for legacy patterns
        match pattern {
            "*" | "any" => true,
            pattern if pattern.starts_with("<=") => {
                if let Ok(v) = Version::parse(&pattern[2..].trim()) {
                    version <= &v
                } else {
                    false
                }
            }
            pattern if pattern.starts_with(">=") => {
                if let Ok(v) = Version::parse(&pattern[2..].trim()) {
                    version >= &v
                } else {
                    false
                }
            }
            pattern if pattern.starts_with("<") => {
                if let Ok(v) = Version::parse(&pattern[1..].trim()) {
                    version < &v
                } else {
                    false
                }
            }
            pattern if pattern.starts_with(">") => {
                if let Ok(v) = Version::parse(&pattern[1..].trim()) {
                    version > &v
                } else {
                    false
                }
            }
            pattern if pattern.contains('x') || pattern.contains('*') => {
                // Handle patterns like "1.x" or "1.*" or "1.2.x"
                let pattern_normalized = pattern.replace('x', "*").replace(".*", "");

                // Try to create a version requirement
                if let Ok(req) = VersionReq::parse(&format!("~{}", pattern_normalized)) {
                    req.matches(version)
                } else {
                    false
                }
            }
            pattern if pattern.contains("..") => {
                // Handle range patterns like "1.0.0..2.0.0"
                let parts: Vec<&str> = pattern.split("..").collect();
                if parts.len() == 2 {
                    if let (Ok(start), Ok(end)) =
                        (Version::parse(parts[0]), Version::parse(parts[1]))
                    {
                        version >= &start && version < &end
                    } else {
                        false
                    }
                } else {
                    false
                }
            }
            _ => {
                // Try exact version match
                if let Ok(exact_version) = Version::parse(pattern) {
                    version == &exact_version
                } else {
                    false
                }
            }
        }
    }

    fn load_migration_rules(&self, app_handle: &AppHandle) -> Vec<MigrationRule> {
        // Helper to try loading and parsing from a JSON string
        let try_parse_rules = |json_str: String| -> Option<Vec<MigrationRule>> {
            // Try parsing as complete config first
            if let Ok(config) = serde_json::from_str::<MigrationRulesConfig>(&json_str) {
                return Some(config.migrations);
            }

            // If that fails, try per-item deserialization
            warn!("Failed to parse migration_rules.json, attempting per-item load");
            if let Ok(value) = serde_json::from_str::<serde_json::Value>(&json_str) {
                if let Some(migrations_array) = value.get("migrations").and_then(|v| v.as_array()) {
                    let mut migrations = Vec::new();
                    for (idx, item) in migrations_array.iter().enumerate() {
                        match serde_json::from_value::<MigrationRule>(item.clone()) {
                            Ok(rule) => migrations.push(rule),
                            Err(e) => {
                                warn!("Failed to parse migration rule at index {}: {}", idx, e);
                            }
                        }
                    }
                    if !migrations.is_empty() {
                        info!("Loaded {} migrations via per-item parsing", migrations.len());
                        return Some(migrations);
                    }
                }
            }
            None
        };

        // Method 1: Try using the resource directory directly
        if let Ok(resource_dir) = app_handle.path().resource_dir() {
            let rules_path = resource_dir.join("migrations").join("migration_rules.json");
            if rules_path.exists() {
                if let Ok(json_str) = std::fs::read_to_string(&rules_path) {
                    if let Some(migrations) = try_parse_rules(json_str) {
                        info!("Loaded migration rules from resource directory");
                        return migrations;
                    }
                }
            }
        }

        // Method 2: Try PathResolver with BaseDirectory::Resource
        if let Ok(path) = app_handle.path().resolve(
            "migrations/migration_rules.json",
            tauri::path::BaseDirectory::Resource,
        ) {
            if path.exists() {
                if let Ok(json_str) = std::fs::read_to_string(&path) {
                    if let Some(migrations) = try_parse_rules(json_str) {
                        info!("Loaded migration rules from resolved resource");
                        return migrations;
                    }
                }
            }
        }

        // Method 3: Try local path as fallback (development)
        if let Ok(json_str) = std::fs::read_to_string("migrations/migration_rules.json") {
            if let Some(migrations) = try_parse_rules(json_str) {
                info!("Loaded migration rules from local file");
                return migrations;
            }
        }

        // Fallback to hardcoded rules
        vec![
            // Add error_logs table for any version before 1.1.0 upgrading to 1.1.0 or later
            MigrationRule {
                id: "add_error_logs".to_string(),
                from_version: "<1.1.0".to_string(),
                to_version: ">=1.1.0".to_string(),
                migration_file: "migrations/features/add_error_logs.sql".to_string(),
                description: Some("Add error logging table and indexes".to_string()),
                required: false,
                priority: 10,
                run_if_absent_column: None,
            },
            // Example: Billing system upgrade for 1.x to 2.x
            MigrationRule {
                id: "billing_v2".to_string(),
                from_version: "1.*".to_string(),
                to_version: "2.*".to_string(),
                migration_file: "migrations/features/billing_v2.sql".to_string(),
                description: Some("Upgrade billing system to v2".to_string()),
                required: true,
                priority: 20,
                run_if_absent_column: None,
            },
            // History state v1: Add current index tracking and metadata columns
            MigrationRule {
                id: "history_state_v1".to_string(),
                from_version: "*".to_string(),
                to_version: ">=1.0.0".to_string(),
                migration_file: "migrations/features/history_state_v1.sql".to_string(),
                description: Some("Add history state tracking with current index and metadata".to_string()),
                required: true,
                priority: 30,
                run_if_absent_column: Some(RunIfAbsentColumn {
                    table: "sessions".to_string(),
                    column: "task_history_current_index".to_string(),
                }),
            },
            // Add history version tracking for optimistic locking
            MigrationRule {
                id: "add_history_versions".to_string(),
                from_version: "*".to_string(),
                to_version: ">=1.0.0".to_string(),
                migration_file: "migrations/features/add_history_versions.sql".to_string(),
                description: Some("Add version tracking columns for history synchronization".to_string()),
                required: true,
                priority: 31,
                run_if_absent_column: Some(RunIfAbsentColumn {
                    table: "sessions".to_string(),
                    column: "task_history_version".to_string(),
                }),
            },
            // Performance indexes for any version upgrading to 1.2.0 or later
            MigrationRule {
                id: "performance_indexes".to_string(),
                from_version: "*".to_string(),
                to_version: ">=1.2.0".to_string(),
                migration_file: "migrations/optimizations/indexes.sql".to_string(),
                description: Some("Add performance indexes".to_string()),
                required: false,
                priority: 100,
                run_if_absent_column: None,
            },
        ]
    }

    async fn execute_migration(
        &self,
        migration: &MigrationRule,
        app_handle: &AppHandle,
    ) -> AppResult<()> {
        // Check if migration was already applied
        if self.is_migration_applied(&migration.id).await? {
            info!("Migration '{}' already applied, skipping", migration.id);
            return Ok(());
        }

        info!(
            "Applying migration '{}': {}",
            migration.id,
            migration
                .description
                .as_ref()
                .unwrap_or(&"No description".to_string())
        );

        // Load migration SQL
        let migration_sql = self
            .load_migration_file(app_handle, &migration.migration_file)
            .await?;

        // Execute in transaction using utility
        if let Err(e) = execute_script_in_transaction(&self.pool, &migration_sql).await {
            // Log error to error_logs table
            let error_msg = format!("Migration '{}' failed: {}", migration.id, e);
            let migration_excerpt = if migration_sql.len() > 200 {
                format!("{}...", &migration_sql[..200])
            } else {
                migration_sql.clone()
            };

            let _ = sqlx::query(
                "INSERT INTO error_logs (timestamp, error_type, error_message, context, stack_trace)
                 VALUES (strftime('%s', 'now'), 'migration_error', ?, ?, ?)"
            )
            .bind(&error_msg)
            .bind(format!("migration_id: {}", migration.id))
            .bind(migration_excerpt)
            .execute(&*self.pool)
            .await;

            return Err(AppError::DatabaseError(error_msg));
        }

        // Record migration as applied in key_value_store
        sqlx::query(
            "INSERT INTO key_value_store (key, value, updated_at)
             VALUES (?, 'true', strftime('%s', 'now'))",
        )
        .bind(format!("migration_{}_applied", migration.id))
        .execute(&*self.pool)
        .await?;

        // Also record in migrations table
        sqlx::query(
            "INSERT INTO migrations(name, applied_at)
             VALUES(?, strftime('%s','now'))
             ON CONFLICT(name) DO UPDATE SET applied_at=excluded.applied_at"
        )
        .bind(&migration.id)
        .execute(&*self.pool)
        .await
        .ok();

        info!("Successfully applied migration '{}'", migration.id);
        Ok(())
    }

    async fn is_migration_applied(&self, migration_id: &str) -> AppResult<bool> {
        let key = format!("migration_{}_applied", migration_id);
        let result = sqlx::query_scalar::<_, Option<String>>(
            "SELECT value FROM key_value_store WHERE key = ?",
        )
        .bind(key)
        .fetch_optional(&*self.pool)
        .await?;

        Ok(result.is_some())
    }

    pub async fn get_stored_version(&self) -> AppResult<Option<String>> {
        let row = sqlx::query_scalar::<_, Option<String>>(
            "SELECT value FROM key_value_store WHERE key = 'app_version'",
        )
        .fetch_optional(&*self.pool)
        .await?;

        Ok(row.flatten())
    }

    async fn set_stored_version(&self, version: &str) -> AppResult<()> {
        sqlx::query(
            "INSERT OR REPLACE INTO key_value_store (key, value, updated_at) 
             VALUES ('app_version', ?, strftime('%s', 'now'))",
        )
        .bind(version)
        .execute(&*self.pool)
        .await?;

        Ok(())
    }

    async fn load_migration_file(&self, app_handle: &AppHandle, path: &str) -> AppResult<String> {
        // Try to load from resource path
        let migration_path = app_handle
            .path()
            .resolve(path, tauri::path::BaseDirectory::Resource)
            .ok();

        if let Some(p) = migration_path {
            if p.exists() {
                return std::fs::read_to_string(&p)
                    .map_err(|e| AppError::FileSystemError(e.to_string()));
            }
        }

        // Try local path
        if let Ok(content) = std::fs::read_to_string(path) {
            return Ok(content);
        }

        // Return error if file not found in filesystem
        warn!("Migration file not found: {}", path);
        Err(AppError::FileSystemError(format!(
            "Migration file not found: {}",
            path
        )))
    }
}

/// Check if this is a fresh database (no tables exist yet)
pub async fn is_fresh_database(pool: &SqlitePool) -> AppResult<bool> {
    let table_count: i32 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'",
    )
    .fetch_one(pool)
    .await?;

    Ok(table_count == 0)
}

/// Apply the embedded consolidated schema to a fresh database
pub async fn apply_embedded_consolidated_schema(pool: &SqlitePool) -> AppResult<()> {
    info!("Applying embedded consolidated schema to fresh database");

    let schema_sql = crate::app_setup::embedded_schema::get_consolidated_schema_sql();

    // Execute using transaction utility
    execute_script_in_transaction(pool, &schema_sql).await.map_err(|e| {
        AppError::DatabaseError(format!("Failed to apply embedded schema: {}", e))
    })?;

    info!("Database bootstrap: consolidated schema applied (fresh DB)");
    Ok(())
}
