use std::sync::Arc;
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use std::str::FromStr;
use log::{info, error, debug, warn};
use tauri::{AppHandle, Manager};
use tokio::sync::{mpsc, Mutex, OnceCell};
use tokio::time::interval;

use crate::db_utils::background_job_repository::BackgroundJobRepository;
use crate::error::{AppError, AppResult};
use crate::jobs::dispatcher::process_next_job;
use crate::jobs::queue::{get_job_queue, QueueMessage, JobPriority};
use crate::jobs::types::{Job, JobPayload, JobProcessResult};
use crate::models::TaskType;
use crate::models::BackgroundJob;

/// Message to control the job scheduler
#[derive(Debug)]
enum SchedulerMessage {
    // Start processing jobs
    Start,
    // Pause processing jobs
    Pause,
    // Resume processing jobs
    Resume,
    // Shutdown the scheduler
    Shutdown,
}

/// Job scheduler state
#[derive(Debug)]
enum SchedulerState {
    // Not running
    Stopped,
    // Running and processing jobs
    Running,
    // Running but not processing jobs
    Paused,
}

/// Job scheduler implementation
pub struct JobScheduler {
    // Channel to send control messages to the scheduler
    tx: mpsc::Sender<SchedulerMessage>,
    // Current state of the scheduler
    state: Arc<Mutex<SchedulerState>>,
    // Last time the DB was polled for new jobs (in milliseconds since UNIX epoch)
    last_db_poll_time: Arc<Mutex<u64>>,
    // How often to poll the DB for new jobs (in milliseconds)
    db_poll_interval_ms: u64,
    // Last failure time and consecutive failure count for cool-down logic
    failure_state: Arc<Mutex<FailureState>>,
}

/// Tracks failure state for cool-down logic
#[derive(Debug)]
struct FailureState {
    consecutive_failures: u32,
    last_failure_time: Option<SystemTime>,
    in_cooldown: bool,
}

impl JobScheduler {
    /// Safe duration calculation with overflow protection
    fn safe_duration_as_millis(duration: Duration) -> Result<u64, String> {
        duration.as_millis().try_into().map_err(|_| {
            format!("Duration overflow: {} ms exceeds u64 maximum", duration.as_millis())
        })
    }

    /// Create a new job scheduler
    pub fn new(app_handle: AppHandle, poll_interval: Duration, db_poll_interval_ms: u64) -> Self {
        let (tx, rx) = mpsc::channel(10);
        let state = Arc::new(Mutex::new(SchedulerState::Stopped));
        let current_time = Self::safe_duration_as_millis(
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap_or_default()
        ).unwrap_or_else(|e| {
            error!("Duration calculation overflow at scheduler creation: {}", e);
            0 // Use 0 as fallback timestamp
        });
        let last_db_poll_time = Arc::new(Mutex::new(current_time));
        let failure_state = Arc::new(Mutex::new(FailureState {
            consecutive_failures: 0,
            last_failure_time: None,
            in_cooldown: false,
        }));
        
        // Spawn a task to run the scheduler
        let state_clone = state.clone();
        let last_db_poll_time_clone = last_db_poll_time.clone();
        let failure_state_clone = failure_state.clone();
        tokio::spawn(Self::run(
            rx, 
            app_handle, 
            poll_interval, 
            state_clone,
            last_db_poll_time_clone,
            db_poll_interval_ms,
            failure_state_clone
        ));
        
        Self {
            tx,
            state,
            last_db_poll_time,
            db_poll_interval_ms,
            failure_state,
        }
    }
    
    /// Run the scheduler
    async fn run(
        mut rx: mpsc::Receiver<SchedulerMessage>,
        app_handle: AppHandle,
        poll_interval: Duration,
        state: Arc<Mutex<SchedulerState>>,
        last_db_poll_time: Arc<Mutex<u64>>,
        db_poll_interval_ms: u64,
        failure_state: Arc<Mutex<FailureState>>,
    ) {
        let mut interval = interval(poll_interval);
        
        // Reset any stale acknowledged jobs at startup
        if let Err(e) = Self::reset_stale_acknowledged_jobs(&app_handle).await {
            error!("Error resetting stale acknowledged jobs: {}", e);
        }
        
        loop {
            tokio::select! {
                // Check for control messages
                Some(msg) = rx.recv() => {
                    match msg {
                        SchedulerMessage::Start => {
                            info!("Starting job scheduler");
                            *state.lock().await = SchedulerState::Running;
                        },
                        SchedulerMessage::Pause => {
                            info!("Pausing job scheduler");
                            *state.lock().await = SchedulerState::Paused;
                        },
                        SchedulerMessage::Resume => {
                            info!("Resuming job scheduler");
                            *state.lock().await = SchedulerState::Running;
                        },
                        SchedulerMessage::Shutdown => {
                            info!("Shutting down job scheduler");
                            break;
                        }
                    }
                },
                // Check for interval ticks
                _ = interval.tick() => {
                    // Only process jobs if the scheduler is running
                    if matches!(*state.lock().await, SchedulerState::Running) {
                        // Check if it's time to poll the DB
                        let current_time = Self::safe_duration_as_millis(
                            SystemTime::now()
                                .duration_since(UNIX_EPOCH)
                                .unwrap_or_default()
                        ).unwrap_or_else(|e| {
                            error!("Duration calculation overflow in scheduler loop: {}", e);
                            0 // Use 0 as fallback timestamp, which will force a DB poll
                        });
                        
                        let last_poll_time = *last_db_poll_time.lock().await;
                        // Check if we're in cooldown due to consecutive failures
                        let mut failure_state_guard = failure_state.lock().await;
                        let should_skip_due_to_cooldown = if failure_state_guard.in_cooldown {
                            if let Some(last_failure) = failure_state_guard.last_failure_time {
                                let cooldown_duration = Self::calculate_cooldown_duration(failure_state_guard.consecutive_failures);
                                let elapsed = last_failure.elapsed().unwrap_or_default();
                                
                                if elapsed >= cooldown_duration {
                                    // Cooldown period is over
                                    info!("Cooldown period of {} seconds is over. Resuming job processing.", cooldown_duration.as_secs());
                                    failure_state_guard.in_cooldown = false;
                                    false
                                } else {
                                    let remaining = cooldown_duration.saturating_sub(elapsed);
                                    debug!("Still in cooldown for {} seconds due to {} consecutive failures", remaining.as_secs(), failure_state_guard.consecutive_failures);
                                    true
                                }
                            } else {
                                // No last failure time recorded, exit cooldown
                                failure_state_guard.in_cooldown = false;
                                false
                            }
                        } else {
                            false
                        };
                        drop(failure_state_guard);
                        
                        if should_skip_due_to_cooldown {
                            // Skip processing during cooldown
                            continue;
                        }
                        
                        if current_time - last_poll_time >= db_poll_interval_ms {
                            // It's time to poll the DB for new jobs
                            match Self::fetch_jobs_from_db(&app_handle).await {
                                Ok(fetched_count) => {
                                    if fetched_count > 0 {
                                        debug!("Fetched {} jobs from database", fetched_count);
                                        // Reset failure state on successful DB operation
                                        Self::reset_failure_state(&failure_state).await;
                                        // Reset the interval to process the job immediately
                                        interval.reset();
                                    }
                                },
                                Err(e) => {
                                    error!("Error fetching jobs from database: {}", e);
                                    Self::handle_failure(&failure_state, "Database fetch").await;
                                }
                            }
                            
                            // Update the last poll time
                            *last_db_poll_time.lock().await = current_time;
                        }
                        
                        // Process the next job from the queue
                        match process_next_job(app_handle.clone()).await {
                            Ok(Some(_)) => {
                                // Successfully processed a job, reset failure state and continue immediately
                                Self::reset_failure_state(&failure_state).await;
                                interval.reset();
                            },
                            Ok(None) => {
                                // No jobs to process, wait for the next interval
                            },
                            Err(e) => {
                                error!("Error processing job: {}", e);
                                Self::handle_failure(&failure_state, "Job processing").await;
                            }
                        }
                    }
                }
            }
        }
    }
    
    /// Start the scheduler
    pub async fn start(&self) -> AppResult<()> {
        self.tx.send(SchedulerMessage::Start).await
            .map_err(|_| AppError::JobError("Failed to send start message to scheduler".to_string()))?;
        Ok(())
    }
    
    /// Pause the scheduler
    pub async fn pause(&self) -> AppResult<()> {
        self.tx.send(SchedulerMessage::Pause).await
            .map_err(|_| AppError::JobError("Failed to send pause message to scheduler".to_string()))?;
        Ok(())
    }
    
    /// Resume the scheduler
    pub async fn resume(&self) -> AppResult<()> {
        self.tx.send(SchedulerMessage::Resume).await
            .map_err(|_| AppError::JobError("Failed to send resume message to scheduler".to_string()))?;
        Ok(())
    }
    
    /// Shutdown the scheduler
    pub async fn shutdown(&self) -> AppResult<()> {
        self.tx.send(SchedulerMessage::Shutdown).await
            .map_err(|_| AppError::JobError("Failed to send shutdown message to scheduler".to_string()))?;
        Ok(())
    }
    
    /// Get the current state of the scheduler
    pub async fn get_state(&self) -> SchedulerState {
        let state = self.state.lock().await;
        match *state {
            SchedulerState::Stopped => SchedulerState::Stopped,
            SchedulerState::Running => SchedulerState::Running,
            SchedulerState::Paused => SchedulerState::Paused,
        }
    }
    
    /// Fetch jobs from the database to process
    async fn fetch_jobs_from_db(app_handle: &AppHandle) -> AppResult<u32> {
        // Get the background job repository
        let repo = app_handle.state::<Arc<BackgroundJobRepository>>().inner().clone();
        
        // Get the job queue
        let queue = get_job_queue().await?;
        
        // Get the concurrency limit from configuration
        let concurrency_limit = crate::config::get_max_concurrent_jobs();
        
        // Fetch jobs from the database
        let jobs = repo.get_and_acknowledge_queued_jobs_for_worker(concurrency_limit as u32).await?;
        
        if jobs.is_empty() {
            return Ok(0);
        }
        
        let mut enqueued_count = 0;
        
        // Convert DB jobs to Job structs and enqueue them
        for job in jobs {
            match Self::convert_db_job_to_rust_job(job) {
                Ok((job, priority)) => {
                    // Create a response channel (this is typically used for synchronous job processing,
                    // but we don't need the response for DB-fetched jobs)
                    let (response_tx, _) = tokio::sync::oneshot::channel::<Option<JobProcessResult>>();
                    
                    // Enqueue the job
                    if let Err(e) = queue.enqueue(job, priority).await {
                        error!("Failed to enqueue job from database: {}", e);
                        continue;
                    }
                    
                    enqueued_count += 1;
                },
                Err(e) => {
                    warn!("Failed to convert database job to Rust job: {}", e);
                    continue;
                }
            }
        }
        
        Ok(enqueued_count)
    }
    
    /// Convert a BackgroundJob from the database to a Rust Job struct
    fn convert_db_job_to_rust_job(db_job: BackgroundJob) -> AppResult<(Job, crate::jobs::queue::JobPriority)> {
        use crate::jobs::job_payload_utils::deserialize_job_payload;
        
        // Extract the job type and payload from the job metadata
        let metadata = db_job.metadata.as_ref()
            .ok_or_else(|| AppError::JobError("Job metadata is missing".to_string()))?;
            
        // Parse metadata to a JSON Value once
        let metadata_json = serde_json::from_str::<serde_json::Value>(metadata)
            .map_err(|e| AppError::JobError(format!("Failed to parse job metadata: {}", e)))?;
        
        // Parse the task type safely
        let task_type = TaskType::from_str(&db_job.task_type)
            .map_err(|e| AppError::JobError(format!("Failed to parse task type '{}': {}", db_job.task_type, e)))?;
        
        // Extract the jobPayloadForWorker value from metadata
        let _payload_json_value = metadata_json.get("jobPayloadForWorker")
            .ok_or_else(|| AppError::JobError("jobPayloadForWorker not found in metadata".to_string()))?;
            
        // Use the deserialize_job_payload function to parse payload based on task_type
        let payload = deserialize_job_payload(&db_job.task_type, Some(metadata))?;
        
        // Get the job priority
        let priority_str = metadata_json.get("jobPriorityForWorker")
            .and_then(|p| p.as_str())
            .unwrap_or("NORMAL");
        
        let priority = match priority_str {
            "HIGH" => crate::jobs::queue::JobPriority::High,
            "LOW" => crate::jobs::queue::JobPriority::Low,
            _ => crate::jobs::queue::JobPriority::Normal,
        };
        
        // Create the Job struct
        let job = Job {
            id: db_job.id.clone(),
            job_type: task_type,
            payload,
            created_at: db_job.created_at.to_string(),
            session_id: db_job.session_id.clone(),
            task_type_str: db_job.task_type.clone(),
            project_directory: db_job.project_directory.clone(),
            process_after: None, // DB-fetched jobs are ready for immediate processing
        };
        
        Ok((job, priority))
    }
    
    /// Get configurable timeout threshold for stale acknowledged jobs
    fn get_stale_job_timeout_threshold() -> u64 {
        // Try to get from runtime config first, then fall back to default
        match crate::config::get_runtime_ai_config() {
            Ok(Some(config)) => {
                // Check if there's a stale job timeout in the config
                config.job_settings.as_ref()
                    .and_then(|settings| settings.stale_job_timeout_seconds)
                    .unwrap_or(300) // Default 5 minutes
            },
            _ => 300 // Default 5 minutes if config not available
        }
    }
    
    /// Reset any jobs that have been acknowledged by the worker but not completed
    async fn reset_stale_acknowledged_jobs(app_handle: &AppHandle) -> AppResult<u32> {
        // Get the background job repository
        let repo = app_handle.state::<Arc<BackgroundJobRepository>>().inner().clone();
        
        // Get configurable timeout threshold
        let timeout_threshold_seconds = Self::get_stale_job_timeout_threshold();
        debug!("Using stale job timeout threshold of {} seconds", timeout_threshold_seconds);
        
        // Reset stale jobs
        let reset_count = repo.reset_stale_acknowledged_jobs(timeout_threshold_seconds).await?;
        
        if reset_count > 0 {
            info!("Reset {} stale acknowledged jobs (timeout: {} seconds)", reset_count, timeout_threshold_seconds);
        }
        
        Ok(reset_count)
    }
    
    /// Calculate cooldown duration based on consecutive failures (exponential backoff)
    fn calculate_cooldown_duration(consecutive_failures: u32) -> Duration {
        let base_seconds = 10; // Start with 10 seconds
        let max_seconds = 300; // Cap at 5 minutes
        
        let backoff_seconds = base_seconds * 2_u64.pow(consecutive_failures.min(5)); // Cap exponential growth
        Duration::from_secs(backoff_seconds.min(max_seconds))
    }
    
    /// Handle a failure by updating failure state
    async fn handle_failure(failure_state: &Arc<Mutex<FailureState>>, operation: &str) {
        let mut state = failure_state.lock().await;
        state.consecutive_failures += 1;
        state.last_failure_time = Some(SystemTime::now());
        
        if state.consecutive_failures >= 3 {
            let cooldown_duration = Self::calculate_cooldown_duration(state.consecutive_failures);
            warn!("Entering cooldown for {} seconds after {} consecutive failures in {}", 
                cooldown_duration.as_secs(), state.consecutive_failures, operation);
            state.in_cooldown = true;
        } else {
            warn!("Failure #{} in {} (cooldown threshold: 3)", state.consecutive_failures, operation);
        }
    }
    
    /// Reset failure state after successful operation
    async fn reset_failure_state(failure_state: &Arc<Mutex<FailureState>>) {
        let mut state = failure_state.lock().await;
        if state.consecutive_failures > 0 {
            debug!("Resetting failure state after successful operation (was at {} failures)", state.consecutive_failures);
            state.consecutive_failures = 0;
            state.last_failure_time = None;
            state.in_cooldown = false;
        }
    }
}

// Create a static global instance of the job scheduler
pub static JOB_SCHEDULER: OnceCell<Arc<JobScheduler>> = OnceCell::const_new();

/// Initialize the job scheduler
pub async fn init_job_scheduler(app_handle: AppHandle) -> AppResult<Arc<JobScheduler>> {
    let scheduler = Arc::new(JobScheduler::new(
        app_handle,
        Duration::from_millis(500), // Poll interval for job processing
        5000, // Poll interval for DB in milliseconds (5 seconds)
    ));
    
    // Store the scheduler in the global static
    if let Err(_) = JOB_SCHEDULER.set(scheduler.clone()) {
        return Err(AppError::JobError("Failed to initialize job scheduler".to_string()));
    }
    
    // Start the scheduler
    scheduler.start().await?;
    
    Ok(scheduler)
}

/// Get the job scheduler
pub async fn get_job_scheduler() -> AppResult<Arc<JobScheduler>> {
    match JOB_SCHEDULER.get() {
        Some(scheduler) => Ok(scheduler.clone()),
        None => Err(AppError::JobError("Job scheduler not initialized".to_string())),
    }
}