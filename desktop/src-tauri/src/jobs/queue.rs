use log::{debug, error, info, warn};
use std::collections::{HashMap, VecDeque};
use std::sync::{Arc, Mutex};
use tokio::sync::{OnceCell, Semaphore, mpsc, oneshot};

use crate::error::{AppError, AppResult};
use crate::jobs::types::Job;

const DEFAULT_CONCURRENT_JOBS: usize = 20;

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
        delay_ms: Option<u64>, // Optional delay in milliseconds
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
    pub fn new() -> Self {
        let (tx, rx) = mpsc::channel(100);
        let job_permits = Arc::new(Semaphore::new(DEFAULT_CONCURRENT_JOBS));
        let retry_counts = Arc::new(Mutex::new(HashMap::new()));

        log::info!(
            "Job queue initialized with {} concurrent job slots",
            DEFAULT_CONCURRENT_JOBS
        );

        // Spawn a task to process queue messages
        let queue_processor = JobQueueProcessor::new(rx);
        tokio::spawn(queue_processor.run());

        Self {
            tx,
            job_permits,
            retry_counts,
            max_concurrent_jobs: DEFAULT_CONCURRENT_JOBS,
        }
    }

    /// Enqueue a job
    pub async fn enqueue(&self, job: Job, priority: JobPriority) -> AppResult<()> {
        let (response_tx, response_rx) = oneshot::channel();

        self.tx
            .send(QueueMessage::Enqueue {
                job,
                priority,
                delay_ms: None,
                response_tx,
            })
            .await
            .map_err(|_| AppError::JobError("Failed to send job to queue".to_string()))?;

        response_rx
            .await
            .map_err(|_| AppError::JobError("Failed to receive response from queue".to_string()))?
    }

    /// Enqueue a job with a delay
    pub async fn enqueue_with_delay(
        &self,
        job: Job,
        priority: JobPriority,
        delay_ms: u64,
    ) -> AppResult<()> {
        let (response_tx, response_rx) = oneshot::channel();

        self.tx
            .send(QueueMessage::Enqueue {
                job,
                priority,
                delay_ms: Some(delay_ms),
                response_tx,
            })
            .await
            .map_err(|_| AppError::JobError("Failed to send job to queue".to_string()))?;

        response_rx
            .await
            .map_err(|_| AppError::JobError("Failed to receive response from queue".to_string()))?
    }

    /// Dequeue a job
    pub async fn dequeue(&self) -> Option<Job> {
        let (response_tx, response_rx) = oneshot::channel();

        if self
            .tx
            .send(QueueMessage::Dequeue { response_tx })
            .await
            .is_err()
        {
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

        self.tx
            .send(QueueMessage::CancelJob {
                job_id,
                response_tx,
            })
            .await
            .map_err(|_| {
                AppError::JobError("Failed to send cancel job message to queue".to_string())
            })?;

        response_rx
            .await
            .map_err(|_| AppError::JobError("Failed to receive response from queue".to_string()))?
    }

    /// Cancel all jobs for a session
    pub async fn cancel_session_jobs(&self, session_id: String) -> AppResult<usize> {
        let (response_tx, response_rx) = oneshot::channel();

        self.tx
            .send(QueueMessage::CancelSessionJobs {
                session_id,
                response_tx,
            })
            .await
            .map_err(|_| {
                AppError::JobError(
                    "Failed to send cancel session jobs message to queue".to_string(),
                )
            })?;

        response_rx
            .await
            .map_err(|_| AppError::JobError("Failed to receive response from queue".to_string()))?
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
        let mut retry_counts = self.retry_counts.lock().map_err(|e| {
            AppError::InternalError(format!("Failed to acquire retry_counts lock: {}", e))
        })?;
        let count = retry_counts.entry(job_id.to_string()).or_insert(0);
        *count += 1;
        Ok(*count)
    }

    /// Get the retry count for a job
    pub fn get_retry_count(&self, job_id: &str) -> AppResult<u32> {
        let retry_counts = self.retry_counts.lock().map_err(|e| {
            AppError::InternalError(format!("Failed to acquire retry_counts lock: {}", e))
        })?;
        Ok(*retry_counts.get(job_id).unwrap_or(&0))
    }

    /// Reset the retry count for a job
    pub fn reset_retry_count(&self, job_id: &str) -> AppResult<()> {
        let mut retry_counts = self.retry_counts.lock().map_err(|e| {
            AppError::InternalError(format!("Failed to acquire retry_counts lock: {}", e))
        })?;
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
        let mut last_attention_job_check = std::time::SystemTime::now();
        let attention_job_check_interval = std::time::Duration::from_secs(300); // Check every 5 minutes

        while let Some(msg) = self.rx.recv().await {
            // Periodically check for jobs requiring attention
            let now = std::time::SystemTime::now();
            if now
                .duration_since(last_attention_job_check)
                .unwrap_or_default()
                >= attention_job_check_interval
            {
                self.check_for_jobs_requiring_attention();
                last_attention_job_check = now;
            }
            match msg {
                QueueMessage::Enqueue {
                    mut job,
                    priority,
                    delay_ms,
                    response_tx,
                } => {
                    let job_id = job.id().to_string();

                    // Set process_after timestamp if delay is specified
                    if let Some(delay) = delay_ms {
                        let current_timestamp = std::time::SystemTime::now()
                            .duration_since(std::time::UNIX_EPOCH)
                            .unwrap_or_default()
                            .as_millis() as i64;
                        job.process_after = Some(current_timestamp + delay as i64);
                        debug!(
                            "Enqueued job {} with priority {:?} and delay of {}ms",
                            job_id, priority, delay
                        );
                    } else {
                        debug!("Enqueued job {} with priority {:?}", job_id, priority);
                    }

                    self.queues[priority as usize].push_back(job);
                    let _ = response_tx.send(Ok(()));
                }
                QueueMessage::Dequeue { response_tx } => {
                    let current_timestamp = std::time::SystemTime::now()
                        .duration_since(std::time::UNIX_EPOCH)
                        .unwrap_or_default()
                        .as_millis() as i64;

                    // Helper function to find and remove the first eligible job from a queue
                    let find_eligible_job =
                        |queue: &mut std::collections::VecDeque<Job>| -> Option<Job> {
                            let mut index = None;
                            for (i, job) in queue.iter().enumerate() {
                                if let Some(process_after) = job.process_after {
                                    if current_timestamp >= process_after {
                                        index = Some(i);
                                        break;
                                    } else {
                                        // Job's process_after is in the future, possibly due to clock drift or race condition
                                        // We'll requeue it with a very short delay instead of processing now
                                        let time_diff = process_after - current_timestamp;
                                        if time_diff > 0 && time_diff < 60000 {
                                            // Within 1 minute
                                            debug!(
                                                "Job {} not ready for processing (process_after in {} ms), will be eligible soon",
                                                job.id(),
                                                time_diff
                                            );
                                        }
                                    }
                                } else {
                                    // Job with no delay is always eligible
                                    index = Some(i);
                                    break;
                                }
                            }

                            if let Some(i) = index {
                                queue.remove(i)
                            } else {
                                None
                            }
                        };

                    // Try to dequeue a job with the highest priority first, filtering by process_after
                    let job = find_eligible_job(&mut self.queues[JobPriority::High as usize])
                        .or_else(|| {
                            find_eligible_job(&mut self.queues[JobPriority::Normal as usize])
                        })
                        .or_else(|| find_eligible_job(&mut self.queues[JobPriority::Low as usize]));

                    if let Some(ref job) = job {
                        debug!("Dequeued job {}", job.id());
                    }

                    let _ = response_tx.send(job);
                }
                QueueMessage::CancelJob {
                    job_id,
                    response_tx,
                } => {
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
                }
                QueueMessage::CancelSessionJobs {
                    session_id,
                    response_tx,
                } => {
                    let mut removed_count = 0;

                    // Remove jobs for the session from all priority queues
                    for queue in &mut self.queues {
                        // We need to collect indices first to avoid modifying the collection while iterating
                        let indices_to_remove: Vec<usize> = queue
                            .iter()
                            .enumerate()
                            .filter(|(_, job)| job.session_id() == session_id)
                            .map(|(idx, _)| idx)
                            .collect();

                        // Remove the jobs in reverse order to maintain correct indices
                        for idx in indices_to_remove.into_iter().rev() {
                            if let Some(job) = queue.remove(idx) {
                                debug!(
                                    "Cancelled job {} from queue for session {}",
                                    job.id(),
                                    session_id
                                );
                                removed_count += 1;
                            }
                        }
                    }

                    debug!(
                        "Cancelled {} jobs from queue for session {}",
                        removed_count, session_id
                    );
                    let _ = response_tx.send(Ok(removed_count));
                }
                QueueMessage::Shutdown => {
                    info!("Shutting down job queue");
                    break;
                }
            }
        }
    }

    /// Check for jobs that have been in the queue for an excessively long time
    fn check_for_jobs_requiring_attention(&self) {
        let current_timestamp = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_millis() as i64;

        let attention_threshold_ms = 30 * 60 * 1000; // 30 minutes

        for (priority_level, queue) in self.queues.iter().enumerate() {
            for job in queue.iter() {
                // Use created_at timestamp to check age
                let created_at_ms = job.created_at;
                let age_ms = current_timestamp - created_at_ms;

                if age_ms > attention_threshold_ms {
                    let priority_name = match priority_level {
                        0 => "Low",
                        1 => "Normal",
                        2 => "High",
                        _ => "Unknown",
                    };

                    warn!(
                        "Job {} requires attention in {} priority queue for {} minutes. Consider investigating.",
                        job.id(),
                        priority_name,
                        age_ms / (60 * 1000)
                    );
                }
            }
        }
    }
}

// Create a static global instance of the job queue
pub static JOB_QUEUE: OnceCell<Arc<JobQueue>> = OnceCell::const_new();

/// Initialize the job queue
pub async fn init_job_queue() -> AppResult<Arc<JobQueue>> {
    let queue = Arc::new(JobQueue::new());

    // Store the queue in the global static
    if let Err(_) = JOB_QUEUE.set(queue.clone()) {
        return Err(AppError::JobError(
            "Failed to initialize job queue".to_string(),
        ));
    }

    Ok(queue)
}

/// Get the job queue with lazy init + bounded wait to eliminate race conditions
pub async fn get_job_queue() -> AppResult<Arc<JobQueue>> {
    // Fast path: if already initialized, return immediately
    if let Some(queue) = JOB_QUEUE.get() {
        return Ok(queue.clone());
    }

    // Attempt lazy initialization once - safe due to OnceCell semantics
    tracing::debug!("Job queue accessor: attempting lazy initialization");
    match init_job_queue().await {
        Ok(queue) => {
            tracing::debug!("Job queue accessor: lazy initialization succeeded");
            return Ok(queue);
        }
        Err(e) => {
            // If another task raced and won, JOB_QUEUE may now be set
            tracing::warn!(
                "Job queue accessor: lazy init attempt returned error: {e:?}, will fallback to wait"
            );
        }
    }

    // Bounded wait (5s) in case initialization is still in progress elsewhere
    for i in 0..50 {
        if let Some(queue) = JOB_QUEUE.get() {
            tracing::debug!(
                "Job queue accessor: queue became available during wait (iteration {i})"
            );
            return Ok(queue.clone());
        }
        tokio::time::sleep(tokio::time::Duration::from_millis(100)).await;
    }

    Err(AppError::JobError(
        "Job queue not initialized (timeout after 5s)".to_string(),
    ))
}
