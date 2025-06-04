use std::path::{Path, PathBuf};
use std::collections::HashSet;
use log::{debug, warn};
use tokio::fs;
use serde::{Serialize, Deserialize};
use async_recursion::async_recursion;

use crate::error::AppResult;
use crate::utils::fs_utils;
use crate::utils::git_utils;

/// Options for directory tree generation
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DirectoryTreeOptions {
    /// Maximum depth to traverse (None means no limit)
    pub max_depth: Option<usize>,
    
    /// Whether to include files ignored by git
    pub include_ignored: bool,
    
    /// Whether to respect .gitignore files (only relevant for git repos)
    pub respect_gitignore: bool,
    
    /// Patterns to exclude when using non-git traversal
    pub exclude_patterns: Option<Vec<String>>,
    
    /// Whether to include files in the listing
    pub include_files: bool,
    
    /// Whether to include directories in the listing
    pub include_dirs: bool,
    
    /// Whether to include hidden files/directories
    pub include_hidden: bool,
}

impl Default for DirectoryTreeOptions {
    fn default() -> Self {
        Self {
            max_depth: None,
            include_ignored: false,
            respect_gitignore: true,
            exclude_patterns: None,
            include_files: true,
            include_dirs: true,
            include_hidden: false,
        }
    }
}

/// Generate a textual representation of a directory tree
pub async fn generate_directory_tree(project_dir_path: &Path, options: DirectoryTreeOptions) -> AppResult<String> {
    let project_dir_str = project_dir_path.to_string_lossy().to_string();
    debug!("Generating directory tree for {}", project_dir_str);
    
    let mut all_paths = Vec::new();
    
    // Use git to get file list if this is a git repo and respect_gitignore is enabled
    // Clone the path before moving it to the spawn_blocking closure
    let project_dir_path_clone_for_git_check = project_dir_path.to_path_buf();
    let is_git_repo = tokio::task::spawn_blocking(move || {
        git_utils::is_git_repository(&project_dir_path_clone_for_git_check)
    }).await.unwrap_or(false);
    
    if options.respect_gitignore && is_git_repo {
        debug!("Using git to get file list (respecting .gitignore)");
        if options.include_ignored {
            // Get all files (including untracked) without respecting gitignore
            let entries = list_directory_recursive(
                project_dir_path, 
                options.max_depth, 
                &mut HashSet::new(),
                options.exclude_patterns.as_deref(),
                options.include_files,
                options.include_dirs,
                options.include_hidden
            ).await?;
            all_paths.extend(entries);
        } else {
            // Get all non-ignored files (respecting gitignore)
            // Use spawn_blocking since git operations are synchronous
            let project_dir_path_clone_for_listing = project_dir_path.to_path_buf();
            let files = tokio::task::spawn_blocking(move || {
                git_utils::get_all_non_ignored_files(&project_dir_path_clone_for_listing)
            }).await.map_err(|e| crate::error::AppError::JobError(format!("Failed to spawn blocking task for git: {}", e)))??;
            
            // Convert relative paths from git to absolute paths
            for relative_path in files.0 {
                let absolute_path = project_dir_path.join(&relative_path);
                all_paths.push(absolute_path);
            }
        }
    } else {
        // Use standard file system traversal
        debug!("Using filesystem traversal");
        let entries = list_directory_recursive(
            project_dir_path, 
            options.max_depth, 
            &mut HashSet::new(),
            options.exclude_patterns.as_deref(),
            options.include_files,
            options.include_dirs,
            options.include_hidden
        ).await?;
        all_paths.extend(entries);
    }
    
    // Filter out binary files - but do it more efficiently without file locks
    let mut filtered_paths = Vec::new();
    for path in all_paths {
        // Use a fast, non-blocking binary check based on extension only
        let is_binary = fs_utils::is_binary_file_fast(&path);
        
        if !is_binary {
            filtered_paths.push(path);
        }
    }
    
    // Sort paths
    filtered_paths.sort();
    
    // Convert to relative paths
    let mut relative_paths = Vec::new();
    for path in filtered_paths {
        if let Ok(rel_path) = path.strip_prefix(project_dir_path) {
            relative_paths.push(rel_path.to_path_buf());
        }
    }
    
    // Generate tree
    let tree = format_directory_tree(&relative_paths);
    
    Ok(tree)
}

/// Format a list of paths into a directory tree string
fn format_directory_tree(paths: &[PathBuf]) -> String {
    let mut result = String::new();
    
    result.push_str(".\n");
    
    for path in paths {
        let path_str = path.to_string_lossy();
        let depth = path.components().count();
        
        // Indent based on depth
        for _ in 0..depth - 1 {
            result.push_str("│   ");
        }
        
        // Add tree branch
        result.push_str("├── ");
        
        // Add full relative path
        result.push_str(&path.to_string_lossy());
        
        result.push('\n');
    }
    
    result
}

/// Recursively list all files in a directory
#[async_recursion]
async fn list_directory_recursive(
    dir: &Path, 
    max_depth: Option<usize>, 
    visited: &mut HashSet<PathBuf>,
    exclude_patterns: Option<&[String]>,
    include_files: bool,
    include_dirs: bool,
    include_hidden: bool
) -> AppResult<Vec<PathBuf>> {
    // Prevent infinite loops from symlinks
    let canonical_dir = match fs::canonicalize(dir).await {
        Ok(path) => path,
        Err(_) => return Ok(Vec::new()), // Skip if we can't canonicalize
    };
    
    if visited.contains(&canonical_dir) {
        return Ok(Vec::new());
    }
    visited.insert(canonical_dir);
    
    // Get current depth
    let current_depth = dir.components().count();
    
    // Check max depth
    if let Some(max_depth) = max_depth {
        if current_depth > max_depth {
            return Ok(Vec::new());
        }
    }
    
    let mut result = Vec::new();
    
    // List files in the current directory
    match fs_utils::list_directory(dir).await {
        Ok(entries) => {
            for entry in entries {
                let path = Path::new(&entry.path);
                let file_name = path.file_name().and_then(|n| n.to_str()).unwrap_or("");
                
                // Skip hidden files/directories if not included
                if !include_hidden && file_name.starts_with(".") {
                    continue;
                }
                
                // Check if the path matches any exclude pattern
                if let Some(patterns) = exclude_patterns {
                    let relative_path = match path.strip_prefix(dir) {
                        Ok(rel_path) => rel_path,
                        Err(_) => path,  // Fall back to full path if stripping prefix fails
                    };
                    
                    let rel_path_str = relative_path.to_string_lossy().to_string();
                    
                    // Skip if path matches any exclude pattern
                    let mut excluded = false;
                    for pattern in patterns {
                        if crate::utils::path_utils::matches_pattern(&rel_path_str, pattern) {
                            excluded = true;
                            break;
                        }
                    }
                    
                    if excluded {
                        continue;
                    }
                }
                
                // Process file or directory
                if entry.is_dir {
                    // Recursively process directory
                    // Box the recursive call to avoid stack overflows with deep recursion
                    let nested_files = Box::pin(list_directory_recursive(
                        path, max_depth, visited, exclude_patterns, 
                        include_files, include_dirs, include_hidden
                    )).await?;
                    result.extend(nested_files);
                    
                    // Add the directory itself if directories are included
                    if include_dirs {
                        result.push(path.to_path_buf());
                    }
                } else if include_files {
                    // Add file if files are included
                    result.push(path.to_path_buf());
                }
            }
        },
        Err(err) => {
            warn!("Failed to list directory {}: {}", dir.display(), err);
        }
    }
    
    Ok(result)
}

/// On-demand directory tree generation utility for processors
/// This function provides a simple interface for processors to generate directory trees
/// without requiring a separate workflow stage
pub async fn get_directory_tree_for_processor(
    project_directory: &str,
    excluded_paths: Option<&[String]>
) -> AppResult<String> {
    debug!("Generating directory tree on-demand for: {}", project_directory);
    
    let project_dir_path = Path::new(project_directory);
    
    // Create default options with sensible defaults for most processors
    let tree_options = DirectoryTreeOptions {
        max_depth: None,
        include_ignored: false,
        respect_gitignore: true,
        exclude_patterns: excluded_paths.map(|paths| paths.to_vec()),
        include_files: true,
        include_dirs: true,
        include_hidden: false,
    };
    
    // Generate directory tree
    let directory_tree = generate_directory_tree(project_dir_path, tree_options).await?;
    
    debug!("Generated on-demand directory tree with {} lines", 
           directory_tree.lines().count());
    
    Ok(directory_tree)
}

/// Convenience function for processors that need directory tree with default excluded paths
/// Uses common excluded paths for development projects
pub async fn get_directory_tree_with_defaults(project_directory: &str) -> AppResult<String> {
    let default_excluded = vec![
        ".git".to_string(),
        "node_modules".to_string(),
        "target".to_string(),
        "dist".to_string(),
        "build".to_string(),
        ".vscode".to_string(),
        ".idea".to_string(),
        "__pycache__".to_string(),
        ".pytest_cache".to_string(),
        ".mypy_cache".to_string(),
        "venv".to_string(),
        ".venv".to_string(),
        "env".to_string(),
        ".env".to_string(),
    ];
    
    get_directory_tree_for_processor(project_directory, Some(&default_excluded)).await
}