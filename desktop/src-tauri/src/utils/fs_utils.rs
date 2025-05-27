use std::path::{Path, PathBuf, Component};
use log::{info, error, debug};
use ::dirs;
use tokio::fs;
use tokio::io::AsyncReadExt;
use async_recursion::async_recursion;

use crate::error::{AppError, AppResult};
use crate::models::FileInfo;
use crate::constants::BINARY_EXTENSIONS;
use crate::utils::path_utils;
use crate::utils::{FileLockManager, LockMode};
use crate::utils::file_lock_manager::get_global_file_lock_manager;

/// Check if a file exists (async version)
pub async fn file_exists(path: impl AsRef<Path>) -> bool {
    fs::metadata(path.as_ref()).await.is_ok()
}

/// Check if a path exists (async version)
pub async fn path_exists(path: impl AsRef<Path>) -> AppResult<bool> {
    Ok(fs::metadata(path.as_ref()).await.is_ok())
}

/// Check if a path is a directory (async version)
pub async fn is_directory(path: impl AsRef<Path>) -> AppResult<bool> {
    let metadata = fs::metadata(path.as_ref()).await
        .map_err(|e| AppError::FileSystemError(format!(
            "Failed to check if path is directory {}: {}",
            path.as_ref().display(),
            e
        )))?;
    
    Ok(metadata.is_dir())
}

/// Read a file to string (async version)
pub async fn read_file_to_string(path: impl AsRef<Path>) -> AppResult<String> {
    let path = path.as_ref();
    
    // Check if the file exists
    if !file_exists(path).await {
        return Err(AppError::FileSystemError(format!(
            "File does not exist: {}",
            path.display()
        )));
    }
    
    // Acquire a read lock
    let lock_manager = get_global_file_lock_manager().await?;
    let _guard = lock_manager.acquire(path, LockMode::Read).await?;
    
    // Read the file
    fs::read_to_string(path).await.map_err(|e| {
        AppError::FileSystemError(format!(
            "Failed to read file {}: {}",
            path.display(),
            e
        ))
    })
    // The lock is automatically released when _guard goes out of scope
}

/// Read a file to bytes (async version)
pub async fn read_file_to_bytes(path: impl AsRef<Path>) -> AppResult<Vec<u8>> {
    let path = path.as_ref();
    
    // Check if the file exists
    if !file_exists(path).await {
        return Err(AppError::FileSystemError(format!(
            "File does not exist: {}",
            path.display()
        )));
    }
    
    // Acquire a read lock
    let lock_manager = get_global_file_lock_manager().await?;
    let _guard = lock_manager.acquire(path, LockMode::Read).await?;
    
    // Read the file
    fs::read(path).await.map_err(|e| {
        AppError::FileSystemError(format!(
            "Failed to read file {}: {}",
            path.display(),
            e
        ))
    })
    // The lock is automatically released when _guard goes out of scope
}

/// Write a string to a file (async version)
pub async fn write_string_to_file(path: impl AsRef<Path>, content: &str) -> AppResult<()> {
    let path = path.as_ref();
    
    // Acquire a write lock
    let lock_manager = get_global_file_lock_manager().await?;
    let _guard = lock_manager.acquire(path, LockMode::Write).await?;
    
    // Create the directory if it doesn't exist
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).await.map_err(|e| {
            AppError::FileSystemError(format!(
                "Failed to create directory {}: {}",
                parent.display(),
                e
            ))
        })?;
    }
    
    // Write the file
    fs::write(path, content).await.map_err(|e| {
        AppError::FileSystemError(format!(
            "Failed to write file {}: {}",
            path.display(),
            e
        ))
    })
    // The lock is automatically released when _guard goes out of scope
}

/// Write bytes to a file (async version)
pub async fn write_bytes_to_file(path: impl AsRef<Path>, content: &[u8]) -> AppResult<()> {
    let path = path.as_ref();
    
    // Acquire a write lock
    let lock_manager = get_global_file_lock_manager().await?;
    let _guard = lock_manager.acquire(path, LockMode::Write).await?;
    
    // Create the directory if it doesn't exist
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).await.map_err(|e| {
            AppError::FileSystemError(format!(
                "Failed to create directory {}: {}",
                parent.display(),
                e
            ))
        })?;
    }
    
    // Write the file
    fs::write(path, content).await.map_err(|e| {
        AppError::FileSystemError(format!(
            "Failed to write file {}: {}",
            path.display(),
            e
        ))
    })
    // The lock is automatically released when _guard goes out of scope
}

/// Create a directory (async version)
pub async fn create_directory(path: impl AsRef<Path>) -> AppResult<()> {
    let path = path.as_ref();
    
    // Create the directory
    fs::create_dir_all(path).await.map_err(|e| {
        AppError::FileSystemError(format!(
            "Failed to create directory {}: {}",
            path.display(),
            e
        ))
    })
}

/// List files in a directory (async version)
pub async fn list_directory(path: impl AsRef<Path>) -> AppResult<Vec<FileInfo>> {
    let path = path.as_ref();
    
    // Check if the directory exists
    if !file_exists(path).await {
        return Err(AppError::FileSystemError(format!(
            "Directory does not exist: {}",
            path.display()
        )));
    }
    
    // Check if the path is a directory
    if !is_directory(path).await? {
        return Err(AppError::FileSystemError(format!(
            "Path is not a directory: {}",
            path.display()
        )));
    }
    
    // Acquire a read lock on the directory
    let lock_manager = get_global_file_lock_manager().await?;
    let _guard = lock_manager.acquire(path, LockMode::Read).await?;
    
    // Read the directory
    let mut entries = fs::read_dir(path).await.map_err(|e| {
        AppError::FileSystemError(format!(
            "Failed to read directory {}: {}",
            path.display(),
            e
        ))
    })?;
    
    // Convert entries to FileInfo
    let mut files = Vec::new();
    while let Some(entry) = entries.next_entry().await.map_err(|e| {
        AppError::FileSystemError(format!(
            "Failed to read directory entry: {}",
            e
        ))
    })? {
        let path = entry.path();
        let name = path.file_name()
            .map(|n| n.to_string_lossy().to_string())
            .unwrap_or_default();
            
        let metadata = entry.metadata().await.map_err(|e| {
            AppError::FileSystemError(format!(
                "Failed to read metadata for {}: {}",
                path.display(),
                e
            ))
        })?;
        
        let file_info = FileInfo {
            path: path.to_string_lossy().to_string(),
            name,
            is_dir: metadata.is_dir(),
            size: Some(metadata.len()),
            modified_at: metadata.modified()
                .ok()
                .and_then(|t| t.duration_since(std::time::UNIX_EPOCH)
                    .map(|d| d.as_millis() as i64)
                    .ok()),
        };
        
        files.push(file_info);
    }
    
    Ok(files)
    // The lock is automatically released when _guard goes out of scope
}

/// Check if a file is a binary file based on extension (async version)
pub async fn is_binary_file(path: impl AsRef<Path>) -> bool {
    let path = path.as_ref();
    
    // Check if the file has a binary extension
    if let Some(extension) = path.extension() {
        let ext = extension.to_string_lossy().to_lowercase();
        if BINARY_EXTENSIONS.contains(ext.as_str()) {
            return true;
        }
    }
    
    // For content check, we need to read the file, so let's lock it
    if let Ok(lock_manager) = get_global_file_lock_manager().await {
        // Attempt to get a read lock, but don't fail if we can't
        if let Ok(_guard) = lock_manager.acquire(path, LockMode::Read).await {
            // Check for binary content (read a small chunk and check for null bytes)
            if let Ok(mut file) = fs::File::open(path).await {
                let mut buffer = [0u8; 1024];
                if let Ok(n) = file.read(&mut buffer).await {
                    for i in 0..n {
                        if buffer[i] == 0 {
                            return true;
                        }
                    }
                }
            }
            // The lock is automatically released when _guard goes out of scope
        }
    }
    
    false
}

/// Get the file size (async version)
pub async fn get_file_size(path: impl AsRef<Path>) -> AppResult<u64> {
    let path = path.as_ref();
    
    // Check if the file exists
    if !file_exists(path).await {
        return Err(AppError::FileSystemError(format!(
            "File does not exist: {}",
            path.display()
        )));
    }
    
    // Acquire a read lock
    let lock_manager = get_global_file_lock_manager().await?;
    let _guard = lock_manager.acquire(path, LockMode::Read).await?;
    
    // Get the metadata
    let metadata = fs::metadata(path).await.map_err(|e| {
        AppError::FileSystemError(format!(
            "Failed to read metadata for {}: {}",
            path.display(),
            e
        ))
    })?;
    
    Ok(metadata.len())
    // The lock is automatically released when _guard goes out of scope
}

/// Remove a file from the filesystem with proper locking
pub async fn remove_file(path: impl AsRef<Path>) -> AppResult<()> {
    let path = path.as_ref();
    
    // Check if the file exists
    if !file_exists(path).await {
        return Ok(());  // File doesn't exist, no need to remove it (idempotent)
    }
    
    // Check if the path is a directory
    let metadata = fs::metadata(path).await
        .map_err(|e| AppError::FileSystemError(format!(
            "Failed to get metadata for {}: {}",
            path.display(),
            e
        )))?;
        
    if metadata.is_dir() {
        return Err(AppError::FileSystemError(format!(
            "Path is a directory, not a file: {}",
            path.display()
        )));
    }
    
    // Acquire a write lock
    let lock_manager = get_global_file_lock_manager().await?;
    let _guard = lock_manager.acquire(path, LockMode::Write).await?;
    
    // Remove the file
    fs::remove_file(path).await
        .map_err(|e| AppError::FileSystemError(format!(
            "Failed to remove file {}: {}",
            path.display(),
            e
        )))
}

/// Move a file or directory from source to destination.
/// This function will handle file locking, overwrite handling, and directory creation.
pub async fn move_item(source_path: &Path, dest_path: &Path, overwrite: bool) -> AppResult<()> {
    // Check if source_path exists
    if !path_exists(source_path).await? {
        return Err(AppError::NotFoundError(format!(
            "Source path does not exist: {}",
            source_path.display()
        )));
    }
    
    // Acquire a write lock on the source path
    let lock_manager = get_global_file_lock_manager().await?;
    let _source_guard = FileLockManager::acquire(lock_manager.clone(), source_path, LockMode::Write).await?;
    
    // Determine the target lock path - if the destination exists, lock it directly
    // otherwise lock its parent directory
    let dest_lock_path = if path_exists(dest_path).await? {
        dest_path.to_path_buf()
    } else if let Some(parent) = dest_path.parent() {
        // Ensure parent directory exists
        if !path_exists(parent).await? {
            fs::create_dir_all(parent).await.map_err(|e| {
                AppError::FileSystemError(format!(
                    "Failed to create parent directory {}: {}",
                    parent.display(),
                    e
                ))
            })?;
        }
        parent.to_path_buf()
    } else {
        return Err(AppError::FileSystemError(format!(
            "Invalid destination path: {}",
            dest_path.display()
        )));
    };
    
    // Acquire a write lock on the destination path or its parent - clone lock_manager again
    // because we need to use it after this call
    let _dest_guard = FileLockManager::acquire(lock_manager.clone(), &dest_lock_path, LockMode::Write).await?;
    
    // Check if destination exists and handle according to overwrite flag
    if path_exists(dest_path).await? {
        if !overwrite {
            return Err(AppError::FileSystemError(
                "Destination path already exists and overwrite is not specified".to_string()
            ));
        }
        
        // Get destination metadata to determine if it's a file or directory
        let dest_metadata = fs::metadata(dest_path).await.map_err(|e| {
            AppError::FileSystemError(format!(
                "Failed to read metadata for {}: {}",
                dest_path.display(),
                e
            ))
        })?;
        
        // Remove the destination based on its type
        if dest_metadata.is_dir() {
            fs::remove_dir_all(dest_path).await.map_err(|e| {
                AppError::FileSystemError(format!(
                    "Failed to remove existing directory {}: {}",
                    dest_path.display(),
                    e
                ))
            })?;
        } else {
            fs::remove_file(dest_path).await.map_err(|e| {
                AppError::FileSystemError(format!(
                    "Failed to remove existing file {}: {}",
                    dest_path.display(),
                    e
                ))
            })?;
        }
    }
    
    // Ensure the parent directory of dest_path exists
    if let Some(parent) = dest_path.parent() {
        fs::create_dir_all(parent).await.map_err(|e| {
            AppError::FileSystemError(format!(
                "Failed to create parent directory {}: {}",
                parent.display(),
                e
            ))
        })?;
    }
    
    // Perform the move operation
    fs::rename(source_path, dest_path).await.map_err(|e| {
        AppError::FileSystemError(format!(
            "Failed to move from {} to {}: {}",
            source_path.display(),
            dest_path.display(),
            e
        ))
    })?;
    
    Ok(())
    // Both locks are automatically released when _source_guard and _dest_guard go out of scope
}

/// Get the user's home directory (sync version is fine as it's just a local lookup)
pub fn get_home_directory() -> AppResult<String> {
    match dirs::home_dir() {
        Some(path) => {
            let normalized_path = path_utils::normalize_path(&path);
            Ok(normalized_path.to_string_lossy().to_string())
        },
        None => Err(AppError::FileSystemError("Could not determine home directory".to_string()))
    }
}

/// Get the application temporary directory, creating it if it doesn't exist
pub async fn get_app_temp_dir() -> AppResult<PathBuf> {
    // Get the system's temporary directory
    let sys_temp_dir = std::env::temp_dir();
    
    // Append app-specific subdirectory
    let app_temp_dir = sys_temp_dir.join(crate::constants::APP_TEMP_SUBDIR_NAME);
    
    // Create the directory if it doesn't exist
    fs::create_dir_all(&app_temp_dir).await
        .map_err(|e| AppError::FileSystemError(format!(
            "Failed to create application temp directory {}: {}",
            app_temp_dir.display(),
            e
        )))?;
    
    info!("Application temp directory: {}", app_temp_dir.display());
    Ok(app_temp_dir)
}

/// Ensure that a target path is within a project directory
/// This is an important security check to prevent operations outside the authorized area
/// (sync version is fine as it's just path manipulation)
pub fn ensure_path_within_project(project_dir: &Path, target_path: &Path) -> AppResult<()> {
    // Get canonical project root
    let project_root_canonical = project_dir.canonicalize().map_err(|e| {
        AppError::SecurityError(format!("Invalid project directory {}: {}", project_dir.display(), e))
    })?;

    // Resolve target to an absolute path (either it is, or join with canonical root)
    let target_absolute = if target_path.is_absolute() {
        target_path.to_path_buf()
    } else {
        project_root_canonical.join(target_path)
    };

    // Try to canonicalize this absolute target
    let target_canonical = target_absolute.canonicalize();

    match target_canonical {
        Ok(canonical_path) => {
            // Path exists - check if it's within project bounds
            if !canonical_path.starts_with(&project_root_canonical) {
                Err(AppError::SecurityError(format!(
                    "Path is outside project directory: {} (resolved to {})",
                    target_path.display(),
                    canonical_path.display()
                )))
            } else {
                Ok(())
            }
        }
        Err(_) => {
            // Canonicalization failed (path might not exist)
            // Check if the *intended* absolute path is within the project root
            // This requires normalizing `target_absolute` to resolve `..` without filesystem access.
            let mut components = Vec::new();
            for component in target_absolute.components() {
                match component {
                    Component::ParentDir => {
                        if !components.pop().is_some() {
                            // Attempting to `..` above the starting point of this relative path part.
                            // If target_absolute was formed from project_root_canonical.join(relative_part),
                            // this implies trying to go above project_root_canonical.
                            return Err(AppError::SecurityError(format!(
                                "Invalid path (attempts to go above root): {}",
                                target_path.display()
                            )));
                        }
                    }
                    Component::Normal(c) => components.push(c),
                    Component::CurDir => {
                        // Skip current directory components
                    }
                    Component::Prefix(_) | Component::RootDir => {
                        // For absolute paths, these are expected at the start
                        // For relative paths joined to canonical root, these shouldn't appear
                        // We handle this by reconstructing the path properly below
                    }
                }
            }
            
            // Reconstruct the absolute path based on the components resolved
            let final_check_path = if target_path.is_absolute() {
                // For absolute paths, we need to reconstruct from the root
                // Extract the root components and rebuild
                let mut rebuilt_path = PathBuf::new();
                for component in target_absolute.components() {
                    match component {
                        Component::Prefix(prefix) => rebuilt_path.push(prefix.as_os_str()),
                        Component::RootDir => rebuilt_path.push("/"),
                        Component::Normal(_) | Component::ParentDir | Component::CurDir => break,
                    }
                }
                // Add the manually normalized components
                for component in components {
                    rebuilt_path.push(component);
                }
                rebuilt_path
            } else {
                // If target_path was relative, components are relative to project_root_canonical
                project_root_canonical.join(components.iter().collect::<PathBuf>())
            };

            if !final_check_path.starts_with(&project_root_canonical) {
                Err(AppError::SecurityError(format!(
                    "Path is outside project directory (non-existent path check): {}",
                    target_path.display()
                )))
            } else {
                Ok(())
            }
        }
    }
}

/// Recursively read a directory with filtering, skipping excluded directories
/// and binary files. Returns absolute paths of non-binary, non-excluded files. (async version)
#[async_recursion]
pub async fn read_directory_recursive_filtered(
    dir_path: &Path, 
    project_root: &Path, 
    excluded_dirs_set: &std::collections::HashSet<&str>
) -> AppResult<Vec<PathBuf>> {
    // Security check: ensure directory is within project
    ensure_path_within_project(project_root, dir_path)?;
    
    // Acquire a read lock on the directory
    let lock_manager = get_global_file_lock_manager().await?;
    let _guard = lock_manager.acquire(dir_path, LockMode::Read).await?;
    
    let mut results = Vec::new();
    
    // Read directory entries
    let mut entries = match fs::read_dir(dir_path).await {
        Ok(entries) => entries,
        Err(e) => {
            return Err(AppError::FileSystemError(format!(
                "Failed to read directory {}: {}",
                dir_path.display(),
                e
            )));
        }
    };
    
    // Process each entry
    while let Some(entry_result) = entries.next_entry().await.map_err(|e| {
        AppError::FileSystemError(format!(
            "Failed to read directory entries: {}",
            e
        ))
    })? {
        let path = entry_result.path();
        
        let metadata = entry_result.metadata().await.map_err(|e| {
            AppError::FileSystemError(format!(
                "Failed to read metadata for {}: {}",
                path.display(),
                e
            ))
        })?;
        
        if metadata.is_dir() {
            // Get the directory name
            let dir_name = match path.file_name() {
                Some(name) => name.to_string_lossy().to_string(),
                None => continue,
            };
            
            // Skip if directory name is in excluded set
            if excluded_dirs_set.contains(dir_name.as_str()) {
                log::debug!("Skipping excluded directory: {}", dir_name);
                continue;
            }
            
            // Recursively scan subdirectory
            // Box the recursive call to avoid stack overflow with deep recursion
            match Box::pin(read_directory_recursive_filtered(&path, project_root, excluded_dirs_set)).await {
                Ok(mut sub_results) => {
                    results.append(&mut sub_results);
                },
                Err(e) => {
                    log::warn!("Error scanning subdirectory {}: {}", path.display(), e);
                    continue;
                }
            }
        } else if metadata.is_file() {
            // Skip binary files
            if !is_binary_file(&path).await {
                results.push(path);
            } else {
                log::debug!("Skipping binary file: {}", path.display());
            }
        }
    }
    
    Ok(results)
    // The lock is automatically released when _guard goes out of scope
}