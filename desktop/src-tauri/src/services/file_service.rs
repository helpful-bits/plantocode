use std::path::PathBuf;
use log::{info, debug, warn};
use glob::Pattern;
use serde::{Serialize, Deserialize};

use crate::error::{AppResult, AppError};
use crate::utils::path_utils;
use crate::utils::fs_utils;
use crate::models::ListFilesResponse;
use crate::utils::git_utils;

/// Arguments struct for list_files_with_options function, mirroring ListFilesRequestArgs
#[derive(Debug, Deserialize)]
pub struct ListFilesArgs {
    pub directory: String,
    pub pattern: Option<String>,
    pub include_stats: Option<bool>,
    pub exclude: Option<Vec<String>>,
}

/// Core file listing implementation, extracted from commands.rs
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
    
    // Try to use git to list files, using enhanced function that returns git repo status
    match git_utils::get_all_non_ignored_files(&directory) {
        Ok((git_files, is_git_repo)) => {
            if is_git_repo {
                debug!("Using git to list files in repository: {}", directory.display());
                
                // Store the total count before filtering
                total_found_before_filtering = Some(git_files.len());
                
                // Filter and process files
                let mut relative_paths = Vec::new();
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
                    
                    // For git paths, we're already dealing with relative paths
                    // Just normalize them
                    let normalized_path = relative_path.to_string_lossy().to_string();
                    relative_paths.push(normalized_path);
                }
                
                // Store the filtered paths
                files = relative_paths;
            } else {
                debug!("Directory is not a git repository, using filesystem operations: {}", directory.display());
                // Not a git repository, use filesystem operations
                warning = Some("Directory is not a git repository. Using filesystem operations.".to_string());
                
                // Use pattern for file operations, default to "**/*" if not provided
                let pattern = args.pattern.clone().unwrap_or_else(|| "**/*".to_string());
                
                // Clone variables needed for the closure
                let directory_clone = directory.clone();
                let pattern_clone = pattern.clone();
                
                // Use spawn_blocking for the synchronous glob operation
                match tokio::task::spawn_blocking(move || {
                    path_utils::find_files(&directory_clone, &pattern_clone, None)
                }).await.map_err(|e| AppError::FileSystemError(format!("Failed to execute find_files task: {}", e))) {
                    Ok(found_files_res) => {
                        let files_vec = found_files_res?;
                        total_found_before_filtering = Some(files_vec.len());
                        
                        // Filter out binary files and apply exclude patterns
                        let mut filtered_files = Vec::new();
                        for path in &files_vec {
                            // Skip binary files
                            if fs_utils::is_binary_file(path).await {
                                continue;
                            }
                            
                            // Apply exclude patterns if provided
                            if let Some(ref exclude_patterns) = args.exclude {
                                let mut exclude = false;
                                for pattern in exclude_patterns {
                                    if let Ok(glob_pattern) = Pattern::new(pattern) {
                                        if glob_pattern.matches_path(path) {
                                            exclude = true;
                                            break;
                                        }
                                    }
                                }
                                if exclude {
                                    continue;
                                }
                            }
                            
                            filtered_files.push(path.clone());
                        }
                        
                        // Convert to string paths
                        files = filtered_files
                            .into_iter()
                            .map(|p| path_utils::normalize_path(&p).to_string_lossy().to_string())
                            .collect();
                    },
                    Err(e) => {
                        return Err(AppError::FileSystemError(format!("Failed to find files matching pattern: {}", e)));
                    }
                }
            }
        },
        Err(e) => {
            warning = Some(format!("Failed to use git to list files: {}. Falling back to filesystem operations.", e));
            
            // Create a HashSet of excluded directory names from constants
            let excluded_dirs_set: std::collections::HashSet<&str> = crate::constants::EXCLUDED_DIRS_FOR_SCAN.iter().copied().collect();
            
            // Use read_directory_recursive_filtered for more robust filtering
            match fs_utils::read_directory_recursive_filtered(&directory, &directory, &excluded_dirs_set).await {
                Ok(all_files) => {
                    total_found_before_filtering = Some(all_files.len());
                    
                    // Apply pattern filtering (glob) if provided and not a default match all pattern
                    let pattern = args.pattern.clone().unwrap_or_else(|| "**/*".to_string());
                    
                    // Filter files by pattern and exclude rules
                    let mut filtered_files = Vec::new();
                    for file_path in all_files {
                        // Make path relative to directory for glob pattern matching
                        let relative_path = match path_utils::make_relative_to(&file_path, &directory) {
                            Ok(rel_path) => rel_path,
                            Err(_) => continue, // Skip files we can't make relative
                        };
                        
                        // Apply pattern filtering
                        if pattern != "**/*" {
                            if let Ok(glob_pattern) = Pattern::new(&pattern) {
                                if !glob_pattern.matches_path(&relative_path) {
                                    continue;
                                }
                            }
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
                        
                        filtered_files.push(file_path);
                    }
                    
                    // Convert the filtered files to relative paths
                    files = filtered_files.into_iter()
                        .filter_map(|path| {
                            // Convert each path to be relative to directory
                            match path_utils::make_relative_to(&path, &directory) {
                                Ok(rel_path) => Some(rel_path.to_string_lossy().to_string()),
                                Err(_) => None, // Skip paths that can't be made relative
                            }
                        })
                        .collect();
                },
                Err(e) => {
                    return Err(AppError::FileSystemError(format!("Failed to read directory: {}", e)));
                }
            }
        }
    }
    
    // Prepare the response
    let mut response = ListFilesResponse {
        files,
        stats: None,
        warning,
        total_found_before_filtering,
    };
    
    // Add file stats if requested
    if args.include_stats.unwrap_or(false) {
        let mut stats = Vec::new();
        
        for file_rel_path in &response.files {
            // Create absolute path for accessing file metadata
            let abs_path = path_utils::join_paths(&directory, file_rel_path);
            
            if let Ok(metadata) = std::fs::metadata(&abs_path) {
                let modified_ms = metadata.modified()
                    .ok()
                    .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
                    .map(|d| d.as_millis() as i64)
                    .unwrap_or(0);
                    
                let created_ms = metadata.created()
                    .ok()
                    .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
                    .map(|d| d.as_millis() as i64);
                    
                let accessed_ms = metadata.accessed()
                    .ok()
                    .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
                    .map(|d| d.as_millis() as i64);
                
                // Use the relative path in the stats
                let stat_info = crate::models::FileStatInfo {
                    path: file_rel_path.clone(),
                    size: metadata.len(),
                    modified_ms,
                    created_ms,
                    accessed_ms,
                };
                
                stats.push(stat_info);
            }
        }
        
        response.stats = Some(stats);
    }
    
    Ok(response)
}