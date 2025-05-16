/**
 * Job Queue Adapter for Tauri
 * 
 * This adapter wraps the GlobalJobQueue from core to ensure
 * it works properly in the desktop environment.
 */

import { JobProcessor, JobType, JobStatus, Job } from '@core/lib/jobs/job-types';
import { executeQuery, selectQuery } from './db-adapter';
import { getToken } from '@/auth/token-storage';

/**
 * Adapter that wraps the core GlobalJobQueue
 * to work in the desktop environment
 */
export class JobQueueAdapter {
  private globalJobQueue: any;
  private initialized = false;

  /**
   * Initialize the job queue adapter
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    // Dynamically import the GlobalJobQueue to avoid circular dependencies
    const { default: GlobalJobQueue } = await import('@core/lib/jobs/global-job-queue');
    this.globalJobQueue = GlobalJobQueue;

    // Patch the job dispatcher to add authentication tokens
    await this.patchJobDispatcher();

    this.initialized = true;
    console.log('[Desktop] Job queue adapter initialized');
  }

  /**
   * Patch the job dispatcher to add authentication tokens to API requests
   */
  private async patchJobDispatcher(): Promise<void> {
    try {
      const { jobDispatcher } = await import('@core/lib/jobs/job-dispatcher');
      const { jobProcessor } = await import('@core/lib/jobs/job-processor-interface');
      
      // Store the original dispatch method
      const originalDispatch = jobDispatcher.dispatch;
      
      // Store the original updateJob method
      const originalUpdateJob = jobDispatcher.updateJob;

      // Override the dispatch method
      jobDispatcher.dispatch = async function(job: Job) {
        // Get the auth token before processing
        const token = await getToken();
        
        // Add token to the job context if available
        if (token) {
          job.context = {
            ...job.context,
            authToken: token
          };
        }

        // Add desktop flag to the job context
        job.context = {
          ...job.context,
          isDesktop: true
        };

        // Call the original dispatch method
        return originalDispatch.call(this, job);
      };
      
      // Override the updateJob method
      jobDispatcher.updateJob = async function(job: Job) {
        // Update the job locally - all job management is done in the desktop app
        const updatedJob = await originalUpdateJob.call(this, job);
        return updatedJob;
      };

      console.log('[Desktop] Job dispatcher patched for authentication and progress tracking');
    } catch (error) {
      console.error('[Desktop] Failed to patch job dispatcher:', error);
    }
  }

  /**
   * Enqueue a job
   */
  async enqueueJob(job: Job): Promise<string> {
    await this.initialize();
    return this.globalJobQueue.enqueueJob(job);
  }

  /**
   * Get a job by ID
   */
  async getJob(jobId: string): Promise<Job | null> {
    await this.initialize();
    return this.globalJobQueue.getJob(jobId);
  }

  /**
   * Cancel a job
   */
  async cancelJob(jobId: string): Promise<boolean> {
    await this.initialize();
    return this.globalJobQueue.cancelJob(jobId);
  }
}

// Singleton instance
export const jobQueueAdapter = new JobQueueAdapter();