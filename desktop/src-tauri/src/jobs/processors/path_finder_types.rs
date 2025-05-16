use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct PathFinderResultFile {
    pub path: String,
    pub relevance: Option<String>,
    pub explanation: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Default)]
pub struct PathFinderResult {
    pub analysis: Option<String>,
    pub primary_files: Vec<PathFinderResultFile>,
    pub secondary_files: Vec<PathFinderResultFile>,
    pub potential_files: Vec<PathFinderResultFile>,
    pub unverified_paths: Vec<PathFinderResultFile>,
    pub overview: Option<String>,
    pub all_files: Vec<String>,
    pub files_by_directory: HashMap<String, Vec<String>>,
    pub paths: Vec<String>,
    pub count: usize,
}

impl PathFinderResult {
    pub fn new() -> Self {
        Self {
            analysis: None,
            primary_files: Vec::new(),
            secondary_files: Vec::new(),
            potential_files: Vec::new(),
            unverified_paths: Vec::new(),
            overview: None,
            all_files: Vec::new(),
            files_by_directory: HashMap::new(),
            paths: Vec::new(),
            count: 0,
        }
    }
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct PathFinderOptions {
    pub include_file_contents: Option<bool>,
    pub max_files_with_content: Option<usize>,
    pub priority_file_types: Option<Vec<String>>,
    pub included_files: Option<Vec<String>>,
    pub excluded_files: Option<Vec<String>>,
}

impl Default for PathFinderOptions {
    fn default() -> Self {
        Self {
            include_file_contents: Some(crate::constants::DEFAULT_PATH_FINDER_INCLUDE_FILE_CONTENTS),
            max_files_with_content: Some(crate::constants::DEFAULT_PATH_FINDER_MAX_FILES_WITH_CONTENT),
            priority_file_types: None,
            included_files: None,
            excluded_files: None,
        }
    }
}