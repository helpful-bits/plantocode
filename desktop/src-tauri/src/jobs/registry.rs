use std::sync::Arc;
use log::debug;
use tokio::sync::{Mutex, OnceCell};

use crate::error::{AppError, AppResult};
use crate::jobs::processor_trait::JobProcessor;
use crate::jobs::types::Job;

/// Registry for job processors
#[derive(Default)]
pub struct JobRegistry {
    processors: Mutex<Vec<Arc<dyn JobProcessor>>>,
}

impl JobRegistry {
    /// Create a new job registry
    pub fn new() -> Self {
        Self {
            processors: Mutex::new(Vec::new()),
        }
    }
    
    /// Register a processor
    pub async fn register(&self, processor: Arc<dyn JobProcessor>) {
        let name = processor.name();
        debug!("Registering job processor: {}", name);
        
        let mut processors = self.processors.lock().await;
        processors.push(processor);
    }
    
    /// Find a processor for a job
    pub async fn find_processor(&self, job: &Job) -> AppResult<Arc<dyn JobProcessor>> {
        let processors = self.processors.lock().await;
        
        for processor in processors.iter() {
            if processor.can_handle(job) {
                return Ok(processor.clone());
            }
        }
        
        // Create a more specific error with job_type as a String
        Err(AppError::JobError(format!("No processor found for job type: {}", job.job_type)))
    }
}

// Create a static global instance of the job registry
pub static JOB_REGISTRY: OnceCell<Arc<JobRegistry>> = OnceCell::const_new();

/// Initialize the job registry
pub async fn init_job_registry() -> AppResult<Arc<JobRegistry>> {
    let registry = Arc::new(JobRegistry::new());
    
    // Store the registry in the global static
    if let Err(_) = JOB_REGISTRY.set(registry.clone()) {
        return Err(AppError::JobError("Failed to initialize job registry".to_string()));
    }
    
    Ok(registry)
}

/// Get the job registry
pub async fn get_job_registry() -> AppResult<Arc<JobRegistry>> {
    match JOB_REGISTRY.get() {
        Some(registry) => Ok(registry.clone()),
        None => {
            // Initialize the registry if it doesn't exist
            init_job_registry().await
        }
    }
}