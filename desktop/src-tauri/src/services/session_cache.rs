use crate::db_utils::session_repository::SessionRepository;
use crate::error::{AppError, AppResult};
use crate::events::session_events::{
    emit_session_field_validated, emit_session_files_updated, emit_session_updated_from_model,
};
use crate::models::Session;
use crate::utils::date_utils;
use crate::utils::hash_utils::{hash_string, sha256_hash};
use sha2::{Digest, Sha256};
use std::collections::{HashMap, HashSet};
use std::sync::Arc;
use tauri::Manager;
use tokio::sync::RwLock;

const ALLOWED_SESSION_UPDATE_FIELDS: [&str; 7] = [
    "name",
    "projectDirectory",
    "mergeInstructions",
    "searchTerm",
    "searchSelectedFilesOnly",
    "modelUsed",
    "videoAnalysisPrompt",
];

#[derive(Debug, Clone)]
struct CachedSession {
    session: Session,
    dirty_fields: bool,
    dirty_files: bool,
    last_modified_ms: i64,
    last_flushed_ms: i64,
    revision: u64,
}

#[derive(Debug)]
pub struct SessionCache {
    map: RwLock<HashMap<String, CachedSession>>,
}

impl SessionCache {
    /// Initialize empty cache
    pub fn new() -> Self {
        Self {
            map: RwLock::new(HashMap::new()),
        }
    }

    /// Initialize cache from database - load all sessions
    pub async fn initialize_from_db(&self, app: &tauri::AppHandle) -> AppResult<()> {
        let repo = app
            .state::<Arc<crate::db_utils::session_repository::SessionRepository>>()
            .inner()
            .clone();

        let sessions = repo.get_all_sessions().await?;
        let now = date_utils::get_timestamp();

        let mut map = self.map.write().await;
        for session in sessions {
            let cached = CachedSession {
                session: session.clone(),
                dirty_fields: false,
                dirty_files: false,
                last_modified_ms: session.updated_at,
                last_flushed_ms: now,
                revision: 0,
            };
            map.insert(session.id.clone(), cached);
        }

        let count = map.len();
        drop(map);

        tracing::debug!("SessionCache initialized with {} sessions", count);
        Ok(())
    }

    /// Get a session by ID - return clone if in cache, otherwise fetch from DB
    pub async fn get_session(&self, app: &tauri::AppHandle, id: &str) -> AppResult<Session> {
        // Try read lock first
        {
            let map = self.map.read().await;
            if let Some(cached) = map.get(id) {
                return Ok(cached.session.clone());
            }
        }

        // Not in cache - fetch from DB
        let repo = app
            .state::<Arc<crate::db_utils::session_repository::SessionRepository>>()
            .inner()
            .clone();

        let session = repo
            .get_session_by_id(id)
            .await?
            .ok_or_else(|| AppError::NotFoundError(format!("Session not found: {}", id)))?;

        // Insert into cache
        let now = date_utils::get_timestamp();
        let cached = CachedSession {
            session: session.clone(),
            dirty_fields: false,
            dirty_files: false,
            last_modified_ms: session.updated_at,
            last_flushed_ms: now,
            revision: 0,
        };

        let mut map = self.map.write().await;
        map.insert(id.to_string(), cached);

        Ok(session)
    }

    /// Upsert a session - insert or replace entire session
    pub async fn upsert_session(
        &self,
        app: &tauri::AppHandle,
        updated: &Session,
    ) -> AppResult<()> {
        let now = date_utils::get_timestamp();
        let mut map = self.map.write().await;

        let (new_revision, mark_fields_dirty, mark_files_dirty) =
            if let Some(cached) = map.get(&updated.id) {
                // Detect what changed
                let fields_changed = cached.session.name != updated.name
                    || cached.session.project_directory != updated.project_directory
                    || cached.session.project_hash != updated.project_hash
                    || cached.session.task_description != updated.task_description
                    || cached.session.search_term != updated.search_term
                    || cached.session.search_selected_files_only != updated.search_selected_files_only
                    || cached.session.model_used != updated.model_used
                    || cached.session.video_analysis_prompt != updated.video_analysis_prompt
                    || cached.session.merge_instructions != updated.merge_instructions;

                let files_changed = cached.session.included_files != updated.included_files
                    || cached.session.force_excluded_files != updated.force_excluded_files;

                (cached.revision + 1, fields_changed, files_changed)
            } else {
                // New session - mark fields dirty but not files (assume files are from DB sync)
                (1, true, false)
            };

        let cached = CachedSession {
            session: updated.clone(),
            dirty_fields: mark_fields_dirty,
            dirty_files: mark_files_dirty,
            last_modified_ms: now,
            last_flushed_ms: if mark_fields_dirty || mark_files_dirty {
                map.get(&updated.id)
                    .map(|c| c.last_flushed_ms)
                    .unwrap_or(now)
            } else {
                now
            },
            revision: new_revision,
        };

        map.insert(updated.id.clone(), cached);
        drop(map);

        // Emit event
        emit_session_updated_from_model(app, updated)
            .map_err(|e| AppError::InternalError(format!("Failed to emit session event: {}", e)))?;

        if mark_fields_dirty || mark_files_dirty {
            tracing::debug!(
                "session {} marked dirty (fields={}, files={}) rev={}",
                updated.id,
                mark_fields_dirty,
                mark_files_dirty,
                new_revision
            );
        }

        Ok(())
    }

    /// Update task_description field - canonical single-field update
    pub async fn update_task_description_canonical(
        &self,
        app: &tauri::AppHandle,
        session_id: &str,
        content: &str,
    ) -> AppResult<()> {
        let now = date_utils::get_timestamp();
        let mut map = self.map.write().await;

        let cached = map
            .get_mut(session_id)
            .ok_or_else(|| AppError::NotFoundError(format!("Session not in cache: {}", session_id)))?;

        // Skip identical updates to avoid redundant emits
        if cached.session.task_description.as_deref() == Some(content) {
            return Ok(());
        }

        cached.session.task_description = Some(content.to_string());
        cached.session.updated_at = now;
        cached.dirty_fields = true;
        cached.last_modified_ms = now;
        cached.revision += 1;

        let session_clone = cached.session.clone();
        let revision = cached.revision;
        drop(map);

        // Emit events
        emit_session_updated_from_model(app, &session_clone)
            .map_err(|e| AppError::InternalError(format!("Failed to emit session event: {}", e)))?;

        // Compute checksum using SHA256
        let mut hasher = Sha256::new();
        hasher.update(content.as_bytes());
        let checksum_bytes = hasher.finalize();
        let checksum = format!("{:x}", checksum_bytes);

        emit_session_field_validated(app, session_id, "taskDescription", &checksum, content.len())
            .map_err(|e| AppError::InternalError(format!("Failed to emit field validated event: {}", e)))?;

        tracing::debug!(
            "session {} marked dirty (fields) rev={}",
            session_id,
            revision
        );

        Ok(())
    }

    /// Update multiple fields via JSON patch
    pub async fn update_fields_partial(
        &self,
        app: &tauri::AppHandle,
        session_id: &str,
        patch: &serde_json::Value,
    ) -> AppResult<()> {
        let obj = patch
            .as_object()
            .ok_or_else(|| AppError::InvalidArgument("update patch must be an object".to_string()))?;

        let invalid_fields: Vec<String> = obj
            .keys()
            .filter(|key| !ALLOWED_SESSION_UPDATE_FIELDS.contains(&key.as_str()))
            .cloned()
            .collect();

        if !invalid_fields.is_empty() {
            return Err(AppError::InvalidArgument(format!(
                "Unsupported session update fields: {}",
                invalid_fields.join(", ")
            )));
        }

        let now = date_utils::get_timestamp();
        let mut map = self.map.write().await;

        let cached = map
            .get_mut(session_id)
            .ok_or_else(|| AppError::NotFoundError(format!("Session not in cache: {}", session_id)))?;

        // Apply patch fields
        if let Some(name) = obj.get("name").and_then(|v| v.as_str()) {
            cached.session.name = name.to_string();
        }
        if let Some(project_directory) = obj.get("projectDirectory").and_then(|v| v.as_str()) {
            cached.session.project_directory = project_directory.to_string();
            // Recompute project_hash
            cached.session.project_hash = hash_string(project_directory);
        }
        if let Some(merge_instructions) = obj.get("mergeInstructions") {
            cached.session.merge_instructions = if merge_instructions.is_null() {
                None
            } else {
                merge_instructions.as_str().map(|s| s.to_string())
            };
        }
        if let Some(search_term) = obj.get("searchTerm") {
            cached.session.search_term = if search_term.is_null() {
                None
            } else {
                search_term.as_str().map(|s| s.to_string())
            };
        }
        if let Some(search_selected_files_only) = obj.get("searchSelectedFilesOnly").and_then(|v| v.as_bool()) {
            cached.session.search_selected_files_only = search_selected_files_only;
        }
        if let Some(model_used) = obj.get("modelUsed") {
            cached.session.model_used = if model_used.is_null() {
                None
            } else {
                model_used.as_str().map(|s| s.to_string())
            };
        }
        if let Some(video_analysis_prompt) = obj.get("videoAnalysisPrompt") {
            cached.session.video_analysis_prompt = if video_analysis_prompt.is_null() {
                None
            } else {
                video_analysis_prompt.as_str().map(|s| s.to_string())
            };
        }

        cached.session.updated_at = now;
        cached.dirty_fields = true;
        cached.last_modified_ms = now;
        cached.revision += 1;

        let session_clone = cached.session.clone();
        let revision = cached.revision;
        drop(map);

        // Emit event
        emit_session_updated_from_model(app, &session_clone)
            .map_err(|e| AppError::InternalError(format!("Failed to emit session event: {}", e)))?;

        tracing::debug!(
            "session {} marked dirty (fields) rev={}",
            session_id,
            revision
        );

        Ok(())
    }

    /// Update files with delta operations - enforce mutual exclusivity
    pub async fn update_files_delta(
        &self,
        app: &tauri::AppHandle,
        session_id: &str,
        add_included: &[String],
        remove_included: &[String],
        add_excluded: &[String],
        remove_excluded: &[String],
    ) -> AppResult<()> {
        let now = date_utils::get_timestamp();
        let mut map = self.map.write().await;

        let cached = map
            .get_mut(session_id)
            .ok_or_else(|| AppError::NotFoundError(format!("Session not in cache: {}", session_id)))?;

        // Convert to sets for efficient operations
        let mut included: HashSet<String> = cached.session.included_files.iter().cloned().collect();
        let mut excluded: HashSet<String> = cached.session.force_excluded_files.iter().cloned().collect();

        // Apply removals first
        for file in remove_included {
            included.remove(file);
        }
        for file in remove_excluded {
            excluded.remove(file);
        }

        // Apply additions with mutual exclusivity enforcement
        for file in add_included {
            if !file.trim().is_empty() {
                included.insert(file.clone());
                // Remove from excluded to enforce mutual exclusivity
                excluded.remove(file);
            }
        }
        for file in add_excluded {
            if !file.trim().is_empty() {
                excluded.insert(file.clone());
                // Remove from included to enforce mutual exclusivity
                included.remove(file);
            }
        }

        // Update session
        cached.session.included_files = included.into_iter().collect();
        cached.session.force_excluded_files = excluded.into_iter().collect();
        cached.session.updated_at = now;
        cached.dirty_files = true;
        cached.last_modified_ms = now;
        cached.revision += 1;

        let included_clone = cached.session.included_files.clone();
        let excluded_clone = cached.session.force_excluded_files.clone();
        let revision = cached.revision;
        drop(map);

        // Emit event
        emit_session_files_updated(app, session_id, &included_clone, &excluded_clone)
            .map_err(|e| AppError::InternalError(format!("Failed to emit files event: {}", e)))?;

        tracing::debug!(
            "session {} marked dirty (files) rev={}",
            session_id,
            revision
        );

        Ok(())
    }

    /// Merge files into included while respecting exclusions
    pub async fn merge_included_respecting_exclusions(
        &self,
        app: &tauri::AppHandle,
        session_id: &str,
        files: &[String],
    ) -> AppResult<Vec<String>> {
        let now = date_utils::get_timestamp();
        let mut map = self.map.write().await;

        let cached = map
            .get_mut(session_id)
            .ok_or_else(|| AppError::NotFoundError(format!("Session not in cache: {}", session_id)))?;

        let mut included: HashSet<String> = cached.session.included_files.iter().cloned().collect();
        let excluded: HashSet<String> = cached.session.force_excluded_files.iter().cloned().collect();

        let mut actually_added = Vec::new();

        for file in files {
            let trimmed = file.trim();
            if trimmed.is_empty() {
                continue;
            }

            // Skip if excluded
            if excluded.contains(trimmed) {
                continue;
            }

            // Track if newly added
            if !included.contains(trimmed) {
                actually_added.push(trimmed.to_string());
            }

            included.insert(trimmed.to_string());
        }

        // Only mark dirty and emit if files were actually added
        if !actually_added.is_empty() {
            cached.session.included_files = included.into_iter().collect();
            cached.session.updated_at = now;
            cached.dirty_files = true;
            cached.last_modified_ms = now;
            cached.revision += 1;

            let included_clone = cached.session.included_files.clone();
            let excluded_clone = cached.session.force_excluded_files.clone();
            let revision = cached.revision;
            drop(map);

            // Emit event
            emit_session_files_updated(app, session_id, &included_clone, &excluded_clone)
                .map_err(|e| AppError::InternalError(format!("Failed to emit files event: {}", e)))?;

            tracing::debug!(
                "session {} marked dirty (files) rev={}",
                session_id,
                revision
            );
        } else {
            drop(map);
        }

        Ok(actually_added)
    }

    /// Remove a session from cache
    pub async fn remove_session(&self, session_id: &str) {
        let mut map = self.map.write().await;
        map.remove(session_id);
    }

    /// Flush dirty sessions to database
    pub async fn flush_dirty_to_db(&self, app: &tauri::AppHandle) -> AppResult<()> {
        // Take snapshot of dirty sessions with read lock
        let dirty_sessions: Vec<(String, Session, u64)> = {
            let map = self.map.read().await;
            map.iter()
                .filter(|(_, cached)| cached.dirty_fields || cached.dirty_files)
                .map(|(id, cached)| (id.clone(), cached.session.clone(), cached.revision))
                .collect()
        };

        if dirty_sessions.is_empty() {
            // No dirty sessions to flush - return silently to avoid log spam
            return Ok(());
        }

        tracing::debug!("Flushing {} dirty sessions", dirty_sessions.len());

        let repo = app
            .state::<Arc<crate::db_utils::session_repository::SessionRepository>>()
            .inner()
            .clone();

        let now = date_utils::get_timestamp();

        for (id, session, rev_snapshot) in dirty_sessions {
            // Persist to database
            match repo.update_session(&session).await {
                Ok(_) => {
                    // Clear dirty flags only if revision hasn't changed
                    let mut map = self.map.write().await;
                    if let Some(cached) = map.get_mut(&id) {
                        if cached.revision == rev_snapshot {
                            cached.dirty_fields = false;
                            cached.dirty_files = false;
                            cached.last_flushed_ms = now;
                            tracing::debug!("Flushed session {} at rev={}", id, rev_snapshot);
                        }
                    }
                }
                Err(e) => {
                    tracing::error!("Flush failed for {}: {}", id, e);
                }
            }
        }

        Ok(())
    }

    /// Force flush all dirty sessions immediately
    pub async fn flush_all_now(&self, app: &tauri::AppHandle) -> AppResult<()> {
        self.flush_dirty_to_db(app).await
    }

    /// Flush a specific session to DB if it has dirty fields or files
    pub async fn flush_session_if_dirty(&self, app: &tauri::AppHandle, session_id: &str) -> AppResult<()> {
        let needs_flush = {
            let map = self.map.read().await;
            map.get(session_id)
                .map(|cached| cached.dirty_fields || cached.dirty_files)
                .unwrap_or(false)
        };

        if needs_flush {
            self.flush_dirty_to_db(app).await?;
        }

        Ok(())
    }

    /// Reload a session from database and update cache
    pub async fn reload_session_from_db(&self, app: &tauri::AppHandle, session_id: &str) -> AppResult<Session> {
        let repo = app.state::<Arc<SessionRepository>>().inner().clone();
        let session = repo.get_session_by_id(session_id).await?
            .ok_or_else(|| AppError::NotFoundError(format!("Session not found: {}", session_id)))?;
        self.upsert_session(app, &session).await?;
        Ok(session)
    }
}

impl Default for SessionCache {
    fn default() -> Self {
        Self::new()
    }
}
