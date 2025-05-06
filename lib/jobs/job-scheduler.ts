import { globalJobQueue } from './global-job-queue';
import { dispatchJob } from './job-dispatcher';
import { QueuedJob } from './job-types';

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
  
  /**
   * Create a new job scheduler.
   * 
   * @param options Configuration options
   * @param options.concurrencyLimit Maximum number of concurrent jobs to process
   * @param options.pollingIntervalMs How often to poll the queue in milliseconds
   * @param options.jobTimeoutMs Maximum time in milliseconds a job can run before timing out
   * @param options.debugMode Whether to enable more verbose debug logging
   */
  constructor({
    concurrencyLimit = 5,
    pollingIntervalMs = 200,
    jobTimeoutMs = 10 * 60 * 1000, // 10 minutes
    debugMode = false,
  } = {}) {
    this.concurrencyLimit = concurrencyLimit;
    this.pollingIntervalMs = pollingIntervalMs;
    this.jobTimeoutMs = jobTimeoutMs;
    this.debugMode = debugMode;
    
    console.log(`[JobScheduler] Initialized with: concurrency=${concurrencyLimit}, polling=${pollingIntervalMs}ms, timeout=${jobTimeoutMs}ms`);
  }
  
  /**
   * Start the scheduler to begin processing jobs.
   */
  start(): void {
    if (this.isRunning) {
      console.warn('[JobScheduler] Scheduler is already running');
      return;
    }
    
    console.log(`[JobScheduler] Starting job scheduler with concurrency limit of ${this.concurrencyLimit}`);
    this.isRunning = true;
    
    // Initial polling
    this.poll();
    
    // Set up recurring polling
    this.pollingInterval = setInterval(() => {
      this.poll();
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
  : 10 * 60 * 1000; // 10 minutes

const DEBUG_MODE = process.env.WORKER_DEBUG === 'true';

// Export a singleton instance
export const jobScheduler = new JobScheduler({
  concurrencyLimit: CONCURRENCY_LIMIT,
  pollingIntervalMs: POLLING_INTERVAL_MS,
  jobTimeoutMs: JOB_TIMEOUT_MS,
  debugMode: DEBUG_MODE
});