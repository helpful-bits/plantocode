use crate::error::{AppError, AppResult};
use crate::utils::path_utils;
use crate::utils::{fs_utils, git_utils};
use log::info;
use serde::{Deserialize, Serialize};
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

    // Validate project_directory parameter
    let project_path = std::path::Path::new(&project_directory);
    if !project_path.is_absolute() {
        return Err(format!(
            "Project directory path must be absolute: {}",
            project_directory
        ));
    }

    if !project_path.exists() {
        return Err(format!(
            "Project directory does not exist: {}",
            project_directory
        ));
    }

    // Use git_utils to get all non-ignored files
    let (relative_paths, is_git_repo) =
        git_utils::get_all_non_ignored_files(&project_directory).map_err(|e| e.to_string())?;

    if !is_git_repo {
        return Err(format!(
            "Directory is not a git repository: {}",
            project_directory
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
    let metadata = tokio::fs::metadata(&file_path).await
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
