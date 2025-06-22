use std::path::{Path, PathBuf};
use std::collections::HashSet;
use std::fs;
use log::{debug, info};
use dirs::config_dir;
use chrono::Local;
use uuid::Uuid;
use tauri::Manager;

use crate::error::{AppError, AppResult};
use crate::utils::{fs_utils, git_utils};

/// Normalize a path (sync version)
/// 
/// This function attempts to canonicalize the path to resolve symlinks and
/// get the absolute path. If canonicalization fails (e.g., path doesn't exist),
/// it performs basic path normalization using clean() equivalent logic.
pub fn normalize_path(path: impl AsRef<Path>) -> PathBuf {
    let path = path.as_ref();
    
    // First try to canonicalize if the path exists
    if let Ok(absolute) = fs::canonicalize(path) {
        return absolute;
    }
    
    // If canonicalization fails, perform basic normalization
    // This is similar to path.Clean() in Go or path.resolve() in Node.js
    let mut components = Vec::new();
    let mut has_leading_parent_dirs = 0usize; // Track leading .. components
    
    for component in path.components() {
        match component {
            std::path::Component::Prefix(_) => {
                components.push(component);
                has_leading_parent_dirs = 0; // Reset counter after prefix
            },
            std::path::Component::RootDir => {
                components.push(component);
                has_leading_parent_dirs = 0; // Reset counter after root
            },
            std::path::Component::CurDir => {
                // Skip "." components unless it's the only component
                if components.is_empty() {
                    components.push(component);
                }
            },
            std::path::Component::ParentDir => {
                // Handle ".." by popping the last normal component
                if let Some(last) = components.last() {
                    match last {
                        std::path::Component::Normal(_) => {
                            components.pop();
                        },
                        std::path::Component::ParentDir => {
                            // Multiple consecutive .. components
                            components.push(component);
                            has_leading_parent_dirs += 1;
                        },
                        _ => components.push(component),
                    }
                } else {
                    // Track leading parent directory references
                    components.push(component);
                    has_leading_parent_dirs += 1;
                }
                
                // Security check: prevent excessive parent directory traversal
                // This helps catch potential path traversal attacks
                if has_leading_parent_dirs > 5 {
                    debug!("Excessive parent directory traversal detected in path: {}", path.display());
                    // Return a safe fallback instead of the potentially malicious path
                    return PathBuf::from(".");
                }
            },
            std::path::Component::Normal(_) => {
                components.push(component);
                has_leading_parent_dirs = 0; // Reset counter after normal component
            },
        }
    }
    
    // Additional security check: if the path starts with many .. components relative to a root,
    // this could be an attempt to escape a sandbox
    if !path.is_absolute() && has_leading_parent_dirs > 0 {
        let normal_components = components.iter()
            .filter(|c| matches!(c, std::path::Component::Normal(_)))
            .count();
        
        // If we have more parent dir references than normal components, this is suspicious
        if has_leading_parent_dirs > normal_components && has_leading_parent_dirs > 2 {
            debug!("Suspicious path pattern detected: {} parent dirs vs {} normal components in {}", 
                   has_leading_parent_dirs, normal_components, path.display());
            return PathBuf::from(".");
        }
    }
    
    // Rebuild the path from components
    let mut normalized = PathBuf::new();
    for component in components {
        normalized.push(component);
    }
    
    // If the path is empty after normalization, return current directory
    if normalized.as_os_str().is_empty() {
        normalized.push(".");
    }
    
    normalized
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
/// 
/// This function handles various edge cases:
/// - Normalizes both paths before comparison
/// - Handles case-insensitive filesystems by using normalized paths
/// - Provides clear error messages when paths are not descendants
/// - Accounts for different casing on case-insensitive filesystems
pub fn make_relative_to(path: impl AsRef<Path>, base: impl AsRef<Path>) -> AppResult<PathBuf> {
    let path = path.as_ref();
    let base = base.as_ref();
    
    // Normalize paths to handle case sensitivity and resolve symlinks
    let path_norm = normalize_path(path);
    let base_norm = normalize_path(base);
    
    // Handle exact match case
    if path_norm == base_norm {
        return Ok(PathBuf::from("."));
    }
    
    // Check if the path is a descendant of the base
    // On case-insensitive filesystems, we need to be careful about comparisons
    if !path_norm.starts_with(&base_norm) {
        // Try a case-insensitive comparison on platforms that support it
        #[cfg(target_os = "windows")]
        {
            let path_str = path_norm.to_string_lossy().to_lowercase();
            let base_str = base_norm.to_string_lossy().to_lowercase();
            if !path_str.starts_with(&base_str) {
                return Err(AppError::ValidationError(format!(
                    "Path {} is not a descendant of {}",
                    path_norm.display(),
                    base_norm.display()
                )));
            }
        }
        #[cfg(not(target_os = "windows"))]
        {
            return Err(AppError::ValidationError(format!(
                "Path {} is not a descendant of {}",
                path_norm.display(),
                base_norm.display()
            )));
        }
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
pub async fn get_app_data_root_dir(app_handle: &tauri::AppHandle) -> AppResult<PathBuf> {
    let data_dir = app_handle.path().app_local_data_dir()
        .map_err(|e| AppError::FileSystemError(format!("Could not determine app local data directory: {}", e)))?;
    
    // Create the directory if it doesn't exist
    if !fs_utils::path_exists(&data_dir).await? {
        fs_utils::create_directory(&data_dir).await?;
    }
    
    Ok(data_dir)
}

/// Get the directory for app output files (async version)
pub async fn get_app_output_files_directory(app_handle: &tauri::AppHandle) -> AppResult<PathBuf> {
    let mut output_dir = get_app_data_root_dir(app_handle).await?;
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
    let invalid_chars = ['/', '\\', ':', '*', '?', '"', '<', '>', '|', '\0', '\r', '\n', '\t'];
    
    // Additional security checks for problematic patterns
    let sanitized_input = name
        .replace("..", "_") // Prevent directory traversal
        .replace("~", "_")  // Prevent home directory expansion
        .replace("$", "_")  // Prevent variable expansion
        .trim()
        .to_string();
    
    // Replace invalid characters with underscores
    let mut sanitized = sanitized_input;
    for c in invalid_chars {
        sanitized = sanitized.replace(c, "_");
    }
    
    // Remove any remaining control characters (0-31 and 127)
    sanitized = sanitized.chars()
        .filter(|&c| c as u32 >= 32 && c as u32 != 127)
        .collect();
    
    // Prevent reserved Windows filenames
    let reserved_names = ["CON", "PRN", "AUX", "NUL", "COM1", "COM2", "COM3", "COM4", 
                         "COM5", "COM6", "COM7", "COM8", "COM9", "LPT1", "LPT2", 
                         "LPT3", "LPT4", "LPT5", "LPT6", "LPT7", "LPT8", "LPT9"];
    
    let upper_sanitized = sanitized.to_uppercase();
    for reserved in &reserved_names {
        if upper_sanitized == *reserved || upper_sanitized.starts_with(&format!("{}.", reserved)) {
            sanitized = format!("_{}", sanitized);
            break;
        }
    }
    
    // Trim leading and trailing dots and spaces (problematic on Windows)
    let sanitized = sanitized.trim_matches(|c| c == '.' || c == ' ').to_string();
    
    // Ensure we have a non-empty result
    let sanitized = if sanitized.is_empty() {
        "unnamed".to_string()
    } else {
        sanitized
    };
    
    // Truncate to a reasonable length (60 chars)
    if sanitized.len() > 60 {
        sanitized[0..60].to_string()
    } else {
        sanitized
    }
}

/// Ensure a filepath is unique by appending suffixes as needed
async fn ensure_unique_filepath(base_dir: &Path, base_filename: &str, extension: &str) -> AppResult<PathBuf> {
    let filename = format!("{}.{}", base_filename, extension);
    let mut output_path = base_dir.join(filename);
    
    // If the path already exists, append a short random suffix
    if fs_utils::path_exists(&output_path).await? {
        info!("Output path already exists, adding a unique suffix");
        let mut counter = 0;
        while fs_utils::path_exists(&output_path).await? && counter < 10 {
            // Generate a short unique suffix using UUID
            let suffix = Uuid::new_v4().simple().to_string();
            let suffix = &suffix[0..6]; // Use just 6 characters from the UUID
            
            let filename_with_suffix = format!("{}_{}.{}", base_filename, suffix, extension);
            output_path = base_dir.join(filename_with_suffix);
            counter += 1;
        }
        
        // If we still have a conflict after 10 tries, append the full timestamp
        if fs_utils::path_exists(&output_path).await? {
            let full_timestamp = Local::now().timestamp_nanos();
            let filename_with_timestamp = format!("{}_{}.{}", base_filename, full_timestamp, extension);
            output_path = base_dir.join(filename_with_timestamp);
        }
    }
    
    Ok(output_path)
}

/// Create a unique output filepath for job outputs (async version)
pub async fn create_unique_output_filepath(
    session_id: &str, 
    task_name: &str, 
    project_dir: Option<&Path>, 
    extension: &str,
    target_dir_name: Option<&str>,
    app_handle: &tauri::AppHandle
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
    
    // Create the base filename (without extension)
    let base_filename = format!("{}_{}_{}_{}", timestamp, sanitized_task_name, session_id_short, "");
    let base_filename = base_filename.trim_end_matches('_'); // Remove trailing underscore
    
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
        get_app_output_files_directory(app_handle).await?
    };
    
    // Use the shared helper to ensure uniqueness
    ensure_unique_filepath(&base_dir, base_filename, extension).await
}

/// Validate and sanitize a path received from LLM to ensure it's safe for filesystem operations
pub fn validate_llm_path(llm_path: &str, project_dir: &Path) -> AppResult<PathBuf> {
    // First, check for obviously malicious patterns
    if llm_path.contains('\0') || llm_path.len() > 500 {
        return Err(AppError::SecurityError("Invalid path format".to_string()));
    }
    
    // Remove any leading/trailing whitespace and normalize line endings
    let cleaned_path = llm_path.trim().replace('\r', "").replace('\n', "");
    
    // Check for suspicious patterns that could indicate injection attempts
    let suspicious_patterns = [
        "://", "file://", "ftp://", "http://", "https://",
        "\\\\", "\\Device\\", "\\??\\", "\\Global\\",
        "CON:", "PRN:", "AUX:", "NUL:",
    ];
    
    for pattern in &suspicious_patterns {
        if cleaned_path.contains(pattern) {
            return Err(AppError::SecurityError(format!(
                "Path contains suspicious pattern: {}", pattern
            )));
        }
    }
    
    // Convert to PathBuf and normalize
    let path = Path::new(&cleaned_path);
    let normalized_path = normalize_path(path);
    
    // Ensure the path is within the project directory
    crate::utils::fs_utils::ensure_path_within_project(project_dir, &normalized_path)?;
    
    Ok(normalized_path)
}

/// Validate a collection of paths from LLM response
pub fn validate_llm_paths(llm_paths: &[String], project_dir: &Path) -> AppResult<Vec<PathBuf>> {
    let mut validated_paths = Vec::new();
    
    for path_str in llm_paths {
        match validate_llm_path(path_str, project_dir) {
            Ok(validated_path) => {
                validated_paths.push(validated_path);
            }
            Err(e) => {
                // Log the error but continue with other paths
                log::warn!("Skipping invalid LLM path '{}': {}", path_str, e);
                continue;
            }
        }
    }
    
    Ok(validated_paths)
}

/// Discover files in a directory, respecting git ignore patterns if it's a git repository
pub fn discover_files(project_directory: &str, excluded_paths: &[String]) -> AppResult<Vec<String>> {
    let project_path = Path::new(project_directory);
    
    // Check if this is a git repository
    if git_utils::is_git_repository(project_path) {
        // Use git to get all non-ignored files
        match git_utils::get_all_non_ignored_files(project_path) {
            Ok((files, _is_git_repo)) => {
                let mut discovered_files = Vec::new();
                
                for file_path in files {
                    // Keep paths relative to project root
                    let file_path_string = file_path.to_string_lossy().to_string();
                    
                    // Check if file should be excluded based on excluded_paths patterns
                    let should_exclude = excluded_paths.iter().any(|pattern| {
                        matches_pattern(&file_path_string, pattern)
                    });
                    
                    if !should_exclude {
                        discovered_files.push(file_path_string);
                    }
                }
                
                Ok(discovered_files)
            }
            Err(e) => Err(e),
        }
    } else {
        Err(AppError::FileSystemError(
            "Directory is not a git repository. Only git repositories are supported for file discovery.".to_string()
        ))
    }
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
    target_dir_name: Option<&str>,
    app_handle: &tauri::AppHandle
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
    
    // Create the base filename (without extension)
    let base_filename = format!("{}_{}_{}_{}", timestamp, safe_session_name, request_id_short, "");
    let base_filename = base_filename.trim_end_matches('_'); // Remove trailing underscore
    
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
        get_app_output_files_directory(app_handle).await?
    };
    
    // Use the shared helper to ensure uniqueness
    ensure_unique_filepath(&base_dir, base_filename, extension).await
}

