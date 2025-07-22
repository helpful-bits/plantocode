use std::fmt;
use std::hash::{Hash, Hasher};
use std::path::PathBuf;
use std::sync::Arc;

/// A unique identifier for a file lock
#[derive(Clone, Eq)]
pub struct FileLockId(pub String);

impl fmt::Debug for FileLockId {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(&self.0)
    }
}

impl PartialEq for FileLockId {
    fn eq(&self, other: &Self) -> bool {
        self.0 == other.0
    }
}

impl Hash for FileLockId {
    fn hash<H: Hasher>(&self, state: &mut H) {
        self.0.hash(state);
    }
}

/// The type of lock on a file
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum LockMode {
    /// Multiple readers can access a file simultaneously
    Read,

    /// Only one writer can access a file, and it's exclusive
    Write,
}

/// Information about an active file lock
#[derive(Debug)]
pub struct FileLockInfo {
    pub id: FileLockId,
    pub mode: LockMode,
    pub path: PathBuf,
}

/// A guard that automatically releases the lock when dropped
#[derive(Debug)]
pub struct FileLockGuard {
    pub id: FileLockId,
    pub path: PathBuf,
    pub lock_manager: Arc<crate::utils::file_lock_manager::FileLockManager>,
}

impl Drop for FileLockGuard {
    fn drop(&mut self) {
        // Use block_in_place to allow dropping in async context
        tokio::task::block_in_place(|| {
            let rt = tokio::runtime::Handle::current();
            // Use a blocking task to run async release code in a sync context
            let _ = rt.block_on(self.lock_manager.release_internal(&self.id, &self.path));
        });
    }
}
