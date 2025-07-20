use std::fs::{File, OpenOptions};
use std::io::Write;
use std::path::Path;
use chrono::{DateTime, Utc};
use serde_json::Value;
use log::{debug, error, info, warn};

pub struct StreamDebugLogger {
    provider: String,
    request_id: String,
    file_path: String,
}

impl StreamDebugLogger {
    pub fn new(provider: &str, request_id: &str) -> Self {
        let provider_clean = provider.to_lowercase();
        let desktop_root = std::env::current_dir().unwrap_or_else(|_| std::path::PathBuf::from("."));
        let streams_dir = desktop_root.join("gen").join("streams");
        let file_path = streams_dir.join(format!("stream_debug_{}_{}.log", provider_clean, request_id));
        
        // Ensure the gen/streams directory exists
        if let Err(e) = std::fs::create_dir_all(&streams_dir) {
            error!("Failed to create gen/streams directory: {}", e);
        } else {
            info!("Stream debug logs will be stored at: {}", file_path.display());
        }
        
        Self {
            provider: provider_clean,
            request_id: request_id.to_string(),
            file_path: file_path.to_string_lossy().to_string(),
        }
    }
    
    pub fn log_chunk(&self, chunk_data: &[u8]) {
        if !log::log_enabled!(log::Level::Debug) {
            return;
        }
        
        // Write raw chunk data directly without any formatting
        if let Err(e) = self.write_to_file_raw(chunk_data) {
            error!("Failed to write stream chunk to debug log: {}", e);
        }
    }
    
    
    pub fn log_error(&self, error_msg: &str) {
        if !log::log_enabled!(log::Level::Debug) {
            return;
        }
        
        let log_entry = format!(
            "ERROR: {}\n",
            error_msg
        );
        
        if let Err(e) = self.write_to_file(&log_entry) {
            error!("Failed to write error to debug log: {}", e);
        }
    }
    
    pub fn log_stream_start(&self) {
        if !log::log_enabled!(log::Level::Debug) {
            return;
        }
        
        let timestamp = Utc::now().to_rfc3339();
        let log_entry = format!(
            "[{}] STREAM_START: Beginning stream processing\n",
            timestamp
        );
        
        if let Err(e) = self.write_to_file(&log_entry) {
            error!("Failed to write stream start to debug log: {}", e);
        }
    }
    
    pub fn log_stream_end(&self) {
        if !log::log_enabled!(log::Level::Debug) {
            return;
        }
        
        let timestamp = Utc::now().to_rfc3339();
        let log_entry = format!(
            "[{}] STREAM_END: Stream processing completed\n",
            timestamp
        );
        
        if let Err(e) = self.write_to_file(&log_entry) {
            error!("Failed to write stream end to debug log: {}", e);
        }
    }
    
    fn write_to_file(&self, content: &str) -> std::io::Result<()> {
        let mut file = OpenOptions::new()
            .create(true)
            .append(true)
            .open(&self.file_path)?;
        
        file.write_all(content.as_bytes())?;
        file.flush()?;
        
        Ok(())
    }
    
    fn write_to_file_raw(&self, content: &[u8]) -> std::io::Result<()> {
        let mut file = OpenOptions::new()
            .create(true)
            .append(true)
            .open(&self.file_path)?;
        
        file.write_all(content)?;
        file.flush()?;
        
        Ok(())
    }
}

pub fn create_stream_debug_logger(provider: &str, request_id: &str) -> StreamDebugLogger {
    StreamDebugLogger::new(provider, request_id)
}