use std::path::{Path, PathBuf};

pub fn to_absolute_path(candidate: &str, project_directory: &str) -> PathBuf {
    let p = Path::new(candidate);
    if p.is_absolute() { 
        p.to_path_buf() 
    } else { 
        Path::new(project_directory).join(p) 
    }
}