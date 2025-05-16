use std::sync::{Arc, Mutex};
use std::collections::{VecDeque, HashMap};
use log::{info, debug, error};
use tokio::sync::{mpsc, oneshot, Semaphore, OnceCell};

use crate::error::{AppError, AppResult};
use crate::jobs::types::Job;

/// Priority levels for jobs
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord)]
pub enum JobPriority {
    Low = 0,
    Normal = 1,
    High = 2,
}

impl Default for JobPriority {
    fn default() -> Self {
        JobPriority::Normal
    }
}

/// Message sent to the job queue
#[derive(Debug)]
pub enum QueueMessage {
    // Add a new job to the queue
    Enqueue {
        job: Job,
        priority: JobPriority,
        response_tx: oneshot::Sender<AppResult<()>>,
    },
    // Get the next job from the queue
    Dequeue {
        response_tx: oneshot::Sender<Option<Job>>,
    },
    // Cancel a specific job from the queue
    CancelJob {
        job_id: String,
        response_tx: oneshot::Sender<AppResult<bool>>,
    },
    // Cancel all jobs for a session from the queue
    CancelSessionJobs {
        session_id: String,
        response_tx: oneshot::Sender<AppResult<usize>>,
    },
    // Shutdown the queue
    Shutdown,
}

/// Job queue implementation
pub struct JobQueue {
    // Channel to send messages to the queue
    tx: mpsc::Sender<QueueMessage>,
    // Semaphore to limit concurrent jobs
    job_permits: Arc<Semaphore>,
    // Map of job IDs to retry counts
    retry_counts: Arc<Mutex<HashMap<String, u32>>>,
    // Maximum number of concurrent jobs
    max_concurrent_jobs: usize,
}

impl JobQueue {
    /// Create a new job queue
    pub fn new(max_concurrent_jobs: usize) -> Self {
        let (tx, rx) = mpsc::channel(100);
        let job_permits = Arc::new(Semaphore::new(max_concurrent_jobs));
        let retry_counts = Arc::new(Mutex::new(HashMap::new()));
        
        // Spawn a task to process queue messages
        let queue_processor = JobQueueProcessor::new(rx);
        tokio::spawn(queue_processor.run());
        
        Self {
            tx,
            job_permits,
            retry_counts,
            max_concurrent_jobs,
        }
    }
    
    /// Enqueue a job
    pub async fn enqueue(&self, job: Job, priority: JobPriority) -> AppResult<()> {
        let (response_tx, response_rx) = oneshot::channel();
        
        self.tx.send(QueueMessage::Enqueue {
            job,
            priority,
            response_tx,
        }).await.map_err(|_| {
            AppError::JobError("Failed to send job to queue".to_string())
        })?;
        
        response_rx.await.map_err(|_| {
            AppError::JobError("Failed to receive response from queue".to_string())
        })?
    }
    
    /// Dequeue a job
    pub async fn dequeue(&self) -> Option<Job> {
        let (response_tx, response_rx) = oneshot::channel();
        
        if self.tx.send(QueueMessage::Dequeue { response_tx }).await.is_err() {
            error!("Failed to send dequeue message to queue");
            return None;
        }
        
        match response_rx.await {
            Ok(job) => job,
            Err(_) => {
                error!("Failed to receive response from queue");
                None
            }
        }
    }
    
    /// Shutdown the queue
    pub async fn shutdown(&self) {
        let _ = self.tx.send(QueueMessage::Shutdown).await;
    }
    
    /// Cancel a job by ID
    pub async fn cancel_job(&self, job_id: String) -> AppResult<bool> {
        let (response_tx, response_rx) = oneshot::channel();
        
        self.tx.send(QueueMessage::CancelJob {
            job_id,
            response_tx,
        }).await.map_err(|_| {
            AppError::JobError("Failed to send cancel job message to queue".to_string())
        })?;
        
        response_rx.await.map_err(|_| {
            AppError::JobError("Failed to receive response from queue".to_string())
        })?
    }
    
    /// Cancel all jobs for a session
    pub async fn cancel_session_jobs(&self, session_id: String) -> AppResult<usize> {
        let (response_tx, response_rx) = oneshot::channel();
        
        self.tx.send(QueueMessage::CancelSessionJobs {
            session_id,
            response_tx,
        }).await.map_err(|_| {
            AppError::JobError("Failed to send cancel session jobs message to queue".to_string())
        })?;
        
        response_rx.await.map_err(|_| {
            AppError::JobError("Failed to receive response from queue".to_string())
        })?
    }
    
    /// Get a job permit
    pub async fn get_permit(&self) -> Option<tokio::sync::OwnedSemaphorePermit> {
        match self.job_permits.clone().acquire_owned().await {
            Ok(permit) => Some(permit),
            Err(_) => None,
        }
    }
    
    /// Increment the retry count for a job
    pub fn increment_retry_count(&self, job_id: &str) -> AppResult<u32> {
        let mut retry_counts = self.retry_counts.lock()
            .map_err(|e| AppError::InternalError(format!("Failed to acquire retry_counts lock: {}", e)))?;
        let count = retry_counts.entry(job_id.to_string()).or_insert(0);
        *count += 1;
        Ok(*count)
    }
    
    /// Get the retry count for a job
    pub fn get_retry_count(&self, job_id: &str) -> AppResult<u32> {
        let retry_counts = self.retry_counts.lock()
            .map_err(|e| AppError::InternalError(format!("Failed to acquire retry_counts lock: {}", e)))?;
        Ok(*retry_counts.get(job_id).unwrap_or(&0))
    }
    
    /// Reset the retry count for a job
    pub fn reset_retry_count(&self, job_id: &str) -> AppResult<()> {
        let mut retry_counts = self.retry_counts.lock()
            .map_err(|e| AppError::InternalError(format!("Failed to acquire retry_counts lock: {}", e)))?;
        retry_counts.remove(job_id);
        Ok(())
    }
    
    /// Get the maximum number of concurrent jobs allowed
    pub async fn get_concurrency_limit(&self) -> usize {
        self.max_concurrent_jobs
    }
}

/// Internal processor for the job queue
struct JobQueueProcessor {
    rx: mpsc::Receiver<QueueMessage>,
    // Queue of jobs by priority
    queues: [VecDeque<Job>; 3],
}

impl JobQueueProcessor {
    /// Create a new job queue processor
    fn new(rx: mpsc::Receiver<QueueMessage>) -> Self {
        Self {
            rx,
            queues: [VecDeque::new(), VecDeque::new(), VecDeque::new()],
        }
    }
    
    /// Run the queue processor
    async fn run(mut self) {
        while let Some(msg) = self.rx.recv().await {
            match msg {
                QueueMessage::Enqueue { job, priority, response_tx } => {
                    let job_id = job.id().to_string();
                    self.queues[priority as usize].push_back(job);
                    debug!("Enqueued job {} with priority {:?}", job_id, priority);
                    let _ = response_tx.send(Ok(()));
                },
                QueueMessage::Dequeue { response_tx } => {
                    // Try to dequeue a job with the highest priority first
                    let job = self.queues[JobPriority::High as usize]
                        .pop_front()
                        .or_else(|| self.queues[JobPriority::Normal as usize].pop_front())
                        .or_else(|| self.queues[JobPriority::Low as usize].pop_front());
                        
                    if let Some(ref job) = job {
                        debug!("Dequeued job {}", job.id());
                    }
                    
                    let _ = response_tx.send(job);
                },
                QueueMessage::CancelJob { job_id, response_tx } => {
                    let mut found = false;
                    
                    // Check all priority queues for the job
                    for queue in &mut self.queues {
                        let index = queue.iter().position(|job| job.id() == job_id.as_str());
                        
                        if let Some(idx) = index {
                            queue.remove(idx);
                            found = true;
                            debug!("Cancelled job {} from queue", job_id);
                            break;
                        }
                    }
                    
                    let _ = response_tx.send(Ok(found));
                },
                QueueMessage::CancelSessionJobs { session_id, response_tx } => {
                    let mut removed_count = 0;
                    
                    // Remove jobs for the session from all priority queues
                    for queue in &mut self.queues {
                        // We need to collect indices first to avoid modifying the collection while iterating
                        let indices_to_remove: Vec<usize> = queue.iter()
                            .enumerate()
                            .filter(|(_, job)| job.session_id() == session_id)
                            .map(|(idx, _)| idx)
                            .collect();
                        
                        // Remove the jobs in reverse order to maintain correct indices
                        for idx in indices_to_remove.into_iter().rev() {
                            if let Some(job) = queue.remove(idx) {
                                debug!("Cancelled job {} from queue for session {}", job.id(), session_id);
                                removed_count += 1;
                            }
                        }
                    }
                    
                    debug!("Cancelled {} jobs from queue for session {}", removed_count, session_id);
                    let _ = response_tx.send(Ok(removed_count));
                },
                QueueMessage::Shutdown => {
                    info!("Shutting down job queue");
                    break;
                }
            }
        }
    }
}

// Create a static global instance of the job queue
pub static JOB_QUEUE: OnceCell<Arc<JobQueue>> = OnceCell::const_new();

/// Initialize the job queue
pub async fn init_job_queue(max_concurrent_jobs: usize) -> AppResult<Arc<JobQueue>> {
    let queue = Arc::new(JobQueue::new(max_concurrent_jobs));
    
    // Store the queue in the global static
    if let Err(_) = JOB_QUEUE.set(queue.clone()) {
        return Err(AppError::JobError("Failed to initialize job queue".to_string()));
    }
    
    Ok(queue)
}

/// Get the job queue
pub async fn get_job_queue() -> AppResult<Arc<JobQueue>> {
    match JOB_QUEUE.get() {
        Some(queue) => Ok(queue.clone()),
        None => Err(AppError::JobError("Job queue not initialized".to_string())),
    }
}