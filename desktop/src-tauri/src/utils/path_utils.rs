use std::path::{Path, PathBuf};
use std::collections::HashSet;
use std::fs;
use log::{debug, info};
use dirs::config_dir;
use chrono::Local;
use uuid::Uuid;

use crate::error::{AppError, AppResult};
use crate::utils::fs_utils;

/// Normalize a path (sync version)
pub fn normalize_path(path: impl AsRef<Path>) -> PathBuf {
    let path = path.as_ref();
    
    // Convert to absolute path if possible
    if let Ok(absolute) = fs::canonicalize(path) {
        return absolute;
    }
    
    // If canonicalization fails, just return the path as is
    path.to_path_buf()
}

/// Normalize a path (async version)
pub async fn normalize_path_async(path: impl AsRef<Path>) -> AppResult<PathBuf> {
    let path = path.as_ref();
    
    // Convert to absolute path if possible
    match tokio::fs::canonicalize(path).await {
        Ok(absolute) => Ok(absolute),
        Err(e) => {
            debug!("Failed to canonicalize path {}: {}", path.display(), e);
            // If canonicalization fails, just return the path as is
            Ok(path.to_path_buf())
        }
    }
}

/// Check if a path is absolute
pub fn is_absolute_path(path: impl AsRef<Path>) -> bool {
    path.as_ref().is_absolute()
}

/// Get the parent directory of a path
pub fn get_parent_directory(path: impl AsRef<Path>) -> Option<PathBuf> {
    path.as_ref().parent().map(|p| p.to_path_buf())
}

/// Get the file name of a path
pub fn get_file_name(path: impl AsRef<Path>) -> Option<String> {
    path.as_ref().file_name().map(|n| n.to_string_lossy().to_string())
}

/// Get the extension of a path
pub fn get_file_extension(path: impl AsRef<Path>) -> Option<String> {
    path.as_ref().extension().map(|ext| ext.to_string_lossy().to_string())
}

/// Join paths
pub fn join_paths(base: impl AsRef<Path>, path: impl AsRef<Path>) -> PathBuf {
    base.as_ref().join(path.as_ref())
}

/// Make a path relative to a base path
pub fn make_relative_to(path: impl AsRef<Path>, base: impl AsRef<Path>) -> AppResult<PathBuf> {
    let path = path.as_ref();
    let base = base.as_ref();
    
    // Normalize paths
    let path_norm = normalize_path(path);
    let base_norm = normalize_path(base);
    
    // Check if the path is a descendant of the base
    if !path_norm.starts_with(&base_norm) {
        return Err(AppError::ValidationError(format!(
            "Path {} is not a descendant of {}",
            path_norm.display(),
            base_norm.display()
        )));
    }
    
    // Get the relative path
    path_norm.strip_prefix(&base_norm).map(|p| p.to_path_buf()).map_err(|e| {
        AppError::ValidationError(format!(
            "Failed to make path {} relative to {}: {}",
            path_norm.display(),
            base_norm.display(),
            e
        ))
    })
}

/// Check if a path matches any pattern in a list
pub fn matches_any_pattern(path: impl AsRef<Path>, patterns: &[String]) -> bool {
    let path = path.as_ref();
    
    for pattern in patterns {
        let glob_pattern = glob::Pattern::new(pattern).ok();
        
        if let Some(glob) = glob_pattern {
            if glob.matches_path(path) {
                return true;
            }
        }
    }
    
    false
}

/// Check if a string matches a glob pattern
pub fn matches_pattern(text: &str, pattern: &str) -> bool {
    if let Ok(glob_pattern) = glob::Pattern::new(pattern) {
        // For directory patterns that end with /, add a * if needed
        let text_to_check = if pattern.ends_with('/') && !text.ends_with('/') {
            format!("{}/", text)
        } else {
            text.to_string()
        };
        
        // Convert string to a PathBuf for matching
        let path = Path::new(&text_to_check);
        glob_pattern.matches_path(path)
    } else {
        // If pattern is invalid, no match
        false
    }
}

/// Find files matching a pattern in a directory
pub fn find_files(directory: impl AsRef<Path>, pattern: &str, exclude_dirs: Option<&[&str]>) -> AppResult<Vec<PathBuf>> {
    let directory = directory.as_ref();
    
    // Create the glob pattern
    let glob_pattern = format!("{}/{}", directory.display(), pattern);
    
    // Use the glob crate to find files
    let paths = glob::glob(&glob_pattern).map_err(|e| {
        AppError::ValidationError(format!(
            "Invalid glob pattern {}: {}",
            glob_pattern,
            e
        ))
    })?;
    
    // Collect the results
    let mut results = Vec::new();
    for entry in paths {
        match entry {
            Ok(path) => {
                // Check against exclude directories if provided
                if let Some(excluded) = exclude_dirs {
                    let path_str = path.to_string_lossy();
                    let should_exclude = excluded.iter().any(|&excl| path_str.contains(excl));
                    if should_exclude {
                        continue;
                    }
                }
                results.push(path);
            },
            Err(e) => {
                debug!("Error in glob match: {}", e);
            }
        }
    }
    
    Ok(results)
}

/// Check if a path is ignored by gitignore
pub fn is_ignored_by_git(path: impl AsRef<Path>, base_dir: impl AsRef<Path>) -> bool {
    let path = path.as_ref();
    let base_dir = base_dir.as_ref();
    
    // Get the gitignore path
    let gitignore_path = base_dir.join(".gitignore");
    
    // Check if the gitignore file exists
    if !gitignore_path.exists() {
        return false;
    }
    
    // Try to make the path relative to the base directory
    let relative_path = match make_relative_to(path, base_dir) {
        Ok(rel) => rel,
        Err(_) => return false,
    };
    
    // Read the gitignore file
    let gitignore_content = match fs::read_to_string(&gitignore_path) {
        Ok(content) => content,
        Err(_) => return false,
    };
    
    // Parse the gitignore file
    let mut patterns = Vec::new();
    for line in gitignore_content.lines() {
        let line = line.trim();
        
        // Skip empty lines and comments
        if line.is_empty() || line.starts_with('#') {
            continue;
        }
        
        // Add the pattern
        patterns.push(line.to_string());
    }
    
    // Check if the path matches any pattern
    matches_any_pattern(relative_path, &patterns)
}

/// Filter a list of paths by ignoring those matching a list of patterns
pub fn filter_paths_by_patterns(
    paths: &[PathBuf],
    include_patterns: &[String],
    exclude_patterns: &[String],
) -> Vec<PathBuf> {
    let mut result = Vec::new();
    
    for path in paths {
        // Check if the path should be included
        let mut include = include_patterns.is_empty();
        for pattern in include_patterns {
            if let Ok(glob) = glob::Pattern::new(pattern) {
                if glob.matches_path(path) {
                    include = true;
                    break;
                }
            }
        }
        
        // Check if the path should be excluded
        for pattern in exclude_patterns {
            if let Ok(glob) = glob::Pattern::new(pattern) {
                if glob.matches_path(path) {
                    include = false;
                    break;
                }
            }
        }
        
        if include {
            result.push(path.clone());
        }
    }
    
    result
}

/// Get the application's root data directory (async version)
pub async fn get_app_data_root_dir() -> AppResult<PathBuf> {
    if let Some(mut config_dir) = config_dir() {
        config_dir.push("com.vibe-manager.desktop");
        
        // Create the directory if it doesn't exist
        if !fs_utils::path_exists(&config_dir).await? {
            fs_utils::create_directory(&config_dir).await?;
        }
        
        Ok(config_dir)
    } else {
        Err(AppError::ValidationError("Could not determine config directory".to_string()))
    }
}

/// Get the directory for app output files (async version)
pub async fn get_app_output_files_directory() -> AppResult<PathBuf> {
    let mut output_dir = get_app_data_root_dir().await?;
    output_dir.push("output_files");
    
    // Create the directory if it doesn't exist
    if !fs_utils::path_exists(&output_dir).await? {
        fs_utils::create_directory(&output_dir).await?;
    }
    
    Ok(output_dir)
}

/// Get the output files directory for a specific project (async version)
pub async fn get_project_output_files_directory(project_dir: &Path) -> AppResult<PathBuf> {
    let mut output_dir = project_dir.to_path_buf();
    output_dir.push(".vibe_manager");
    output_dir.push("output_files");
    
    // Create the directory if it doesn't exist
    if !fs_utils::path_exists(&output_dir).await? {
        fs_utils::create_directory(&output_dir).await?;
    }
    
    Ok(output_dir)
}

/// Get the implementation plans directory for a specific project (async version)
pub async fn get_project_implementation_plans_directory(project_dir: &Path) -> AppResult<PathBuf> {
    let mut plans_dir = project_dir.to_path_buf();
    plans_dir.push(".vibe_manager");
    plans_dir.push("implementation_plans");
    
    // Create the directory if it doesn't exist
    if !fs_utils::path_exists(&plans_dir).await? {
        fs_utils::create_directory(&plans_dir).await?;
    }
    
    Ok(plans_dir)
}

/// Create a custom directory under the project's .vibe_manager directory (async version)
pub async fn get_project_custom_directory(project_dir: &Path, dir_name: &str) -> AppResult<PathBuf> {
    let mut custom_dir = project_dir.to_path_buf();
    custom_dir.push(".vibe_manager");
    custom_dir.push(dir_name);
    
    // Create the directory if it doesn't exist
    if !fs_utils::path_exists(&custom_dir).await? {
        fs_utils::create_directory(&custom_dir).await?;
    }
    
    Ok(custom_dir)
}

/// Sanitize a filename by replacing invalid characters with underscores
pub fn sanitize_filename(name: &str) -> String {
    // Characters not allowed in filenames on most systems
    let invalid_chars = ['/', '\\', ':', '*', '?', '"', '<', '>', '|'];
    
    // Replace invalid characters with underscores
    let mut sanitized = name.to_string();
    for c in invalid_chars {
        sanitized = sanitized.replace(c, "_");
    }
    
    // Trim leading and trailing whitespace
    let sanitized = sanitized.trim().to_string();
    
    // Truncate to a reasonable length (60 chars)
    if sanitized.len() > 60 {
        sanitized[0..60].to_string()
    } else {
        sanitized
    }
}

/// Create a unique output filepath for job outputs (async version)
pub async fn create_unique_output_filepath(
    session_id: &str, 
    task_name: &str, 
    project_dir: Option<&Path>, 
    extension: &str,
    target_dir_name: Option<&str>
) -> AppResult<PathBuf> {
    // Generate a timestamp string (YYYYMMDD_HHMMSS)
    let timestamp = Local::now().format("%Y%m%d_%H%M%S").to_string();
    
    // Sanitize the task name for use in the filename
    let sanitized_task_name = sanitize_filename(task_name);
    
    // Get the first 8 characters of the session ID
    let session_id_short = if session_id.len() > 8 {
        &session_id[0..8]
    } else {
        session_id
    };
    
    // Create the filename
    let filename = format!("{}_{}_{}_.{}", timestamp, sanitized_task_name, session_id_short, extension);
    
    // Determine the base directory
    let base_dir = if let Some(project_dir) = project_dir {
        if let Some(target_dir) = target_dir_name {
            if target_dir == crate::constants::IMPLEMENTATION_PLANS_DIR_NAME {
                get_project_implementation_plans_directory(project_dir).await?
            } else {
                // Create a more generic folder under .vibe_manager/
                let mut dir = project_dir.to_path_buf();
                dir.push(".vibe_manager");
                dir.push(target_dir);
                if !fs_utils::path_exists(&dir).await? {
                    fs_utils::create_directory(&dir).await?;
                }
                dir
            }
        } else {
            get_project_output_files_directory(project_dir).await?
        }
    } else {
        get_app_output_files_directory().await?
    };
    
    // Join base_dir and filename to get the full path
    let mut output_path = base_dir.join(filename);
    
    // If the path already exists, append a short random suffix
    if fs_utils::path_exists(&output_path).await? {
        info!("Output path already exists, adding a unique suffix");
        let mut counter = 0;
        while fs_utils::path_exists(&output_path).await? && counter < 10 {
            // Generate a short unique suffix using UUID
            let suffix = Uuid::new_v4().simple().to_string();
            let suffix = &suffix[0..6]; // Use just 6 characters from the UUID
            
            let filename_with_suffix = format!(
                "{}_{}_{}_{}_.{}", 
                timestamp, 
                sanitized_task_name, 
                session_id_short, 
                suffix, 
                extension
            );
            
            output_path = base_dir.join(filename_with_suffix);
            counter += 1;
        }
        
        // If we still have a conflict after 10 tries, append the full timestamp
        if fs_utils::path_exists(&output_path).await? {
            let full_timestamp = Local::now().timestamp_nanos();
            let filename_with_timestamp = format!(
                "{}_{}_{}_{}_.{}", 
                timestamp, 
                sanitized_task_name, 
                session_id_short, 
                full_timestamp, 
                extension
            );
            
            output_path = base_dir.join(filename_with_timestamp);
        }
    }
    
    Ok(output_path)
}

/// Creates a unique file path for an output file, similar to TypeScript's createUniqueFilePath
/// 
/// This is an async version that closely mirrors the TypeScript implementation
/// with file locking integration
pub async fn create_custom_unique_filepath(
    request_id: &str,
    session_name: &str,
    project_dir: Option<&Path>,
    extension: &str,
    target_dir_name: Option<&str>
) -> AppResult<PathBuf> {
    // Format timestamp as ISO string with T replaced by _ and : replaced by -
    let timestamp = Local::now().format("%Y-%m-%d_%H-%M-%S").to_string();
    
    // Sanitize the session name for use in the filename
    let safe_session_name = sanitize_filename(session_name);
    
    // Use part of request ID to keep filename reasonable length
    let request_id_short = if request_id.len() > 8 {
        &request_id[0..8]
    } else {
        request_id
    };
    
    // Create the filename
    let filename = format!("{}_{}_{}_.{}", timestamp, safe_session_name, request_id_short, extension);
    
    // Determine the base directory
    let base_dir = if let Some(project_dir) = project_dir {
        if let Some(target_dir) = target_dir_name {
            if target_dir == crate::constants::IMPLEMENTATION_PLANS_DIR_NAME {
                get_project_implementation_plans_directory(project_dir).await?
            } else {
                // Use the custom directory helper function
                get_project_custom_directory(project_dir, target_dir).await?
            }
        } else {
            get_project_output_files_directory(project_dir).await?
        }
    } else {
        get_app_output_files_directory().await?
    };
    
    // Join base_dir and filename to get the full path
    let file_path = base_dir.join(&filename);
    
    // Check if file exists and add random suffix if needed
    if fs_utils::path_exists(&file_path).await? {
        debug!("Output path already exists, adding a unique suffix");
        
        // Generate a random suffix
        let suffix = Uuid::new_v4().simple().to_string();
        let suffix = &suffix[0..8]; // Use 8 characters from the UUID
        
        let filename_with_suffix = format!(
            "{}_{}_{}_{}_.{}", 
            timestamp, 
            safe_session_name, 
            request_id_short, 
            suffix, 
            extension
        );
        
        return Ok(base_dir.join(filename_with_suffix));
    }
    
    Ok(file_path)
}