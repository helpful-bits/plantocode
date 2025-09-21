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
    /// Semantic version requirement (e.g., ">=1.0.0, <2.0.0" or "1.x" or "*")
    pub from_version: String,
    /// Target version pattern (e.g., "2.0.0" or ">=2.0.0")
    pub to_version: String,
    /// Migration SQL file path
    pub migration_file: String,
    /// Optional description
    pub description: Option<String>,
    /// Whether this migration is required (if false, failures are non-fatal)
    pub required: bool,
    /// Order priority (lower numbers run first)
    pub priority: i32,
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

        // If versions match, no migration needed
        if stored == current {
            info!("App version unchanged: {}", current_version);
            return Ok(());
        }

        info!("Version change detected: {} -> {}", stored, current);

        // Get applicable migrations
        let migrations =
            self.get_applicable_migrations(&stored_version_str, current_version, app_handle)?;

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

        // Update stored version
        self.set_stored_version(current_version).await?;

        Ok(())
    }

    fn get_applicable_migrations(
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
        let mut applicable: Vec<MigrationRule> = all_migrations
            .into_iter()
            .filter(|rule| {
                // Check if this migration applies to our version transition
                self.is_migration_applicable(rule, &from, &to)
            })
            .collect();

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
        // Handle special wildcards
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
                // Try exact version match or semver requirement
                if let Ok(exact_version) = Version::parse(pattern) {
                    version == &exact_version
                } else if let Ok(req) = VersionReq::parse(pattern) {
                    req.matches(version)
                } else {
                    false
                }
            }
        }
    }

    fn load_migration_rules(&self, app_handle: &AppHandle) -> Vec<MigrationRule> {
        // Method 1: Try using the resource directory directly
        if let Ok(resource_dir) = app_handle.path().resource_dir() {
            let rules_path = resource_dir.join("migrations").join("migration_rules.json");
            if rules_path.exists() {
                if let Ok(json_str) = std::fs::read_to_string(&rules_path) {
                    if let Ok(config) = serde_json::from_str::<MigrationRulesConfig>(&json_str) {
                        info!("Loaded migration rules from resource directory");
                        return config.migrations;
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
                    if let Ok(config) = serde_json::from_str::<MigrationRulesConfig>(&json_str) {
                        info!("Loaded migration rules from resolved resource");
                        return config.migrations;
                    }
                }
            }
        }

        // Method 3: Try local path as fallback (development)
        if let Ok(json_str) = std::fs::read_to_string("migrations/migration_rules.json") {
            if let Ok(config) = serde_json::from_str::<MigrationRulesConfig>(&json_str) {
                info!("Loaded migration rules from local file");
                return config.migrations;
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

        // Execute in transaction
        let mut tx = self.pool.begin().await?;

        // Split and execute statements
        for statement in migration_sql.split(';') {
            let trimmed = statement.trim();
            if !trimmed.is_empty() && !trimmed.starts_with("--") {
                sqlx::query(trimmed).execute(&mut *tx).await.map_err(|e| {
                    AppError::DatabaseError(format!("Migration '{}' failed: {}", migration.id, e))
                })?;
            }
        }

        // Record migration as applied
        sqlx::query(
            "INSERT INTO key_value_store (key, value, updated_at) 
             VALUES (?, 'true', strftime('%s', 'now'))",
        )
        .bind(format!("migration_{}_applied", migration.id))
        .execute(&mut *tx)
        .await?;

        tx.commit().await?;

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

    async fn get_stored_version(&self) -> AppResult<Option<String>> {
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

    // Execute the schema SQL
    let mut tx = pool.begin().await?;

    // Split and execute statements
    for statement in schema_sql.split(';') {
        let trimmed = statement.trim();
        if !trimmed.is_empty() && !trimmed.starts_with("--") {
            sqlx::query(trimmed).execute(&mut *tx).await.map_err(|e| {
                AppError::DatabaseError(format!("Failed to apply embedded schema: {}", e))
            })?;
        }
    }

    tx.commit().await?;

    info!("Database bootstrap: consolidated schema applied (fresh DB)");
    Ok(())
}
