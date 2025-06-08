use std::path::PathBuf;
use log::{info, debug, warn};
use glob::Pattern;
use serde::{Serialize, Deserialize};

use crate::error::{AppResult, AppError};
use crate::utils::path_utils;
use crate::utils::fs_utils;
use crate::models::{ListFilesResponse, NativeFileInfoRs};
use crate::utils::git_utils;

/// Helper function to create NativeFileInfoRs from a file path
async fn create_file_info(absolute_path: &std::path::PathBuf, relative_path: &std::path::PathBuf, include_stats: bool) -> AppResult<NativeFileInfoRs> {
    let file_name = relative_path.file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_else(|| relative_path.to_string_lossy().to_string());
    
    let relative_path_str = relative_path.to_string_lossy().to_string();
    
    // Get basic file info
    let metadata = std::fs::metadata(absolute_path)
        .map_err(|e| AppError::FileSystemError(format!("Failed to get metadata for {}: {}", absolute_path.display(), e)))?;
    
    let is_dir = metadata.is_dir();
    let is_file = metadata.is_file();
    let is_symlink = metadata.file_type().is_symlink();
    
    // Get optional stats if requested
    let (size, created_at, modified_at, accessed_at) = if include_stats {
        let size = if is_file { Some(metadata.len()) } else { None };
        
        let created_at = metadata.created()
            .ok()
            .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
            .map(|d| d.as_millis() as i64);
            
        let modified_at = metadata.modified()
            .ok()
            .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
            .map(|d| d.as_millis() as i64);
            
        let accessed_at = metadata.accessed()
            .ok()
            .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
            .map(|d| d.as_millis() as i64);
        
        (size, created_at, modified_at, accessed_at)
    } else {
        (None, None, None, None)
    };
    
    // Platform-specific hidden file detection
    let is_hidden = Some(file_name.starts_with('.'));
    
    // Check permissions if stats are requested
    let (is_readable, is_writable) = if include_stats {
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            let perms = metadata.permissions();
            let mode = perms.mode();
            let readable = (mode & 0o400) != 0; // Owner read permission
            let writable = (mode & 0o200) != 0; // Owner write permission
            (Some(readable), Some(writable))
        }
        #[cfg(not(unix))]
        {
            // On Windows, use basic permission check
            let readable = !metadata.permissions().readonly();
            (Some(readable), Some(!metadata.permissions().readonly()))
        }
    } else {
        (None, None)
    };
    
    Ok(NativeFileInfoRs {
        path: relative_path_str,
        name: file_name,
        is_dir,
        is_file,
        is_symlink,
        size,
        created_at,
        modified_at,
        accessed_at,
        is_hidden,
        is_readable,
        is_writable,
    })
}

/// Arguments struct for list_files_with_options function, mirroring ListFilesRequestArgs
#[derive(Debug, Deserialize)]
pub struct ListFilesArgs {
    pub directory: String,
    pub pattern: Option<String>,
    pub include_stats: Option<bool>,
    pub exclude: Option<Vec<String>>,
}

/// Shallow directory listing for directory browser (like Finder)
pub async fn list_directories_only(directory_path: &str) -> AppResult<Vec<crate::models::DirectoryInfo>> {
    use std::path::Path;
    use crate::models::DirectoryInfo;
    
    info!("Listing directories only in: {}", directory_path);
    
    // Normalize the input directory path
    let directory = path_utils::normalize_path(directory_path);
    
    // System directory exclusions - don't scan these specific paths
    let system_directory_paths = [
        "/Library", "/System", "/Applications", "/usr", "/var", "/tmp", "/proc", "/dev",
        "/Library/CoreSimulator", "/Library/Devices", "/Library/Trial", 
        "/Library/NamespaceDescriptors", "/Library/factorPackSets",
        "/.Spotlight-V100", "/.DocumentRevisions-V100", "/.fseventsd", "/.Trashes"
    ];
    
    // Check if we're trying to scan a system directory (exact path match)
    let dir_str = directory.to_string_lossy();
    for system_path in &system_directory_paths {
        if dir_str == *system_path || dir_str.starts_with(&format!("{}/", system_path)) {
            debug!("Refusing to scan system directory: {}", dir_str);
            return Ok(Vec::new());
        }
    }
    
    // Check if the directory exists and is accessible
    if !fs_utils::file_exists(&directory).await {
        return Err(AppError::FileSystemError(format!("Directory does not exist: {}", directory.display())));
    }
    
    if !fs_utils::is_directory(&directory).await.map_err(|e| AppError::FileSystemError(e.to_string()))? {
        return Err(AppError::FileSystemError(format!("Path is not a directory: {}", directory.display())));
    }
    
    // Use fs_utils::list_directory to get immediate children only
    let entries = fs_utils::list_directory(&directory).await
        .map_err(|e| AppError::FileSystemError(format!("Failed to list directory: {}", e)))?;
    
    // Filter for directories only and convert to DirectoryInfo
    let mut directories = Vec::new();
    for entry in entries {
        if entry.is_dir {
            // Skip hidden directories except for common ones
            if entry.name.starts_with('.') && 
               !entry.name.ends_with(".gitignore") && 
               !entry.name.ends_with(".env") {
                continue;
            }
            
            // Skip common build/development directories, but not user directories
            let excluded_dirs = [
                "node_modules", ".git", ".next", "dist", "build", "coverage", ".cache",
                "target", "vendor", ".vscode", ".idea", "CoreSimulator", "Devices", "Trial"
            ];
            
            // Only exclude Library, System, Applications if we're at the root level
            let is_root_level = dir_str == "/" || dir_str.starts_with("/Users/") && dir_str.matches('/').count() == 2;
            let is_system_dir = ["Library", "System"].contains(&entry.name.as_str()) && 
                               (dir_str == "/" || !dir_str.starts_with("/Users/"));
            let is_root_applications = entry.name == "Applications" && dir_str == "/";
            
            if excluded_dirs.contains(&entry.name.as_str()) || is_system_dir || is_root_applications {
                continue;
            }
            
            directories.push(DirectoryInfo {
                name: entry.name,
                path: entry.path,
                is_accessible: true, // We assume accessible since we could list it
            });
        }
    }
    
    // Sort directories alphabetically
    directories.sort_by(|a, b| a.name.cmp(&b.name));
    
    debug!("Found {} directories in {}", directories.len(), directory.display());
    Ok(directories)
}

/// Core file listing implementation for project analysis, extracted from commands.rs
pub async fn list_files_with_options(args: ListFilesArgs) -> AppResult<ListFilesResponse> {
    info!("Listing files in directory: {}", args.directory);
    
    // Normalize the input directory path
    let directory = path_utils::normalize_path(&args.directory);
    
    // Check if the directory exists and is accessible
    if !fs_utils::file_exists(&directory).await {
        return Err(AppError::FileSystemError(format!("Directory does not exist: {}", directory.display())));
    }
    
    if !fs_utils::is_directory(&directory).await.map_err(|e| AppError::FileSystemError(e.to_string()))? {
        return Err(AppError::FileSystemError(format!("Path is not a directory: {}", directory.display())));
    }
    
    let mut files = Vec::new();
    let mut warning = None;
    let mut total_found_before_filtering = None;
    
    // Use git-aware file discovery only - no fallbacks
    match git_utils::get_all_non_ignored_files(&directory) {
        Ok((git_files, is_git_repo)) => {
            if !is_git_repo {
                return Err(AppError::FileSystemError("Directory is not a git repository. Only git repositories are supported for file listing.".to_string()));
            }
            
            debug!("Using git to list files in repository: {}", directory.display());
            
            // Store the total count before filtering
            total_found_before_filtering = Some(git_files.len());
            
            // Filter and process files
            for relative_path in git_files {
                let absolute_path = path_utils::join_paths(&directory, &relative_path);
                
                // Filter by pattern if provided and not a default "match all" pattern
                if let Some(ref pattern) = args.pattern {
                    if pattern != "**/*" {
                        let pattern_str = pattern.clone();
                        // Use glob crate to check if the path matches the pattern
                        if let Ok(glob_pattern) = Pattern::new(&pattern_str) {
                            if !glob_pattern.matches_path(&relative_path) {
                                continue;
                            }
                        }
                    }
                }
                
                // Filter out binary files - run asynchronously
                if fs_utils::is_binary_file(&absolute_path).await {
                    continue;
                }
                
                // Apply exclude patterns if provided
                if let Some(ref exclude_patterns) = args.exclude {
                    let mut exclude = false;
                    for pattern in exclude_patterns {
                        if let Ok(glob_pattern) = Pattern::new(pattern) {
                            if glob_pattern.matches_path(&relative_path) {
                                exclude = true;
                                break;
                            }
                        }
                    }
                    if exclude {
                        continue;
                    }
                }
                
                // Create NativeFileInfoRs with file metadata
                let file_info = create_file_info(&absolute_path, &relative_path, args.include_stats.unwrap_or(false)).await;
                if let Ok(info) = file_info {
                    files.push(info);
                }
            }
        },
        Err(e) => {
            return Err(AppError::FileSystemError(format!("Failed to access git repository: {}", e)));
        }
    }
    
    // Prepare the response
    let response = ListFilesResponse {
        files,
        warning,
        total_found_before_filtering,
    };
    
    Ok(response)
}