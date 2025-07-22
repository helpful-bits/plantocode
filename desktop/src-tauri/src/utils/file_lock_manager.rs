use log::debug;
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use tokio::sync::Mutex;
use uuid::Uuid;

use super::file_lock_types::{FileLockGuard, FileLockId, FileLockInfo, LockMode};
use super::path_utils::normalize_path;
use crate::error::{AppError, AppResult};

/// A simple file lock manager for coordinating write operations only
/// This is a minimal mutex-style system focused on preventing concurrent writes
#[derive(Debug)]
pub struct FileLockManager {
    /// Maps file paths to active write locks
    active_locks: Mutex<HashMap<PathBuf, FileLockInfo>>,
}

impl FileLockManager {
    /// Create a new FileLockManager
    pub fn new() -> Self {
        FileLockManager {
            active_locks: Mutex::new(HashMap::new()),
        }
    }

    /// Acquire a write lock on a file (simplified for write operations only)
    pub async fn acquire(self: Arc<Self>, path: &Path, mode: LockMode) -> AppResult<FileLockGuard> {
        // Only allow write locks - this manager is for write coordination only
        if mode != LockMode::Write {
            return Err(AppError::FileLockError(
                "FileLockManager only supports write locks".to_string(),
            ));
        }

        let path_normalized = normalize_path(path)?;

        // Simple mutex-style lock - wait until we can acquire
        loop {
            let mut locks = self.active_locks.lock().await;

            // Check if path is already locked
            if !locks.contains_key(&path_normalized) {
                // Create a new lock
                let lock_id = FileLockId(Uuid::new_v4().to_string());

                let lock_info = FileLockInfo {
                    id: lock_id.clone(),
                    mode,
                    path: path_normalized.clone(),
                };

                locks.insert(path_normalized.clone(), lock_info);

                debug!("Acquired write lock on {}", path_normalized.display());

                return Ok(FileLockGuard {
                    id: lock_id,
                    path: path_normalized,
                    lock_manager: self.clone(),
                });
            }

            // Release the mutex and wait a bit before retrying
            drop(locks);
            tokio::time::sleep(tokio::time::Duration::from_millis(10)).await;
        }
    }

    /// Release a lock by ID and path
    pub(super) async fn release_internal(
        &self,
        lock_id: &FileLockId,
        path: &Path,
    ) -> AppResult<()> {
        let path_normalized = normalize_path(path)?;

        let mut locks = self.active_locks.lock().await;

        // Remove the lock if it matches
        if let Some(lock_info) = locks.get(&path_normalized) {
            if lock_info.id == *lock_id {
                locks.remove(&path_normalized);
                debug!("Released write lock on {}", path_normalized.display());
            }
        }

        Ok(())
    }
}

/// Get the global FileLockManager instance
pub async fn get_global_file_lock_manager() -> AppResult<Arc<FileLockManager>> {
    crate::FILE_LOCK_MANAGER
        .get()
        .cloned()
        .ok_or_else(|| AppError::InternalError("FileLockManager not initialized".to_string()))
}
