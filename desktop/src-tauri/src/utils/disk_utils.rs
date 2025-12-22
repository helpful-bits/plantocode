use crate::error::{AppError, AppResult};
use std::path::Path;

/// Get available disk space in bytes for a given path
pub fn get_available_bytes_for_path(path: &Path) -> AppResult<u64> {
    fs2::available_space(path).map_err(|e| {
        AppError::FileSystemError(format!(
            "Failed to get available disk space for {}: {}",
            path.display(),
            e
        ))
    })
}
