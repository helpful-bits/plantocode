use log::debug;
use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use std::path::{Path, PathBuf};

use crate::error::{AppError, AppResult};
use crate::utils::fs_utils;
use crate::utils::git_utils;

pub async fn get_combined_directory_tree_for_roots(roots: &[String]) -> AppResult<String> {
    use std::collections::HashSet;
    
    // Find the common git repository root for all roots
    let git_root = {
        let mut common_git_root: Option<PathBuf> = None;
        
        for root_str in roots {
            let mut current = Path::new(root_str);
            
            // Walk up to find git root
            loop {
                if git_utils::is_git_repository(current) {
                    let git_path = current.to_path_buf();
                    
                    // Check if this matches our previously found git root
                    if let Some(ref existing_root) = common_git_root {
                        if existing_root != &git_path {
                            // Different git roots - fall back to individual processing
                            return get_combined_directory_tree_for_roots_fallback(roots).await;
                        }
                    } else {
                        common_git_root = Some(git_path);
                    }
                    break;
                }
                
                if let Some(parent) = current.parent() {
                    current = parent;
                } else {
                    // No git root found - fall back to individual processing
                    return get_combined_directory_tree_for_roots_fallback(roots).await;
                }
            }
        }
        
        common_git_root.ok_or_else(|| {
            AppError::JobError("No git repository found for roots".to_string())
        })?
    };
    
    // Get ALL non-ignored files from the git repository
    let (all_git_files, _) = git_utils::get_all_non_ignored_files(&git_root)?;
    
    // Convert to absolute paths and filter by roots
    let mut sections = Vec::new();
    
    for root_str in roots {
        let root_path = Path::new(root_str);
        let header = format!("===== ROOT: {} =====\n", root_str);
        
        // Filter files that belong to this root
        let mut root_files = Vec::new();
        for rel_path in &all_git_files {
            let abs_path = git_root.join(rel_path);
            
            // Check if this file is under the current root
            if abs_path.starts_with(&root_path) {
                // Make path relative to this root (not git root)
                if let Ok(root_relative) = abs_path.strip_prefix(&root_path) {
                    root_files.push(root_relative.to_path_buf());
                }
            }
        }
        
        // Also collect directories (from file paths)
        let mut all_paths = HashSet::new();
        for file_path in &root_files {
            // Add the file itself
            all_paths.insert(file_path.clone());
            
            // Add all parent directories
            let mut parent = file_path.parent();
            while let Some(p) = parent {
                if !p.as_os_str().is_empty() {
                    all_paths.insert(p.to_path_buf());
                }
                parent = p.parent();
            }
        }
        
        // Convert to sorted vector
        let mut sorted_paths: Vec<PathBuf> = all_paths.into_iter().collect();
        sorted_paths.sort();
        
        // Format as tree
        let tree = format_directory_tree(&sorted_paths);
        sections.push(format!("{}{}", header, tree));
    }
    
    Ok(sections.join("\n\n"))
}

// Fallback for when roots have different git repositories or no git
async fn get_combined_directory_tree_for_roots_fallback(roots: &[String]) -> AppResult<String> {
    let mut sections = Vec::new();
    
    for r in roots {
        let header = format!("===== ROOT: {} =====\n", r);
        let body = get_directory_tree_with_defaults(r).await?;
        sections.push(format!("{}{}", header, body));
    }
    
    Ok(sections.join("\n\n"))
}

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
pub async fn generate_directory_tree(
    project_dir_path: &Path,
    options: DirectoryTreeOptions,
) -> AppResult<String> {
    let project_dir_str = project_dir_path.to_string_lossy().to_string();

    let mut all_paths = Vec::new();

    // Use git to get file list if this is a git repo and respect_gitignore is enabled
    // Clone the path before moving it to the spawn_blocking closure
    let project_dir_path_clone_for_git_check = project_dir_path.to_path_buf();
    let is_git_repo = tokio::task::spawn_blocking(move || {
        git_utils::is_git_repository(&project_dir_path_clone_for_git_check)
    })
    .await
    .unwrap_or(false);

    if options.respect_gitignore && is_git_repo {
        debug!("Using git to get file list (respecting .gitignore)");

        // Only git repositories are supported, and we always respect gitignore
        // Get all non-ignored files (respecting gitignore)
        // Use spawn_blocking since git operations are synchronous
        let project_dir_path_clone_for_listing = project_dir_path.to_path_buf();
        let files = tokio::task::spawn_blocking(move || {
            git_utils::get_all_non_ignored_files(&project_dir_path_clone_for_listing)
        })
        .await
        .map_err(|e| {
            crate::error::AppError::JobError(format!(
                "Failed to spawn blocking task for git: {}",
                e
            ))
        })??;

        // Convert relative paths from git to absolute paths
        for relative_path in files.0 {
            let absolute_path = project_dir_path.join(&relative_path);
            
            // Check if file actually exists on filesystem
            if !absolute_path.exists() {
                // Skip files that don't exist (deleted but still in git index)
                continue;
            }
            
            all_paths.push(absolute_path);
        }
    } else {
        // Handle non-git directories with filesystem traversal
        debug!("Directory is not a git repository, using filesystem traversal for: {}", project_dir_str);
        
        // Perform filesystem traversal
        let project_dir_path_for_traversal = project_dir_path.to_path_buf();
        let exclude_patterns = options.exclude_patterns.clone();
        let include_hidden = options.include_hidden;
        let max_depth = options.max_depth;
        
        all_paths = tokio::task::spawn_blocking(move || {
            traverse_directory_non_git(
                &project_dir_path_for_traversal,
                &exclude_patterns,
                include_hidden,
                max_depth,
            )
        })
        .await
        .map_err(|e| {
            AppError::JobError(format!(
                "Failed to spawn blocking task for directory traversal: {}",
                e
            ))
        })??;
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
        let _path_str = path.to_string_lossy();
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

/// Traverse directory without git, respecting exclude patterns
/// This is a synchronous function meant to be called from spawn_blocking
fn traverse_directory_non_git(
    base_path: &Path,
    exclude_patterns: &Option<Vec<String>>,
    include_hidden: bool,
    max_depth: Option<usize>,
) -> AppResult<Vec<PathBuf>> {
    let mut all_paths = Vec::new();
    let mut visited_dirs = HashSet::new();
    
    // Default exclude patterns for common directories we should skip
    let default_excludes = vec![
        ".git",
        "node_modules",
        "target",
        "dist",
        "build",
        ".vscode",
        ".idea",
        "__pycache__",
        ".pytest_cache",
        ".mypy_cache",
        "venv",
        ".venv",
        "env",
        ".env",
        ".next",
        ".nuxt",
        "coverage",
        ".coverage",
        ".tox",
        ".eggs",
        "*.egg-info",
        ".DS_Store",
        "Thumbs.db",
    ];
    
    // Combine default and custom exclude patterns
    let mut exclude_set = HashSet::new();
    for pattern in &default_excludes {
        exclude_set.insert(pattern.to_string());
    }
    if let Some(custom_patterns) = exclude_patterns {
        for pattern in custom_patterns {
            exclude_set.insert(pattern.clone());
        }
    }
    
    // Recursive directory traversal
    traverse_directory_recursive(
        base_path,
        base_path,
        &exclude_set,
        include_hidden,
        max_depth,
        0,
        &mut visited_dirs,
        &mut all_paths,
    )?;
    
    Ok(all_paths)
}

/// Recursive helper function for directory traversal
fn traverse_directory_recursive(
    base_path: &Path,
    current_path: &Path,
    exclude_patterns: &HashSet<String>,
    include_hidden: bool,
    max_depth: Option<usize>,
    current_depth: usize,
    visited_dirs: &mut HashSet<PathBuf>,
    results: &mut Vec<PathBuf>,
) -> AppResult<()> {
    // Check depth limit
    if let Some(max) = max_depth {
        if current_depth > max {
            return Ok(());
        }
    }
    
    // Avoid infinite loops with symlinks
    let canonical_path = match current_path.canonicalize() {
        Ok(p) => p,
        Err(_) => return Ok(()), // Skip if we can't canonicalize
    };
    
    if !visited_dirs.insert(canonical_path.clone()) {
        return Ok(()); // Already visited this directory
    }
    
    // Read directory entries
    let entries = match std::fs::read_dir(current_path) {
        Ok(entries) => entries,
        Err(e) => {
            debug!("Failed to read directory {:?}: {}", current_path, e);
            return Ok(()); // Skip directories we can't read
        }
    };
    
    for entry in entries {
        let entry = match entry {
            Ok(e) => e,
            Err(_) => continue, // Skip problematic entries
        };
        
        let path = entry.path();
        let file_name = match path.file_name() {
            Some(name) => name.to_string_lossy().to_string(),
            None => continue,
        };
        
        // Check if we should skip hidden files/directories
        if !include_hidden && file_name.starts_with('.') {
            continue;
        }
        
        // Check exclude patterns
        let should_exclude = exclude_patterns.iter().any(|pattern| {
            // Simple pattern matching (could be enhanced with glob patterns)
            if pattern.contains('*') {
                // Handle simple wildcard patterns like "*.egg-info"
                if let Some(suffix) = pattern.strip_prefix('*') {
                    return file_name.ends_with(suffix);
                }
                if let Some(prefix) = pattern.strip_suffix('*') {
                    return file_name.starts_with(prefix);
                }
            }
            // Exact match
            file_name == *pattern
        });
        
        if should_exclude {
            continue;
        }
        
        let file_type = match entry.file_type() {
            Ok(ft) => ft,
            Err(_) => continue,
        };
        
        if file_type.is_file() {
            // Add file to results
            results.push(path.clone());
        } else if file_type.is_dir() {
            // Recursively traverse subdirectory
            traverse_directory_recursive(
                base_path,
                &path,
                exclude_patterns,
                include_hidden,
                max_depth,
                current_depth + 1,
                visited_dirs,
                results,
            )?;
        }
        // Skip symlinks and other special files
    }
    
    Ok(())
}

/// On-demand directory tree generation utility for processors
/// This function provides a simple interface for processors to generate directory trees
/// without requiring a separate workflow stage
pub async fn get_directory_tree_for_processor(
    project_directory: &str,
    excluded_paths: Option<&[String]>,
) -> AppResult<String> {
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
