use std::path::{Path, PathBuf};
use git2::{Repository, StatusOptions, Status};
use log::{info, error, debug};

use crate::error::{AppError, AppResult};

/// Check if a directory is a git repository
pub fn is_git_repository(path: impl AsRef<Path>) -> bool {
    Repository::open(path.as_ref()).is_ok()
}

/// Get the git repository for a path
pub fn get_repository(path: impl AsRef<Path>) -> AppResult<Repository> {
    Repository::open(path.as_ref()).map_err(|e| {
        AppError::GitError(e.to_string())
    })
}

/// Get all non-ignored files in a git repository using git command (fast approach)
/// Returns paths relative to the repository root and a boolean indicating if it's a git repo
///
/// This uses the same efficient approach as the frontend: `git ls-files --cached --others --exclude-standard`
pub fn get_all_non_ignored_files(path: impl AsRef<Path>) -> AppResult<(Vec<PathBuf>, bool)> {
    let path = path.as_ref();
    
    // First check if this is a git repository
    if !is_git_repository(path) {
        debug!("Path {} is not a git repository", path.display());
        return Ok((Vec::new(), false));
    }
    
    // Use git command to get tracked and untracked files (excluding ignored ones)
    // This matches the frontend approach: git ls-files --cached --others --exclude-standard
    let output = std::process::Command::new("git")
        .args(&["ls-files", "--cached", "--others", "--exclude-standard"])
        .current_dir(path)
        .output();
    
    match output {
        Ok(output) => {
            if output.status.success() {
                let stdout = String::from_utf8_lossy(&output.stdout);
                let files: Vec<PathBuf> = stdout
                    .lines()
                    .filter(|line| !line.trim().is_empty())
                    .map(|line| PathBuf::from(line.trim()))
                    .collect();
                
                debug!("Found {} non-ignored files in git repository at {} using git ls-files", files.len(), path.display());
                Ok((files, true))
            } else {
                let stderr = String::from_utf8_lossy(&output.stderr);
                error!("Git ls-files command failed: {}", stderr);
                // Fall back to git2 library approach
                get_all_non_ignored_files_fallback(path)
            }
        }
        Err(e) => {
            error!("Failed to execute git command: {}", e);
            // Fall back to git2 library approach
            get_all_non_ignored_files_fallback(path)
        }
    }
}

/// Fallback method using git2 library (slower but more reliable)
fn get_all_non_ignored_files_fallback(path: &Path) -> AppResult<(Vec<PathBuf>, bool)> {
    let repo = match get_repository(path) {
        Ok(r) => r,
        Err(e) => {
            debug!("Failed to open git repository at {}: {}", path.display(), e);
            return Ok((Vec::new(), false));
        }
    };
    
    let mut files = Vec::new();
    
    // Get all tracked files from the index
    let index = match repo.index() {
        Ok(i) => i,
        Err(e) => {
            debug!("Failed to get git index at {}: {}", path.display(), e);
            return Ok((Vec::new(), true)); // Still a git repo, but couldn't get index
        }
    };
    
    // Add all tracked files from the index
    for entry in index.iter() {
        let path_str = std::str::from_utf8(&entry.path).unwrap_or("");
        if !path_str.is_empty() {
            let relative_path = PathBuf::from(path_str);
            files.push(relative_path);
        }
    }
    
    // Also get untracked files that are not ignored
    let mut status_opts = StatusOptions::new();
    status_opts
        .include_ignored(false)
        .include_untracked(true)
        .recurse_untracked_dirs(true);
        
    if let Ok(statuses) = repo.statuses(Some(&mut status_opts)) {
        for entry in statuses.iter() {
            // Only include untracked files (not already in index)
            if entry.status().contains(Status::WT_NEW) {
                if let Some(path_str) = entry.path() {
                    let relative_path = PathBuf::from(path_str);
                    files.push(relative_path);
                }
            }
        }
    }
    
    debug!("Found {} non-ignored files in git repository at {} using git2 fallback", files.len(), path.display());
    Ok((files, true))
}

/// Get all tracked files in a git repository
pub fn get_all_tracked_files(path: impl AsRef<Path>) -> AppResult<Vec<PathBuf>> {
    let path = path.as_ref();
    let repo = get_repository(path)?;
    
    // Get the repository workdir
    let workdir = repo.workdir().ok_or_else(|| {
        AppError::GitError(git2::Error::from_str("Repository has no working directory").to_string())
    })?;
    
    // Create status options
    let mut status_opts = StatusOptions::new();
    status_opts
        .include_ignored(false)
        .include_untracked(false);
        
    // Get the status
    let statuses = repo.statuses(Some(&mut status_opts)).map_err(|e| {
        AppError::GitError(e.to_string())
    })?;
    
    // Collect the file paths
    let mut files = Vec::new();
    for entry in statuses.iter() {
        // Skip untracked files
        if entry.status().contains(Status::WT_NEW) {
            continue;
        }
        
        if let Some(path_str) = entry.path() {
            let file_path = workdir.join(path_str);
            files.push(file_path);
        }
    }
    
    Ok(files)
}

/// Check if a file is ignored by git
pub fn is_ignored(repo: &Repository, path: impl AsRef<Path>) -> AppResult<bool> {
    let path = path.as_ref();
    
    // Get the repository workdir
    let workdir = repo.workdir().ok_or_else(|| {
        AppError::GitError(git2::Error::from_str("Repository has no working directory").to_string())
    })?;
    
    // Make the path relative to the repository
    let relative_path = if path.starts_with(workdir) {
        if let Ok(rel) = path.strip_prefix(workdir) {
            rel.to_path_buf()
        } else {
            return Err(AppError::GitError(git2::Error::from_str("Failed to get relative path").to_string()));
        }
    } else {
        return Err(AppError::GitError(git2::Error::from_str("Path is not in repository").to_string()));
    };
    
    // Check if the file is ignored
    repo.is_path_ignored(&relative_path).map_err(|e| {
        AppError::GitError(e.to_string())
    })
}

/// Get the git branch name
pub fn get_branch_name(path: impl AsRef<Path>) -> AppResult<String> {
    let repo = get_repository(path)?;
    
    // Get the HEAD reference
    let head = repo.head().map_err(|e| {
        AppError::GitError(e.to_string())
    })?;
    
    // Get the branch name
    let branch_name = head.shorthand().ok_or_else(|| {
        AppError::GitError(git2::Error::from_str("Failed to get branch name").to_string())
    })?;
    
    Ok(branch_name.to_string())
}