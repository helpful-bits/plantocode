use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct PathFinderResultFile {
    pub path: String,
}

#[derive(Debug, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct PathFinderResult {
    pub all_files: Vec<String>,
    pub paths: Vec<String>,
    pub count: usize,
    pub files_by_directory: HashMap<String, Vec<String>>,
    pub unverified_paths: Vec<String>,
}

impl PathFinderResult {
    pub fn new() -> Self {
        Self {
            all_files: Vec::new(),
            paths: Vec::new(),
            count: 0,
            files_by_directory: HashMap::new(),
            unverified_paths: Vec::new(),
        }
    }
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct PathFinderOptions {
    pub include_file_contents: Option<bool>,
    pub max_files_with_content: Option<usize>,
    pub priority_file_types: Option<Vec<String>>,
    pub included_files: Option<Vec<String>>,
    pub force_excluded_files: Option<Vec<String>>,
}

impl Default for PathFinderOptions {
    fn default() -> Self {
        Self {
            include_file_contents: None, // No defaults - configuration comes from server
            max_files_with_content: None, // No defaults - configuration comes from server
            priority_file_types: None,
            included_files: None,
            force_excluded_files: None,
        }
    }
}
