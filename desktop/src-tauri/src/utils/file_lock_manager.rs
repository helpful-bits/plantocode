use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::time::{Duration, Instant};
use tokio::sync::{Mutex, Notify};
use tokio::time::timeout;
use uuid::Uuid;
use log::{debug, warn, error};

use crate::error::{AppError, AppResult};
use super::file_lock_types::{FileLockId, FileLockInfo, FileLockGuard, LockMode};
use super::path_utils::normalize_path;

/// A manager for file locks that prevents concurrent access to files
#[derive(Debug)]
pub struct FileLockManager {
    /// Maps file paths to active locks
    active_locks: Mutex<HashMap<PathBuf, Vec<FileLockInfo>>>,
    
    /// Maps file paths to notification objects for waiting tasks
    lock_waiters: Mutex<HashMap<PathBuf, Arc<Notify>>>,
    
    /// Timeout duration for locks
    lock_timeout: Duration,
}

impl FileLockManager {
    /// Create a new FileLockManager
    pub fn new(timeout: Duration) -> Self {
        FileLockManager {
            active_locks: Mutex::new(HashMap::new()),
            lock_waiters: Mutex::new(HashMap::new()),
            lock_timeout: timeout,
        }
    }
    
    /// Acquire a lock on a file
    pub async fn acquire(self: Arc<Self>, path: &Path, mode: LockMode) -> AppResult<FileLockGuard> {
        let path_normalized = PathBuf::from(normalize_path(path));
        let timeout_duration = self.lock_timeout;
        
        // Try to acquire lock with timeout
        match timeout(timeout_duration, self.acquire_internal(&path_normalized, mode, self.clone())).await {
            Ok(result) => result,
            Err(_) => Err(AppError::FileLockError(format!(
                "Timeout waiting for lock on {}",
                path_normalized.display()
            ))),
        }
    }
    
    /// Internal implementation of lock acquisition
    async fn acquire_internal(
        &self,
        path: &Path,
        mode: LockMode,
        self_arc: Arc<Self>,
    ) -> AppResult<FileLockGuard> {
        let path_normalized = path.to_path_buf();
        let path_normalized_clone = path_normalized.clone();
        
        // Loop until we acquire the lock or timeout
        loop {
            // Lock the active_locks collection
            let mut locks = self.active_locks.lock().await;
            
            // Get current locks for this path
            let path_locks = locks.entry(path_normalized.clone()).or_insert_with(Vec::new);
            
            // Check if we can acquire the lock
            if Self::can_acquire_lock(path_locks, mode) {
                // Create a new lock ID
                let lock_id = FileLockId(Uuid::new_v4().to_string());
                
                // Add lock to active_locks
                let lock_info = FileLockInfo {
                    id: lock_id.clone(),
                    mode,
                    path: path_normalized.clone(),
                    acquired_at: Instant::now(),
                };
                
                path_locks.push(lock_info);
                
                debug!("Acquired {:?} lock on {}", mode, path_normalized.display());
                
                // Create and return the lock guard
                let guard = FileLockGuard {
                    id: lock_id,
                    path: path_normalized.clone(),
                    lock_manager: self_arc.clone(),
                };
                
                // Spawn a task that will auto-expire the lock if it's held too long
                let lock_id_clone = guard.id.clone();
                let path_clone = path_normalized.clone();
                let self_clone = self_arc.clone();
                let timeout_duration = self.lock_timeout;
                
                tokio::spawn(async move {
                    tokio::time::sleep(timeout_duration).await;
                    
                    // Check if lock still exists (it may have been released already)
                    let locks = self_clone.active_locks.lock().await;
                    if let Some(path_locks) = locks.get(&path_clone) {
                        if path_locks.iter().any(|lock| lock.id == lock_id_clone) {
                            // Lock is still held, force release it
                            warn!("Auto-releasing expired lock on {}", path_clone.display());
                            drop(locks); // Release the mutex before calling release
                            
                            let _ = self_clone.release_internal(&lock_id_clone, &path_clone).await;
                        }
                    }
                });
                
                return Ok(guard);
            }
            
            // If we can't acquire the lock, we need to wait
            // Get or create a Notify for this path
            let path_clone = path_normalized.clone();
            drop(locks); // Release the mutex before waiting
            
            let notify = {
                let mut waiters = self.lock_waiters.lock().await;
                waiters
                    .entry(path_clone.clone())
                    .or_insert_with(|| Arc::new(Notify::new()))
                    .clone()
            };
            
            debug!("Waiting for lock on {}", path_clone.display());
            
            // Wait for notification
            notify.notified().await;
            
            debug!("Received notification for {}, retrying", path_clone.display());
            
            // Loop will restart and try to acquire the lock again
        }
    }
    
    /// Release a lock by ID and path
    pub(super) async fn release_internal(&self, lock_id: &FileLockId, path: &Path) -> AppResult<()> {
        let path_normalized = PathBuf::from(normalize_path(path));
        
        // Lock the active_locks collection
        let mut locks = self.active_locks.lock().await;
        
        // Find and remove the lock
        if let Some(path_locks) = locks.get_mut(&path_normalized) {
            let initial_len = path_locks.len();
            path_locks.retain(|lock| lock.id != *lock_id);
            
            // If we removed a lock, log it
            if path_locks.len() < initial_len {
                debug!("Released lock on {}", path_normalized.display());
                
                // If no more locks, remove the entry
                if path_locks.is_empty() {
                    locks.remove(&path_normalized);
                }
                
                // Notify any waiters that a lock was released
                let path_clone = path_normalized.clone();
                drop(locks); // Release the mutex before notifying
                self.notify_waiters(&path_clone).await;
                
                return Ok(());
            }
        }
        
        // If we didn't find the lock, it might have already been released
        warn!("Attempted to release non-existent lock on {}", path_normalized.display());
        Ok(())
    }
    
    /// Notify any tasks waiting for a lock on a given path
    async fn notify_waiters(&self, path: &Path) {
        let mut waiters = self.lock_waiters.lock().await;
        
        if let Some(notify) = waiters.get(path) {
            debug!("Notifying waiters for {}", path.display());
            notify.notify_waiters();
        }
    }
    
    /// Check if a lock can be acquired
    fn can_acquire_lock(existing_locks: &Vec<FileLockInfo>, requested_mode: LockMode) -> bool {
        if existing_locks.is_empty() {
            // No locks, can acquire any mode
            return true;
        }
        
        match requested_mode {
            LockMode::Read => {
                // Can acquire read lock if all existing locks are read locks
                existing_locks.iter().all(|lock| lock.mode == LockMode::Read)
            }
            LockMode::Write => {
                // Can acquire write lock only if no existing locks
                false
            }
        }
    }
}

impl Clone for FileLockManager {
    fn clone(&self) -> Self {
        // Only clone the configuration, not the state
        Self::new(self.lock_timeout)
    }
}

/// Get the global FileLockManager instance
pub async fn get_global_file_lock_manager() -> AppResult<Arc<FileLockManager>> {
    crate::FILE_LOCK_MANAGER
        .get()
        .cloned()
        .ok_or_else(|| AppError::InternalError("FileLockManager not initialized".to_string()))
}