use crate::error::{AppError, AppResult};
use crate::utils::path_utils;
use crate::utils::{fs_utils, git_utils};
use log::info;
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use tauri::{AppHandle, command};

#[command]
pub fn get_home_directory_command() -> Result<String, String> {
    info!("Getting home directory");

    // This remains synchronous as it's just a simple lookup
    fs_utils::get_home_directory().map_err(|e| e.to_string())
}

#[command]
pub async fn list_project_files_command(
    project_directory: String,
    app_handle: AppHandle,
) -> Result<Vec<crate::models::ProjectFileInfo>, String> {
    info!(
        "Listing git-based project files in directory: {}",
        project_directory
    );

    // Use canonicalize to properly handle all path formats (UNC, relative, symlinks, etc.)
    let project_path = match std::path::Path::new(&project_directory).canonicalize() {
        Ok(path) => path,
        Err(e) => {
            return Err(format!(
                "Failed to resolve project directory path '{}': {}",
                project_directory, e
            ));
        }
    };

    // canonicalize() already ensures the path exists and is absolute
    info!("Canonical path: {}", project_path.display());

    // Use git_utils to get all non-ignored files
    let (relative_paths, is_git_repo) =
        git_utils::get_all_non_ignored_files(&project_path).map_err(|e| e.to_string())?;

    if !is_git_repo {
        return Err(format!(
            "Directory is not a git repository: {}",
            project_path.display()
        ));
    }

    let mut files = Vec::new();

    for relative_path in relative_paths {
        // Convert relative path to full path for metadata reading
        let full_path = project_path.join(&relative_path);

        // Check if file actually exists on filesystem
        if !full_path.exists() {
            // Skip files that don't exist (deleted but still in git index)
            continue;
        }

        // Get file name
        let name = relative_path
            .file_name()
            .unwrap_or_default()
            .to_string_lossy()
            .to_string();

        // Get file metadata
        let (size, modified_at) = match tokio::fs::metadata(&full_path).await {
            Ok(metadata) => {
                let size = if metadata.is_file() {
                    Some(metadata.len())
                } else {
                    None
                };
                let modified_at = metadata
                    .modified()
                    .ok()
                    .and_then(|time| time.duration_since(std::time::UNIX_EPOCH).ok())
                    .map(|duration| duration.as_millis() as i64);
                (size, modified_at)
            }
            Err(_) => (None, None), // File might not exist or be accessible
        };

        // Check if file is binary using fast extension-based check
        let is_binary = fs_utils::is_binary_file_fast(&full_path);

        let project_file_info = crate::models::ProjectFileInfo {
            path: relative_path.to_string_lossy().to_string(),
            name,
            size,
            modified_at,
            is_binary,
        };

        files.push(project_file_info);
    }

    info!("Found {} git-based project files", files.len());
    Ok(files)
}

/// Get metadata for a list of file paths (can be absolute or relative paths)
/// This is useful for getting metadata of files outside the project directory
#[command]
pub async fn get_files_metadata_command(
    file_paths: Vec<String>,
    project_directory: Option<String>,
    app_handle: AppHandle,
) -> Result<Vec<crate::models::ProjectFileInfo>, String> {
    info!("Getting metadata for {} files", file_paths.len());

    let project_path = if let Some(ref dir) = project_directory {
        Some(
            Path::new(dir)
                .canonicalize()
                .map_err(|e| format!("Failed to resolve project directory: {}", e))?,
        )
    } else {
        None
    };

    let mut files = Vec::new();

    for file_path_str in file_paths {
        let file_path = Path::new(&file_path_str);

        // Determine if this is an absolute path or relative to project
        let (full_path, relative_path) = if file_path.is_absolute() {
            // For absolute paths, use them directly
            let full = PathBuf::from(file_path);
            let relative = if let Some(ref proj_path) = project_path {
                // Try to make it relative to project if possible
                full.strip_prefix(proj_path)
                    .map(|p| p.to_path_buf())
                    .unwrap_or_else(|_| full.clone())
            } else {
                full.clone()
            };
            (full, relative)
        } else {
            // For relative paths, resolve against project directory
            if let Some(ref proj_path) = project_path {
                let full = proj_path.join(file_path);
                let relative = PathBuf::from(file_path);
                (full, relative)
            } else {
                // No project directory, treat as absolute
                let full = PathBuf::from(file_path);
                (full.clone(), full)
            }
        };

        // Check if file exists
        if !full_path.exists() {
            // Still include the file with None values for metadata
            let name = relative_path
                .file_name()
                .unwrap_or_default()
                .to_string_lossy()
                .to_string();

            files.push(crate::models::ProjectFileInfo {
                path: relative_path.to_string_lossy().to_string(),
                name,
                size: None,
                modified_at: None,
                is_binary: false,
            });
            continue;
        }

        // Get file name
        let name = relative_path
            .file_name()
            .unwrap_or_default()
            .to_string_lossy()
            .to_string();

        // Get file metadata
        let (size, modified_at) = match tokio::fs::metadata(&full_path).await {
            Ok(metadata) => {
                let size = if metadata.is_file() {
                    Some(metadata.len())
                } else {
                    None
                };
                let modified_at = metadata
                    .modified()
                    .ok()
                    .and_then(|time| time.duration_since(std::time::UNIX_EPOCH).ok())
                    .map(|duration| duration.as_millis() as i64);
                (size, modified_at)
            }
            Err(e) => {
                info!("Failed to get metadata for {}: {}", full_path.display(), e);
                (None, None)
            }
        };

        // Check if file is binary
        let is_binary = fs_utils::is_binary_file_fast(&full_path);

        let project_file_info = crate::models::ProjectFileInfo {
            path: relative_path.to_string_lossy().to_string(),
            name,
            size,
            modified_at,
            is_binary,
        };

        files.push(project_file_info);
    }

    info!("Retrieved metadata for {} files", files.len());
    Ok(files)
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateDirectoryArgs {
    pub path: String,
    pub project_directory: Option<String>,
}

#[command]
pub async fn create_directory_command(
    path: String,
    project_directory: Option<String>,
    app_handle: AppHandle,
) -> AppResult<()> {
    info!("Creating directory: {}", path);

    // If project_directory is provided, ensure the directory path is within it
    if let Some(proj_dir) = project_directory {
        let target_path = std::path::Path::new(&path);
        let project_path = std::path::Path::new(&proj_dir);

        // Validate path security
        crate::utils::fs_utils::ensure_path_within_project(project_path, target_path)
            .map_err(|e| AppError::SecurityError(format!("Invalid path: {}", e)))?;
    }

    fs_utils::create_directory(&path)
        .await
        .map_err(|e| AppError::FileSystemError(format!("Failed to create directory: {}", e)))?;

    Ok(())
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReadFileContentArgs {
    pub path: String,
    pub project_directory: Option<String>,
    pub encoding: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReadFileContentResponse {
    pub content: String,
}

#[command]
pub async fn read_file_content_command(
    path: String,
    project_directory: Option<String>,
    encoding: Option<String>,
    app_handle: AppHandle,
) -> AppResult<ReadFileContentResponse> {
    info!("Reading file content: {}", path);

    // If project_directory is provided, ensure the file path is within it
    if let Some(proj_dir) = &project_directory {
        let target_path = std::path::Path::new(&path);
        let project_path = std::path::Path::new(&proj_dir);

        // Validate path security
        crate::utils::fs_utils::ensure_path_within_project(project_path, target_path)
            .map_err(|e| AppError::SecurityError(format!("Invalid path: {}", e)))?;
    }

    let content = fs_utils::read_file_to_string(&path)
        .await
        .map_err(|e| AppError::FileSystemError(format!("Failed to read file: {}", e)))?;

    Ok(ReadFileContentResponse { content })
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WriteFileContentArgs {
    pub path: String,
    pub content: String,
    pub project_directory: Option<String>,
}

#[command]
pub async fn write_file_content_command(
    path: String,
    content: String,
    project_directory: Option<String>,
    app_handle: AppHandle,
) -> AppResult<()> {
    info!("Writing file content: {}", path);

    // If project_directory is provided, ensure the file path is within it
    if let Some(proj_dir) = project_directory {
        let target_path = std::path::Path::new(&path);
        let project_path = std::path::Path::new(&proj_dir);

        // Validate path security
        crate::utils::fs_utils::ensure_path_within_project(project_path, target_path)
            .map_err(|e| AppError::SecurityError(format!("Invalid path: {}", e)))?;
    }

    fs_utils::write_string_to_file(&path, &content)
        .await
        .map_err(|e| AppError::FileSystemError(format!("Failed to write file: {}", e)))?;

    Ok(())
}

#[command]
pub async fn write_binary_file_command(
    path: String,
    content: Vec<u8>,
    project_directory: Option<String>,
    app_handle: AppHandle,
) -> AppResult<()> {
    info!("Writing binary file: {} ({} bytes)", path, content.len());

    // If project_directory is provided, ensure the file path is within it
    if let Some(proj_dir) = project_directory {
        let target_path = std::path::Path::new(&path);
        let project_path = std::path::Path::new(&proj_dir);

        // Validate path security
        crate::utils::fs_utils::ensure_path_within_project(project_path, target_path)
            .map_err(|e| AppError::SecurityError(format!("Invalid path: {}", e)))?;
    }

    fs_utils::write_bytes_to_file(&path, &content)
        .await
        .map_err(|e| AppError::FileSystemError(format!("Failed to write binary file: {}", e)))?;

    Ok(())
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateUniqueFilePathArgs {
    pub request_id: String,
    pub session_name: String,
    pub extension: String,
    pub project_directory: Option<String>,
    pub target_dir_name: Option<String>,
}

#[command]
pub async fn create_unique_filepath_command(
    request_id: String,
    session_name: String,
    extension: String,
    project_directory: Option<String>,
    target_dir_name: Option<String>,
    app_handle: AppHandle,
) -> AppResult<String> {
    info!(
        "Creating unique file path for request={}, session={}, ext={}",
        request_id, session_name, extension
    );

    // If project_directory is provided, ensure it's a valid path
    let project_dir_path = if let Some(proj_dir) = &project_directory {
        let path = std::path::Path::new(proj_dir);

        // Validate that the directory exists and is absolute
        if !path.exists() {
            return Err(AppError::FileSystemError(format!(
                "Project directory does not exist: {}",
                proj_dir
            )));
        }

        if !path.is_absolute() {
            return Err(AppError::ValidationError(format!(
                "Project directory must be an absolute path: {}",
                proj_dir
            )));
        }

        Some(path)
    } else {
        None
    };

    // Call the path_utils function for creating the unique filepath
    let unique_path = crate::utils::path_utils::create_custom_unique_filepath(
        &request_id,
        &session_name,
        project_dir_path.as_deref(),
        &extension,
        target_dir_name.as_deref(),
        &app_handle,
    )
    .await
    .map_err(|e| AppError::FileSystemError(format!("Failed to create unique file path: {}", e)))?;

    // Return the path as a string
    Ok(unique_path.to_string_lossy().to_string())
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DeleteFileArgs {
    pub path: String,
    pub project_directory: Option<String>,
}

#[command]
pub async fn delete_file_command(
    path: String,
    project_directory: Option<String>,
    app_handle: AppHandle,
) -> AppResult<()> {
    info!("Deleting file: {}", path);

    // If project_directory is provided, ensure the file path is within it
    if let Some(proj_dir) = project_directory {
        let target_path = std::path::Path::new(&path);
        let project_path = std::path::Path::new(&proj_dir);

        // Validate path security
        crate::utils::fs_utils::ensure_path_within_project(project_path, target_path)
            .map_err(|e| AppError::SecurityError(format!("Invalid path: {}", e)))?;
    }

    fs_utils::remove_file(&path)
        .await
        .map_err(|e| AppError::FileSystemError(format!("Failed to delete file: {}", e)))?;

    Ok(())
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MoveFileArgs {
    pub source_path: String,
    pub destination_path: String,
    pub project_directory: Option<String>,
    pub overwrite: Option<bool>,
}

#[command]
pub async fn move_file_command(
    source_path: String,
    destination_path: String,
    project_directory: Option<String>,
    overwrite: Option<bool>,
    app_handle: AppHandle,
) -> AppResult<()> {
    info!("Moving file from {} to {}", source_path, destination_path);

    // Resolve paths to absolute
    let source_path_ref = std::path::Path::new(&source_path);
    let destination_path_ref = std::path::Path::new(&destination_path);

    // Call the fs_utils move_item function with the overwrite flag
    let project_path = project_directory.as_ref().map(|s| std::path::Path::new(s));
    if let Some(proj_path) = project_path {
        fs_utils::move_item(
            source_path_ref,
            destination_path_ref,
            overwrite.unwrap_or(false),
            proj_path,
        )
        .await
        .map_err(|e| AppError::FileSystemError(format!("Failed to move file: {}", e)))?;
    } else {
        return Err(AppError::ValidationError(
            "Project directory is required for move operations".to_string(),
        ));
    }

    Ok(())
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PathArgs {
    pub path: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PathJoinArgs {
    pub paths: Vec<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NormalizePathArgs {
    pub path: String,
    pub add_trailing_slash: Option<bool>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SanitizeFilenameArgs {
    pub name: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FileInfoResponse {
    pub exists: bool,
    pub size: Option<u64>,
    pub is_file: bool,
    pub is_directory: bool,
    pub modified_at: Option<i64>,
}

#[command]
pub fn path_join_command(paths: Vec<String>) -> AppResult<String> {
    let result = paths
        .iter()
        .fold(std::path::PathBuf::new(), |acc, path| acc.join(path));

    Ok(result.to_string_lossy().to_string())
}

#[command]
pub fn path_dirname_command(path: String) -> AppResult<String> {
    let path = std::path::Path::new(&path);
    let parent = path
        .parent()
        .ok_or_else(|| AppError::ValidationError("Path has no parent directory".to_string()))?;

    Ok(parent.to_string_lossy().to_string())
}

#[command]
pub fn path_basename_command(path: String) -> AppResult<String> {
    let path = std::path::Path::new(&path);
    let file_name = path
        .file_name()
        .ok_or_else(|| AppError::ValidationError("Path has no file name component".to_string()))?;

    Ok(file_name.to_string_lossy().to_string())
}

#[command]
pub fn path_extname_command(path: String) -> AppResult<String> {
    let path = std::path::Path::new(&path);
    let extension = path
        .extension()
        .map(|ext| format!(".{}", ext.to_string_lossy()))
        .unwrap_or_default();

    Ok(extension)
}

#[command]
pub async fn get_app_data_directory_command(app_handle: AppHandle) -> AppResult<String> {
    let dir = path_utils::get_app_data_root_dir(&app_handle).await?;
    Ok(dir.to_string_lossy().to_string())
}

#[command]
pub fn sanitize_filename_command(name: String) -> AppResult<String> {
    let sanitized = path_utils::sanitize_filename(&name);
    Ok(sanitized)
}

#[command]
pub fn normalize_path_command(path: String, add_trailing_slash: Option<bool>) -> AppResult<String> {
    let path = std::path::Path::new(&path);
    let normalized = path_utils::normalize_path(path)?;

    let mut result = normalized.to_string_lossy().to_string();

    // Add trailing slash if requested
    if add_trailing_slash.unwrap_or(false) && !result.ends_with('/') && !result.ends_with('\\') {
        #[cfg(windows)]
        {
            result.push('\\');
        }
        #[cfg(not(windows))]
        {
            result.push('/');
        }
    }

    Ok(result)
}

#[command]
pub async fn get_temp_dir_command() -> AppResult<String> {
    let temp_dir = fs_utils::get_app_temp_dir().await?;
    Ok(temp_dir.to_string_lossy().to_string())
}

#[command]
pub fn path_is_absolute_command(path: String) -> AppResult<bool> {
    Ok(std::path::Path::new(&path).is_absolute())
}

#[command]
pub async fn get_file_info_command(
    path: String,
    app_handle: AppHandle,
) -> AppResult<FileInfoResponse> {
    info!("Getting file info for: {}", path);

    let file_path = std::path::Path::new(&path);

    // Check if the path exists
    let exists = file_path.exists();

    if !exists {
        return Ok(FileInfoResponse {
            exists: false,
            size: None,
            is_file: false,
            is_directory: false,
            modified_at: None,
        });
    }

    // Get metadata
    let metadata = tokio::fs::metadata(&file_path)
        .await
        .map_err(|e| AppError::FileSystemError(format!("Failed to get file metadata: {}", e)))?;

    let size = if metadata.is_file() {
        Some(metadata.len())
    } else {
        None
    };

    let modified_at = metadata
        .modified()
        .ok()
        .and_then(|time| time.duration_since(std::time::UNIX_EPOCH).ok())
        .map(|duration| duration.as_millis() as i64);

    Ok(FileInfoResponse {
        exists,
        size,
        is_file: metadata.is_file(),
        is_directory: metadata.is_dir(),
        modified_at,
    })
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchFileResult {
    pub path: String,
    pub name: String,
    pub size: Option<u64>,
    pub modified_at: Option<i64>,
    pub content_snippet: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchFilesResponse {
    pub files: Vec<SearchFileResult>,
    pub total_count: usize,
}

#[command]
pub async fn search_files_command(
    app_handle: AppHandle,
    project_directory: String,
    query: String,
    include_content: Option<bool>,
    max_results: Option<u32>,
) -> AppResult<serde_json::Value> {
    info!(
        "Searching files in directory: {} with query: {}",
        project_directory, query
    );

    let include_content = include_content.unwrap_or(false);
    let max_results = max_results.unwrap_or(100) as usize;

    // Use canonicalize to properly handle all path formats
    let project_path = match std::path::Path::new(&project_directory).canonicalize() {
        Ok(path) => path,
        Err(e) => {
            return Err(AppError::FileSystemError(format!(
                "Failed to resolve project directory path '{}': {}",
                project_directory, e
            )));
        }
    };

    info!("Canonical path: {}", project_path.display());

    // Get all files using directory tree utility
    let all_paths = if git_utils::is_git_repository(&project_path) {
        // Use git to get non-ignored files
        let (relative_paths, _) = git_utils::get_all_non_ignored_files(&project_path)
            .map_err(|e| AppError::FileSystemError(e.to_string()))?;

        // Convert to absolute paths and filter existing files
        let mut paths = Vec::new();
        for relative_path in relative_paths {
            let full_path = project_path.join(&relative_path);
            if full_path.exists() && full_path.is_file() {
                paths.push(full_path);
            }
        }
        paths
    } else {
        // Use directory tree generation for non-git directories
        use crate::utils::directory_tree::{DirectoryTreeOptions, generate_directory_tree};

        let options = DirectoryTreeOptions::default();

        // Get directory tree and extract file paths from it
        let _tree_output = generate_directory_tree(&project_path, options).await
            .map_err(|e| AppError::FileSystemError(e.to_string()))?;

        // For now, let's use a simpler approach - walk the directory manually
        let mut paths: Vec<std::path::PathBuf> = Vec::new();

        fn walk_dir_recursive(dir: &std::path::Path, paths: &mut Vec<std::path::PathBuf>) -> Result<(), std::io::Error> {
            for entry in std::fs::read_dir(dir)? {
                let entry = entry?;
                let path = entry.path();
                if path.is_file() {
                    paths.push(path);
                } else if path.is_dir() {
                    // Skip common ignored directories
                    if let Some(dir_name) = path.file_name() {
                        let dir_name = dir_name.to_string_lossy();
                        if !dir_name.starts_with('.')
                            && dir_name != "node_modules"
                            && dir_name != "target"
                            && dir_name != "dist"
                            && dir_name != "build" {
                            walk_dir_recursive(&path, paths)?;
                        }
                    }
                }
            }
            Ok(())
        }

        tokio::task::spawn_blocking({
            let project_path = project_path.clone();
            move || {
                let mut paths = Vec::new();
                walk_dir_recursive(&project_path, &mut paths)
                    .map_err(|e| AppError::FileSystemError(format!("Directory traversal failed: {}", e)))?;
                Ok::<Vec<std::path::PathBuf>, AppError>(paths)
            }
        })
        .await
        .map_err(|e| AppError::JobError(format!("Failed to spawn blocking task: {}", e)))??
    };

    let mut matching_files = Vec::new();
    let query_lower = query.to_lowercase();

    // Search through files
    for file_path in all_paths {
        let relative_path = match file_path.strip_prefix(&project_path) {
            Ok(rel) => rel,
            Err(_) => continue,
        };

        let file_name = file_path
            .file_name()
            .unwrap_or_default()
            .to_string_lossy()
            .to_string();

        // Check if filename matches query
        let filename_matches = file_name.to_lowercase().contains(&query_lower) ||
            relative_path.to_string_lossy().to_lowercase().contains(&query_lower);

        let mut content_matches = false;
        let mut content_snippet = None;

        // Check content if requested and file is not binary
        if include_content && !fs_utils::is_binary_file_fast(&file_path) {
            match fs_utils::read_file_to_string(&file_path).await {
                Ok(content) => {
                    if content.to_lowercase().contains(&query_lower) {
                        content_matches = true;

                        // Create snippet around first match
                        if let Some(match_pos) = content.to_lowercase().find(&query_lower) {
                            let start = match_pos.saturating_sub(50);
                            let end = std::cmp::min(match_pos + query.len() + 50, content.len());
                            content_snippet = Some(content[start..end].to_string());
                        }
                    }
                }
                Err(_) => {
                    // Skip files we can't read
                    continue;
                }
            }
        }

        // Include file if it matches filename or content
        if filename_matches || content_matches {
            // Get file metadata
            let (size, modified_at) = match tokio::fs::metadata(&file_path).await {
                Ok(metadata) => {
                    let size = if metadata.is_file() {
                        Some(metadata.len())
                    } else {
                        None
                    };
                    let modified_at = metadata
                        .modified()
                        .ok()
                        .and_then(|time| time.duration_since(std::time::UNIX_EPOCH).ok())
                        .map(|duration| duration.as_millis() as i64);
                    (size, modified_at)
                }
                Err(_) => (None, None),
            };

            matching_files.push(SearchFileResult {
                path: relative_path.to_string_lossy().to_string(),
                name: file_name,
                size,
                modified_at,
                content_snippet,
            });

            // Limit results
            if matching_files.len() >= max_results {
                break;
            }
        }
    }

    // Sort by relevance (filename matches first, then by path)
    matching_files.sort_by(|a, b| {
        let a_filename_match = a.name.to_lowercase().contains(&query_lower);
        let b_filename_match = b.name.to_lowercase().contains(&query_lower);

        match (a_filename_match, b_filename_match) {
            (true, false) => std::cmp::Ordering::Less,
            (false, true) => std::cmp::Ordering::Greater,
            _ => a.path.cmp(&b.path),
        }
    });

    let response = SearchFilesResponse {
        total_count: matching_files.len(),
        files: matching_files,
    };

    Ok(serde_json::to_value(response)
        .map_err(|e| AppError::SerializationError(format!("Failed to serialize response: {}", e)))?)
}
