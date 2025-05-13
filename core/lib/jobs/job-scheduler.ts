import { globalJobQueue } from './global-job-queue';
import { dispatchJob } from './job-dispatcher';
import { QueuedJob, JobType, BaseJobPayload, AnyJobPayload } from './job-types';
import { backgroundJobRepository } from '../db/repositories';

/**
 * Job scheduler that manages the execution of jobs from the global queue.
 * Acts as a worker manager by polling the queue and dispatching jobs.
 */
export class JobScheduler {
  private isRunning: boolean = false;
  private activeWorkers: number = 0;
  private concurrencyLimit: number;
  private pollingIntervalMs: number;
  private pollingInterval: NodeJS.Timeout | null = null;
  private jobTimeoutMs: number;
  private debugMode: boolean = false;
  private lastDbPollTime: number = 0;
  private DB_POLL_INTERVAL_MS: number = 5000; // 5 seconds
  private STALE_JOB_TIMEOUT_SECONDS: number = 600; // 10 minutes
  
  /**
   * Create a new job scheduler.
   * 
   * @param options Configuration options
   * @param options.concurrencyLimit Maximum number of concurrent jobs to process
   * @param options.pollingIntervalMs How often to poll the queue in milliseconds
   * @param options.jobTimeoutMs Maximum time in milliseconds a job can run before timing out
   * @param options.debugMode Whether to enable more verbose debug logging
   * @param options.dbPollIntervalMs How often to poll the database for queued jobs in milliseconds
   * @param options.staleJobTimeoutSeconds How many seconds a job can be in 'acknowledged_by_worker' state before being reset
   */
  constructor({
    concurrencyLimit = 5,
    pollingIntervalMs = 200,
    jobTimeoutMs = 10 * 60 * 1000, // 10 minutes
    debugMode = false,
    dbPollIntervalMs = 5000, // 5 seconds by default
    staleJobTimeoutSeconds = 600, // 10 minutes by default
  } = {}) {
    this.concurrencyLimit = concurrencyLimit;
    this.pollingIntervalMs = pollingIntervalMs;
    this.jobTimeoutMs = jobTimeoutMs;
    this.debugMode = debugMode;
    this.DB_POLL_INTERVAL_MS = dbPollIntervalMs;
    this.STALE_JOB_TIMEOUT_SECONDS = staleJobTimeoutSeconds;
    
    console.log(`[JobScheduler] Initialized with: concurrency=${concurrencyLimit}, polling=${pollingIntervalMs}ms, timeout=${jobTimeoutMs}ms, dbPoll=${dbPollIntervalMs}ms`);
  }
  
  /**
   * Start the scheduler to begin processing jobs.
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      console.warn('[JobScheduler] Scheduler is already running');
      return;
    }
    
    console.log(`[JobScheduler] Starting job scheduler with concurrency limit of ${this.concurrencyLimit}`);
    this.isRunning = true;
    
    // Reset any stale acknowledged jobs before starting
    await this.resetStaleAcknowledgedJobs();
    
    // Initial polling
    await this.poll();
    
    // Set up recurring polling
    this.pollingInterval = setInterval(async () => {
      await this.poll();
    }, this.pollingIntervalMs);
  }
  
  /**
   * Stop the scheduler.
   */
  stop(): void {
    if (!this.isRunning) {
      console.warn('[JobScheduler] Scheduler is not running');
      return;
    }
    
    console.log('[JobScheduler] Stopping job scheduler');
    this.isRunning = false;
    
    // Clear the polling interval
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
      this.pollingInterval = null;
    }
  }
  
  /**
   * Poll the queue for jobs and process them if workers are available.
   */
  private async poll(): Promise<void> {
    if (!this.isRunning) {
      return;
    }
    
    // Check if it's time to poll the database for queued jobs
    if (Date.now() - this.lastDbPollTime > this.DB_POLL_INTERVAL_MS) {
      await this.fetchJobsFromDb();
      this.lastDbPollTime = Date.now();
    }
    
    // Only check for new jobs if we have capacity
    if (this.activeWorkers < this.concurrencyLimit) {
      // Calculate available worker slots
      const availableSlots = this.concurrencyLimit - this.activeWorkers;
      
      if (this.debugMode) {
        console.debug(`[JobScheduler] Polling with ${availableSlots} available slots. Queue size: ${globalJobQueue.size()}`);
      }
      
      // Try to fill all available slots
      for (let i = 0; i < availableSlots; i++) {
        // Try to dequeue a job
        const job = await globalJobQueue.dequeue();
        
        if (!job) {
          // No jobs available, stop trying
          if (this.debugMode) {
            console.debug('[JobScheduler] No more jobs available in queue');
          }
          break;
        }
        
        // Process the job
        this.processJob(job);
      }
    } else if (this.debugMode) {
      console.debug(`[JobScheduler] At capacity with ${this.activeWorkers}/${this.concurrencyLimit} active workers`);
    }
  }
  
  /**
   * Fetch queued jobs from the database and add them to the global job queue
   */
  private async fetchJobsFromDb(): Promise<void> {
    try {
      // Get jobs from the database with 'queued' status and update them to 'acknowledged_by_worker'
      const jobs = await backgroundJobRepository.getAndAcknowledgeQueuedJobs(this.concurrencyLimit);
      
      if (jobs.length === 0) {
        if (this.debugMode) {
          console.debug('[JobScheduler] No queued jobs found in database');
        }
        return;
      }
      
      console.log(`[JobScheduler] Found ${jobs.length} queued jobs in database, adding to local queue`);
      
      // Add each job to the global job queue
      for (const job of jobs) {
        if (!job.metadata) continue;
        
        // Extract essential job data from metadata
        const jobTypeForWorker = job.metadata.jobTypeForWorker as JobType;
        const jobPayloadForWorker = job.metadata.jobPayloadForWorker as BaseJobPayload & AnyJobPayload;
        const jobPriorityForWorker = job.metadata.jobPriorityForWorker as number || 1;
        
        // Validate the job data
        if (!jobTypeForWorker || !jobPayloadForWorker) {
          console.warn(`[JobScheduler] Job ${job.id} has missing or invalid metadata, marking as failed`);
          
          // Mark the job as failed in the database
          await backgroundJobRepository.updateBackgroundJobStatus({
            jobId: job.id,
            status: 'failed',
            errorMessage: 'Invalid job metadata: missing required fields',
          });
          
          continue;
        }
        
        // Ensure the background job ID in the payload matches the actual job ID
        // This is crucial for correct job status updates by processors
        if (jobPayloadForWorker.backgroundJobId !== job.id) {
          console.warn(`[JobScheduler] Correcting mismatched backgroundJobId in payload: ${jobPayloadForWorker.backgroundJobId} → ${job.id}`);
          jobPayloadForWorker.backgroundJobId = job.id;
        }
        
        // Add the job to the global queue
        await globalJobQueue.enqueue({
          type: jobTypeForWorker,
          payload: jobPayloadForWorker,
          priority: jobPriorityForWorker
        });
        
        if (this.debugMode) {
          console.debug(`[JobScheduler] Enqueued job ${job.id} of type ${jobTypeForWorker} into local queue`);
        }
      }
    } catch (error) {
      console.error('[JobScheduler] Error fetching jobs from database:', error);
    }
  }
  
  /**
   * Reset stale acknowledged jobs back to 'queued' status
   */
  private async resetStaleAcknowledgedJobs(): Promise<void> {
    try {
      const resetCount = await backgroundJobRepository.resetStaleAcknowledgedJobs(this.STALE_JOB_TIMEOUT_SECONDS);
      
      if (resetCount > 0) {
        console.log(`[JobScheduler] Reset ${resetCount} stale acknowledged jobs back to 'queued' status`);
      }
    } catch (error) {
      console.error('[JobScheduler] Error resetting stale acknowledged jobs:', error);
    }
  }
  
  /**
   * Process a dequeued job
   * 
   * @param job The job to process
   */
  private processJob(job: QueuedJob): void {
    // Increment active worker count
    this.activeWorkers++;
    
    // Log worker state change
    this.logSchedulerState();
    
    // Set a timeout for this job
    const timeoutId = setTimeout(() => {
      console.error(`[JobScheduler] Job ${job.id} timed out after ${this.jobTimeoutMs}ms`);
      // Note: We decrement the active worker count in the finally block
    }, this.jobTimeoutMs);
    
    // Process the job with the dispatcher
    dispatchJob(job)
      .then(result => {
        if (result.success) {
          console.log(`[JobScheduler] Job ${job.id} (type: ${job.type}) processed successfully`);
        } else {
          console.warn(`[JobScheduler] Job ${job.id} (type: ${job.type}) failed: ${result.message}`);
          // Note: Retries are handled by the dispatcher
        }
      })
      .catch(error => {
        // This catch is for unhandled errors from dispatchJob itself
        console.error(`[JobScheduler] Unhandled error dispatching job ${job.id} (type: ${job.type}):`, error);
      })
      .finally(() => {
        // Always decrement the worker count when done
        this.activeWorkers--;
        
        // Clear the timeout
        clearTimeout(timeoutId);
        
        // Log worker state change
        this.logSchedulerState();
        
        // Immediately try to process another job if capacity is available and scheduler is running
        if (this.isRunning && this.activeWorkers < this.concurrencyLimit) {
          setImmediate(() => this.poll());
        }
      });
  }
  
  /**
   * Log the current state of the scheduler.
   */
  private logSchedulerState(): void {
    // Only log on state changes or in debug mode
    if (this.debugMode || this.activeWorkers === 0 || this.activeWorkers === this.concurrencyLimit) {
      console.debug(`[JobScheduler] Active workers: ${this.activeWorkers}/${this.concurrencyLimit}, Queue size: ${globalJobQueue.size()}`);
      
      if (this.debugMode) {
        const stats = globalJobQueue.getStats();
        console.debug(`[JobScheduler] Queue stats: ${JSON.stringify(stats)}`);
      }
    }
  }
  
  /**
   * Get the current number of active workers.
   */
  getActiveWorkerCount(): number {
    return this.activeWorkers;
  }
  
  /**
   * Get the scheduler status.
   */
  getStatus(): {
    isRunning: boolean;
    activeWorkers: number;
    concurrencyLimit: number;
    queueStats: any;
  } {
    return {
      isRunning: this.isRunning,
      activeWorkers: this.activeWorkers,
      concurrencyLimit: this.concurrencyLimit,
      queueStats: globalJobQueue.getStats()
    };
  }
}

// Create a singleton instance with configuration from environment variables (if available)
const CONCURRENCY_LIMIT = process.env.WORKER_CONCURRENCY 
  ? parseInt(process.env.WORKER_CONCURRENCY, 10) 
  : 5;

const POLLING_INTERVAL_MS = process.env.WORKER_POLLING_INTERVAL 
  ? parseInt(process.env.WORKER_POLLING_INTERVAL, 10)
  : 200;

const JOB_TIMEOUT_MS = process.env.WORKER_JOB_TIMEOUT
  ? parseInt(process.env.WORKER_JOB_TIMEOUT, 10)
  : 30 * 60 * 1000; // 30 minutes (increased from 10 minutes for implementation plans)

const DB_POLL_INTERVAL_MS = process.env.WORKER_DB_POLL_INTERVAL 
  ? parseInt(process.env.WORKER_DB_POLL_INTERVAL, 10)
  : 5000; // 5 seconds

const STALE_JOB_TIMEOUT_SECONDS = process.env.WORKER_STALE_JOB_TIMEOUT 
  ? parseInt(process.env.WORKER_STALE_JOB_TIMEOUT, 10)
  : 600; // 10 minutes

const DEBUG_MODE = process.env.WORKER_DEBUG === 'true';

// Export a singleton instance
export const jobScheduler = new JobScheduler({
  concurrencyLimit: CONCURRENCY_LIMIT,
  pollingIntervalMs: POLLING_INTERVAL_MS,
  jobTimeoutMs: JOB_TIMEOUT_MS,
  dbPollIntervalMs: DB_POLL_INTERVAL_MS,
  staleJobTimeoutSeconds: STALE_JOB_TIMEOUT_SECONDS,
  debugMode: DEBUG_MODE
});