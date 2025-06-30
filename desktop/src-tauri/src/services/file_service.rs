use log::{info, debug};
use crate::error::{AppResult, AppError};
use crate::utils::{path_utils, fs_utils};



/// Shallow directory listing for directory browser (like Finder)
pub async fn list_directories_only(directory_path: &str) -> AppResult<Vec<crate::models::DirectoryInfo>> {
    use std::path::Path;
    use crate::models::DirectoryInfo;
    
    info!("Listing directories only in: {}", directory_path);
    
    // Normalize the input directory path
    let directory = path_utils::normalize_path(directory_path)?;
    
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

