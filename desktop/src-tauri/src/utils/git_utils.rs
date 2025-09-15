#[cfg(not(any(target_os = "android", target_os = "ios")))]
use git2::{Repository, Status, StatusOptions};
use log::{debug, error, info};
use std::path::{Path, PathBuf};

use crate::error::{AppError, AppResult};

/// Check if a directory is a git repository
pub fn is_git_repository(path: impl AsRef<Path>) -> bool {
    #[cfg(not(any(target_os = "android", target_os = "ios")))]
    {
        Repository::open(path.as_ref()).is_ok()
    }
    #[cfg(any(target_os = "android", target_os = "ios"))]
    {
        false
    }
}

/// Get the git repository for a path
#[cfg(not(any(target_os = "android", target_os = "ios")))]
pub fn get_repository(path: impl AsRef<Path>) -> AppResult<Repository> {
    Repository::open(path.as_ref()).map_err(|e| AppError::GitError(e.to_string()))
}

#[cfg(any(target_os = "android", target_os = "ios"))]
pub fn get_repository(_path: impl AsRef<Path>) -> AppResult<()> {
    Err(AppError::GitError("Git operations not supported on mobile".to_string()))
}

/// Get all non-ignored files in a git repository using git command (fast approach)
/// Returns paths relative to the repository root and a boolean indicating if it's a git repo
///
/// This uses the same efficient approach as the frontend: `git ls-files --cached --others --exclude-standard`
pub fn get_all_non_ignored_files(path: impl AsRef<Path>) -> AppResult<(Vec<PathBuf>, bool)> {
    #[cfg(any(target_os = "android", target_os = "ios"))]
    {
        // Return empty list for mobile platforms
        Ok((Vec::new(), false))
    }
    
    #[cfg(not(any(target_os = "android", target_os = "ios")))]
    {
        let path = path.as_ref();

        // First check if this is a git repository
        if !is_git_repository(path) {
            debug!("Path {} is not a git repository", path.display());
            return Ok((Vec::new(), false));
        }

        // Use git command to get tracked and untracked files (excluding ignored ones)
        // This matches the frontend approach: git ls-files --cached --others --exclude-standard
        #[cfg(target_os = "windows")]
        let output = {
            use std::os::windows::process::CommandExt;
            const CREATE_NO_WINDOW: u32 = 0x08000000;
            
            std::process::Command::new("git")
                .args(&["ls-files", "--cached", "--others", "--exclude-standard"])
                .current_dir(path)
                .creation_flags(CREATE_NO_WINDOW)
                .output()
        };
        
        #[cfg(not(target_os = "windows"))]
        let output = std::process::Command::new("git")
            .args(&["ls-files", "--cached", "--others", "--exclude-standard"])
            .current_dir(path)
            .output();

        match output {
            Ok(output) => {
                if !output.status.success() {
                    let stderr = String::from_utf8_lossy(&output.stderr);
                    error!("Git command failed: {}", stderr);
                    return Err(AppError::GitError(format!("Git command failed: {}", stderr)));
                }

                let stdout = String::from_utf8_lossy(&output.stdout);
                let files: Vec<PathBuf> = stdout
                    .lines()
                    .filter(|line| !line.is_empty())
                    .map(PathBuf::from)
                    .collect();

                info!(
                    "Git ls-files found {} files in {}",
                    files.len(),
                    path.display()
                );
                Ok((files, true))
            }
            Err(e) => {
                error!("Failed to execute git command: {}", e);
                
                // Fall back to using git2 library
                info!("Falling back to git2 library approach");
                get_all_non_ignored_files_with_git2(path)
            }
        }
    }
}

/// Fallback implementation using git2 library (slower but more reliable)
#[cfg(not(any(target_os = "android", target_os = "ios")))]
fn get_all_non_ignored_files_with_git2(path: impl AsRef<Path>) -> AppResult<(Vec<PathBuf>, bool)> {
    let path = path.as_ref();
    let repo = match Repository::open(path) {
        Ok(r) => r,
        Err(e) => {
            debug!("Failed to open git repository at {}: {}", path.display(), e);
            return Ok((Vec::new(), false));
        }
    };

    let mut files = Vec::new();

    // Get repository root for relative path calculation
    let repo_root = match repo.workdir() {
        Some(root) => root,
        None => {
            return Err(AppError::GitError(
                "Repository has no working directory".to_string(),
            ));
        }
    };

    // Configure status options to include untracked files
    let mut status_opts = StatusOptions::new();
    status_opts
        .include_untracked(true)
        .recurse_untracked_dirs(true)
        .include_ignored(false);

    // Get the status of all files
    let statuses = repo
        .statuses(Some(&mut status_opts))
        .map_err(|e| AppError::GitError(e.to_string()))?;

    // Process each status entry
    for entry in statuses.iter() {
        let status = entry.status();

        // Skip ignored files
        if status.contains(Status::IGNORED) {
            continue;
        }

        // Include the file if it's:
        // - Tracked (in index or HEAD)
        // - Modified
        // - New (untracked but not ignored)
        if status.intersects(
            Status::INDEX_NEW
                | Status::INDEX_MODIFIED
                | Status::INDEX_DELETED
                | Status::INDEX_RENAMED
                | Status::INDEX_TYPECHANGE
                | Status::WT_NEW
                | Status::WT_MODIFIED
                | Status::WT_DELETED
                | Status::WT_TYPECHANGE
                | Status::WT_RENAMED
                | Status::CURRENT,
        ) || (!status.contains(Status::IGNORED) && !status.is_empty())
        {
            if let Some(file_path) = entry.path() {
                files.push(PathBuf::from(file_path));
            }
        }
    }

    info!(
        "Git status found {} non-ignored files in {}",
        files.len(),
        path.display()
    );
    Ok((files, true))
}

/// Get the current git branch name
pub fn get_current_branch(path: impl AsRef<Path>) -> AppResult<String> {
    #[cfg(any(target_os = "android", target_os = "ios"))]
    {
        Err(AppError::GitError("Git operations not supported on mobile".to_string()))
    }
    
    #[cfg(not(any(target_os = "android", target_os = "ios")))]
    {
        let repo = Repository::open(path.as_ref()).map_err(|e| AppError::GitError(e.to_string()))?;

        let head = repo.head().map_err(|e| AppError::GitError(e.to_string()))?;

        if let Some(name) = head.shorthand() {
            Ok(name.to_string())
        } else {
            Err(AppError::GitError("Failed to get branch name".to_string()))
        }
    }
}

/// Helper function to get repository root for a given path
pub fn get_repository_root(path: impl AsRef<Path>) -> AppResult<PathBuf> {
    #[cfg(any(target_os = "android", target_os = "ios"))]
    {
        Err(AppError::GitError("Git operations not supported on mobile".to_string()))
    }
    
    #[cfg(not(any(target_os = "android", target_os = "ios")))]
    {
        let repo = Repository::open(path.as_ref()).map_err(|e| AppError::GitError(e.to_string()))?;

        repo.workdir()
            .map(|p| p.to_path_buf())
            .ok_or_else(|| {
                AppError::GitError(
                    "Repository has no working directory".to_string(),
                )
            })
    }
}

/// Helper to get relative path from repository root
pub fn get_relative_path_from_repo(
    repo_path: impl AsRef<Path>,
    file_path: impl AsRef<Path>,
) -> AppResult<PathBuf> {
    #[cfg(any(target_os = "android", target_os = "ios"))]
    {
        Err(AppError::GitError("Git operations not supported on mobile".to_string()))
    }
    
    #[cfg(not(any(target_os = "android", target_os = "ios")))]
    {
        let repo = Repository::open(repo_path.as_ref()).map_err(|e| AppError::GitError(e.to_string()))?;

        let repo_root = repo.workdir().ok_or_else(|| {
            AppError::GitError(
                "Repository has no working directory".to_string(),
            )
        })?;

        file_path
            .as_ref()
            .strip_prefix(repo_root)
            .map(|p| p.to_path_buf())
            .map_err(|_| {
                AppError::GitError(
                    "Failed to get relative path".to_string(),
                )
            })
    }
}

/// Check if a path is ignored by git
pub fn is_ignored(repo_path: impl AsRef<Path>, file_path: impl AsRef<Path>) -> bool {
    #[cfg(any(target_os = "android", target_os = "ios"))]
    {
        false
    }
    
    #[cfg(not(any(target_os = "android", target_os = "ios")))]
    {
        match Repository::open(repo_path.as_ref()) {
            Ok(repo) => {
                let relative_path = match get_relative_path_from_repo(repo_path, &file_path) {
                    Ok(p) => p,
                    Err(_) => return false,
                };

                repo.is_path_ignored(&relative_path).unwrap_or(false)
            }
            Err(_) => false,
        }
    }
}