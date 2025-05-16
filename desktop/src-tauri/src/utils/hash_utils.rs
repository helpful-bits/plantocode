use blake2b_simd::Params;
use std::path::Path;
use std::fs;

use crate::error::{AppError, AppResult};

/// Hash a string using Blake2b
pub fn hash_string(input: &str) -> String {
    let hash = Params::new()
        .hash_length(16)
        .hash(input.as_bytes());
        
    hash.to_hex().to_string()
}

/// Hash a file using Blake2b
pub fn hash_file(path: impl AsRef<Path>) -> AppResult<String> {
    let path = path.as_ref();
    
    // Read the file
    let content = fs::read(path).map_err(|e| {
        AppError::FileSystemError(format!(
            "Failed to read file {}: {}",
            path.display(),
            e
        ))
    })?;
    
    // Hash the content
    let hash = Params::new()
        .hash_length(16)
        .hash(&content);
        
    Ok(hash.to_hex().to_string())
}

/// Generate a project hash based on the directory path
pub fn generate_project_hash(directory: impl AsRef<Path>) -> String {
    let directory = directory.as_ref();
    let directory_str = directory.to_string_lossy();
    
    hash_string(&directory_str)
}