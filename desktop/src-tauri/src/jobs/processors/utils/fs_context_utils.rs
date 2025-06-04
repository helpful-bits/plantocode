//! File System Context Utilities
//! 
//! This module provides utilities for working with file system content and directory trees
//! to build context for LLM prompts.

use std::path::Path;
use log::{debug, warn};

/// Loads file contents from provided paths
pub async fn load_file_contents(
    paths: &[String],
    project_directory: &str,
) -> std::collections::HashMap<String, String> {
    let mut file_contents_map = std::collections::HashMap::new();
    
    for relative_path_str in paths {
        let full_path = std::path::Path::new(project_directory).join(relative_path_str);
        match crate::utils::fs_utils::read_file_to_string(&*full_path.to_string_lossy()).await {
            Ok(content) => {
                file_contents_map.insert(relative_path_str.clone(), content);
            }
            Err(e) => {
                warn!("Failed to read file {}: {}", full_path.display(), e);
            }
        }
    }
    
    file_contents_map
}

/// Generates directory tree for context
/// This is now a simple wrapper around the standardized utility function
pub async fn generate_directory_tree_for_context(
    project_directory: &str,
) -> Option<String> {
    match crate::utils::directory_tree::get_directory_tree_with_defaults(project_directory).await {
        Ok(tree) => Some(tree),
        Err(e) => {
            warn!("Failed to generate directory tree: {}", e);
            None
        }
    }
}

/// Validate paths against the file system
/// Returns a tuple of (validated_paths, invalid_paths)
pub async fn validate_paths_against_filesystem(
    paths: &[String], 
    project_directory: &str
) -> (Vec<String>, Vec<String>) {
    let mut validated_paths = Vec::new();
    let mut invalid_paths = Vec::new();
    
    for relative_path in paths {
        // Construct absolute path
        let absolute_path = Path::new(project_directory).join(relative_path);
        
        // Check if file exists and is a file
        match tokio::fs::metadata(&absolute_path).await {
            Ok(metadata) if metadata.is_file() => {
                validated_paths.push(relative_path.clone());
            },
            _ => {
                debug!("Path doesn't exist or isn't a regular file: {}", absolute_path.display());
                invalid_paths.push(relative_path.clone());
            }
        }
    }
    
    (validated_paths, invalid_paths)
}