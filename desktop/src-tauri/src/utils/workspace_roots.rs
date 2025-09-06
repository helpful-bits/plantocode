use crate::db_utils::settings_repository::SettingsRepository;
use crate::utils::hash_utils::hash_string;
use crate::error::{AppResult, AppError};
use serde_json::Value;
use std::{fs, path::{Path, PathBuf}};
use std::sync::Arc;
use std::collections::HashSet;
use tauri::Manager;

pub async fn resolve_workspace_roots(app_handle: &tauri::AppHandle, project_directory: &str) -> AppResult<Vec<PathBuf>> {
    let main = fs::canonicalize(project_directory)?;
    let mut roots: Vec<PathBuf> = vec![main.clone()];
    let project_hash = hash_string(project_directory);
    let key = format!("external_folders:{}", project_hash);
    
    // Get SettingsRepository from app state
    let repo = app_handle
        .state::<Arc<SettingsRepository>>()
        .inner()
        .clone();
        
    if let Some(json) = repo.get_value(&key).await? {
        if let Ok(v) = serde_json::from_str::<Vec<String>>(&json) {
            for s in v {
                if let Ok(p) = fs::canonicalize(&s) {
                    if p.is_dir() && p != main { roots.push(p); }
                }
            }
        }
    }
    // Monorepo detection (Node workspaces + common folders)
    let detected = detect_monorepo_roots(&main)?;
    roots.extend(detected);

    // Dedup, preserve order
    let mut seen = std::collections::HashSet::new();
    roots.retain(|p| seen.insert(p.to_string_lossy().to_string()));
    Ok(roots)
}

fn collect_directory_tree(path: &Path, depth: usize, max_depth: usize, seen: &mut HashSet<String>, results: &mut Vec<PathBuf>) {
    if depth > max_depth {
        return;
    }
    
    let path_str = path.to_string_lossy().to_string();
    if !seen.insert(path_str.clone()) {
        return;
    }
    
    results.push(path.to_path_buf());
    
    if let Ok(entries) = fs::read_dir(path) {
        for entry in entries.flatten() {
            let entry_path = entry.path();
            if entry_path.is_dir() {
                let dir_name = entry_path.file_name()
                    .and_then(|n| n.to_str())
                    .unwrap_or("");
                
                // Skip common non-source directories to reduce noise
                if dir_name.starts_with('.') 
                    || dir_name == "node_modules" 
                    || dir_name == "target"
                    || dir_name == "dist"
                    || dir_name == "build"
                    || dir_name == ".git"
                    || dir_name == "__pycache__"
                    || dir_name == ".next"
                    || dir_name == ".venv"
                    || dir_name == "venv" {
                    continue;
                }
                
                collect_directory_tree(&entry_path, depth + 1, max_depth, seen, results);
            }
        }
    }
}

pub async fn list_root_level_folders(app_handle: &tauri::AppHandle, project_directory: &str) -> AppResult<Vec<PathBuf>> {
    let mut results = Vec::new();
    let mut seen = HashSet::new();
    
    // Use depth of 4 to give LLM better context about project structure
    const MAX_DEPTH: usize = 4;
    
    if let Ok(main) = fs::canonicalize(project_directory) {
        if main.is_dir() {
            collect_directory_tree(&main, 0, MAX_DEPTH, &mut seen, &mut results);
        }
    }
    
    let project_hash = hash_string(project_directory);
    let key = format!("external_folders:{}", project_hash);
    
    let repo = app_handle
        .state::<Arc<SettingsRepository>>()
        .inner()
        .clone();
        
    if let Some(json) = repo.get_value(&key).await? {
        if let Ok(external_folders) = serde_json::from_str::<Vec<String>>(&json) {
            for folder_path in external_folders {
                if let Ok(folder_root) = fs::canonicalize(&folder_path) {
                    if folder_root.is_dir() {
                        collect_directory_tree(&folder_root, 0, MAX_DEPTH, &mut seen, &mut results);
                    }
                }
            }
        }
    }
    
    Ok(results)
}

fn detect_monorepo_roots(main: &Path) -> AppResult<Vec<PathBuf>> {
    let mut out = vec![];
    // package.json workspaces
    let pkg = main.join("package.json");
    if pkg.exists() {
        if let Ok(txt) = fs::read_to_string(&pkg) {
            if let Ok(v) = serde_json::from_str::<Value>(&txt) {
                // workspaces can be array or {packages:[]}
                let patterns = v.get("workspaces")
                    .and_then(|ws| if ws.is_array() { Some(ws.clone()) } else { ws.get("packages").cloned() })
                    .and_then(|arr| arr.as_array().cloned());
                if let Some(arr) = patterns {
                    for pat in arr {
                        if let Some(pat) = pat.as_str() {
                            // very conservative glob: only one-level wildcards like "packages/*"
                            if let Some((base, _star)) = pat.split_once("/*") {
                                let base_dir = main.join(base);
                                if base_dir.is_dir() {
                                    if let Ok(read) = fs::read_dir(&base_dir) {
                                        for e in read.flatten() {
                                            let p = e.path();
                                            if p.is_dir() { out.push(p); }
                                        }
                                    }
                                }
                            } else {
                                let p = main.join(pat);
                                if p.is_dir() { out.push(p); }
                            }
                        }
                    }
                }
            }
        }
    }
    // Common patterns
    for name in ["packages", "apps", "libs"] {
        let base = main.join(name);
        if base.is_dir() {
            if let Ok(read) = fs::read_dir(&base) {
                for e in read.flatten() {
                    let p = e.path();
                    if p.is_dir() { out.push(p); }
                }
            }
        }
    }
    Ok(out)
}