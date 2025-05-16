use tauri::{command, AppHandle};
use log::info;
use serde::{Serialize, Deserialize};
use crate::error::{AppError, AppResult};
use crate::utils::fs_utils;
use ::dirs;

#[command]
pub fn get_home_directory_command() -> Result<String, String> {
    info!("Getting home directory");

    // This remains synchronous as it's just a simple lookup
    fs_utils::get_home_directory()
        .map_err(|e| e.to_string())
}

/// Get common OS directory paths formatted for the UI
#[command]
pub fn get_common_paths_command() -> Result<Vec<crate::models::DirectoryInfo>, String> {
    use std::path::Path as StdPath;
    use crate::models::DirectoryInfo;
    use crate::utils::path_utils;
    
    info!("Getting common OS paths");
    
    let mut result = Vec::new();
    
    // Get home directory using dirs
    let home_dir = match dirs::home_dir() {
        Some(dir) => dir,
        None => return Err("Could not determine home directory".to_string()),
    };
    
    // Add home directory
    let home_path = path_utils::normalize_path(&home_dir).to_string_lossy().to_string();
    result.push(DirectoryInfo {
        name: "Home".to_string(),
        path: home_path.clone(),
        is_accessible: StdPath::new(&home_path).exists(),
    });
    
    // Add Documents directory
    if let Some(dir) = dirs::document_dir() {
        let path = path_utils::normalize_path(&dir).to_string_lossy().to_string();
        result.push(DirectoryInfo {
            name: "Documents".to_string(),
            path: path.clone(),
            is_accessible: StdPath::new(&path).exists(),
        });
    }
    
    // Add Desktop directory
    if let Some(dir) = dirs::desktop_dir() {
        let path = path_utils::normalize_path(&dir).to_string_lossy().to_string();
        result.push(DirectoryInfo {
            name: "Desktop".to_string(),
            path: path.clone(),
            is_accessible: StdPath::new(&path).exists(),
        });
    }
    
    // Add Downloads directory
    if let Some(dir) = dirs::download_dir() {
        let path = path_utils::normalize_path(&dir).to_string_lossy().to_string();
        result.push(DirectoryInfo {
            name: "Downloads".to_string(),
            path: path.clone(),
            is_accessible: StdPath::new(&path).exists(),
        });
    }
    
    // Add root directory (drive)
    #[cfg(windows)]
    {
        let root_path = "C:\\".to_string();
        result.push(DirectoryInfo {
            name: "C Drive".to_string(),
            path: root_path.clone(),
            is_accessible: StdPath::new(&root_path).exists(),
        });
    }
    
    #[cfg(not(windows))]
    {
        let root_path = "/".to_string();
        result.push(DirectoryInfo {
            name: "Root".to_string(),
            path: root_path.clone(),
            is_accessible: StdPath::new(&root_path).exists(),
        });
    }
    
    // Only include paths that exist
    result.retain(|info| info.is_accessible);
    
    Ok(result)
}

#[derive(Debug, Deserialize)]
pub struct ListFilesRequestArgs {
    pub directory: String,
    pub pattern: Option<String>,
    pub include_stats: Option<bool>,
    pub exclude: Option<Vec<String>>,
}

#[command]
pub async fn list_files_command(args: ListFilesRequestArgs, app_handle: AppHandle) -> Result<crate::models::ListFilesResponse, String> {
    info!("Listing files in directory: {}", args.directory);
    
    // Validate directory parameter
    let directory_path = std::path::Path::new(&args.directory);
    if !directory_path.is_absolute() {
        return Err(format!("Directory path must be absolute: {}", args.directory));
    }
    
    // Convert ListFilesRequestArgs to file_service::ListFilesArgs
    let service_args = crate::services::file_service::ListFilesArgs {
        directory: args.directory,
        pattern: args.pattern,
        include_stats: args.include_stats,
        exclude: args.exclude,
    };

    // Call the service function
    crate::services::file_service::list_files_with_options(service_args)
        .await
        .map_err(|e| e.to_string())
}

#[derive(Debug, Deserialize)]
pub struct CreateDirectoryArgs {
    pub path: String,
    pub project_directory: Option<String>,
}

#[command]
pub async fn create_directory_command(args: CreateDirectoryArgs, app_handle: AppHandle) -> AppResult<()> {
    info!("Creating directory: {}", args.path);
    
    // If project_directory is provided, ensure the directory path is within it
    if let Some(proj_dir) = args.project_directory {
        let target_path = std::path::Path::new(&args.path);
        let project_path = std::path::Path::new(&proj_dir);
        
        // Validate path security
        crate::utils::fs_utils::ensure_path_within_project(project_path, target_path)
            .map_err(|e| AppError::SecurityError(format!("Invalid path: {}", e)))?;
    }

    fs_utils::create_directory(&args.path).await
        .map_err(|e| AppError::FileSystemError(format!("Failed to create directory: {}", e)))?;

    Ok(())
}

#[derive(Debug, Deserialize)]
pub struct ReadFileContentArgs {
    pub path: String,
    pub project_directory: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct ReadFileContentResponse {
    pub content: String,
}

#[command]
pub async fn read_file_content_command(args: ReadFileContentArgs, app_handle: AppHandle) -> AppResult<ReadFileContentResponse> {
    info!("Reading file content: {}", args.path);
    
    // Get the project directory from the context if available
    let project_directory = args.project_directory.clone();
    
    // If project_directory is provided, ensure the file path is within it
    if let Some(proj_dir) = project_directory {
        let target_path = std::path::Path::new(&args.path);
        let project_path = std::path::Path::new(&proj_dir);
        
        // Validate path security
        crate::utils::fs_utils::ensure_path_within_project(project_path, target_path)
            .map_err(|e| AppError::SecurityError(format!("Invalid path: {}", e)))?;
    }

    let content = fs_utils::read_file_to_string(&args.path).await
        .map_err(|e| AppError::FileSystemError(format!("Failed to read file: {}", e)))?;

    Ok(ReadFileContentResponse { content })
}

#[derive(Debug, Deserialize)]
pub struct WriteFileContentArgs {
    pub path: String,
    pub content: String,
    pub project_directory: Option<String>,
}

#[command]
pub async fn write_file_content_command(args: WriteFileContentArgs, app_handle: AppHandle) -> AppResult<()> {
    info!("Writing file content: {}", args.path);
    
    // If project_directory is provided, ensure the file path is within it
    if let Some(proj_dir) = args.project_directory {
        let target_path = std::path::Path::new(&args.path);
        let project_path = std::path::Path::new(&proj_dir);
        
        // Validate path security
        crate::utils::fs_utils::ensure_path_within_project(project_path, target_path)
            .map_err(|e| AppError::SecurityError(format!("Invalid path: {}", e)))?;
    }

    fs_utils::write_string_to_file(&args.path, &args.content).await
        .map_err(|e| AppError::FileSystemError(format!("Failed to write file: {}", e)))?;

    Ok(())
}

#[derive(Debug, Deserialize)]
pub struct CreateUniqueFilePathArgs {
    pub request_id: String,
    pub session_name: String,
    pub extension: String,
    pub project_directory: Option<String>,
    pub target_dir_name: Option<String>,
}

#[command]
pub async fn create_unique_filepath_command(args: CreateUniqueFilePathArgs, app_handle: AppHandle) -> AppResult<String> {
    info!("Creating unique file path for request={}, session={}, ext={}", args.request_id, args.session_name, args.extension);
    
    // If project_directory is provided, ensure it's a valid path
    let project_dir_path = if let Some(proj_dir) = &args.project_directory {
        let path = std::path::Path::new(proj_dir);
        
        // Validate that the directory exists and is absolute
        if !path.exists() {
            return Err(AppError::FileSystemError(format!("Project directory does not exist: {}", proj_dir)));
        }
        
        if !path.is_absolute() {
            return Err(AppError::ValidationError(format!("Project directory must be an absolute path: {}", proj_dir)));
        }
        
        Some(path)
    } else {
        None
    };

    // Call the path_utils function for creating the unique filepath
    let unique_path = crate::utils::path_utils::create_custom_unique_filepath(
        &args.request_id,
        &args.session_name, 
        project_dir_path.as_deref(),
        &args.extension,
        args.target_dir_name.as_deref()
    ).await
    .map_err(|e| AppError::FileSystemError(format!("Failed to create unique file path: {}", e)))?;
    
    // Return the path as a string
    Ok(unique_path.to_string_lossy().to_string())
}

#[derive(Debug, Deserialize)]
pub struct DeleteFileArgs {
    pub path: String,
    pub project_directory: Option<String>,
}

#[command]
pub async fn delete_file_command(args: DeleteFileArgs, app_handle: AppHandle) -> AppResult<()> {
    info!("Deleting file: {}", args.path);
    
    // If project_directory is provided, ensure the file path is within it
    if let Some(proj_dir) = args.project_directory {
        let target_path = std::path::Path::new(&args.path);
        let project_path = std::path::Path::new(&proj_dir);
        
        // Validate path security
        crate::utils::fs_utils::ensure_path_within_project(project_path, target_path)
            .map_err(|e| AppError::SecurityError(format!("Invalid path: {}", e)))?;
    }

    fs_utils::remove_file(&args.path).await
        .map_err(|e| AppError::FileSystemError(format!("Failed to delete file: {}", e)))?;

    Ok(())
}

#[derive(Debug, Deserialize)]
pub struct MoveFileArgs {
    pub source_path: String,
    pub destination_path: String,
    pub project_directory: Option<String>,
    pub overwrite: Option<bool>,
}

#[command]
pub async fn move_file_command(args: MoveFileArgs, app_handle: AppHandle) -> AppResult<()> {
    info!("Moving file from {} to {}", args.source_path, args.destination_path);
    
    // If project_directory is provided, ensure both source_path and destination_path are within it
    if let Some(proj_dir) = &args.project_directory {
        let source_path = std::path::Path::new(&args.source_path);
        let destination_path = std::path::Path::new(&args.destination_path);
        let project_path = std::path::Path::new(proj_dir);
        
        // Validate source path security
        crate::utils::fs_utils::ensure_path_within_project(project_path, source_path)
            .map_err(|e| AppError::SecurityError(format!("Invalid source path: {}", e)))?;
            
        // Validate destination path security
        crate::utils::fs_utils::ensure_path_within_project(project_path, destination_path)
            .map_err(|e| AppError::SecurityError(format!("Invalid destination path: {}", e)))?;
    }

    // Resolve paths to absolute
    let source_path = std::path::Path::new(&args.source_path);
    let destination_path = std::path::Path::new(&args.destination_path);
    
    // Call the fs_utils move_item function with the overwrite flag
    fs_utils::move_item(source_path, destination_path, args.overwrite.unwrap_or(false)).await
        .map_err(|e| AppError::FileSystemError(format!("Failed to move file: {}", e)))?;

    Ok(())
}