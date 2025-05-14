'use server';

import { ActionState } from '@core/types';
import { BackgroundJob, JobStatus, JOB_STATUSES } from '@core/types/session-types';
import { setupDatabase } from '@core/lib/db';
import streamingRequestPool from '@core/lib/api/streaming-request-pool';
import { backgroundJobRepository } from '@core/lib/db/repositories';
import { globalJobQueue } from '@core/lib/jobs/global-job-queue';
import { updateJobToCancelled } from '@core/lib/jobs/job-helpers';

// Enhanced validation for server-side execution environment
const isValidExecutionEnvironment = (): boolean => {
  // First, ensure we're in a server environment
  if (typeof window !== 'undefined') {
    console.warn("Server action called from client environment");
    return false;
  }
  
  // Check if we have necessary globals
  if (typeof global === 'undefined' || !global.process || !global.process.env) {
    console.warn("Missing required Node.js globals");
    return false;
  }
  
  // Ensure we're in a Next.js server action context (simplified check)
  if (!process.env.NEXT_RUNTIME) {
    console.warn("Not running in Next.js server runtime");
    return false;
  }
  
  return true;
};

/**
 * Get all active (non-cleared) background jobs
 */
export async function getActiveJobsAction(): Promise<ActionState<BackgroundJob[]>> {
  // Track timing for performance monitoring
  const startTime = performance.now();

  // Enable debug logging for troubleshooting
  const DEBUG_JOBS_ACTION = false;

  // Generate request ID for tracing
  const requestId = Math.random().toString(36).substring(2, 10);

  if (DEBUG_JOBS_ACTION) {
    console.debug(`[getActiveJobsAction][${requestId}] Starting background jobs fetch`);
  }

  // Immediately check if we're in a valid execution context
  if (!isValidExecutionEnvironment()) {
    console.warn(`[getActiveJobsAction][${requestId}] Invalid execution environment`);
    return {
      isSuccess: false,
      message: "Cannot fetch jobs: Invalid execution environment",
      data: [], // Return empty array as fallback
      error: new Error("Invalid execution environment")
    };
  }

  try {
    // Initialize database with error handling
    try {
      if (DEBUG_JOBS_ACTION) {
        console.debug(`[getActiveJobsAction][${requestId}] Setting up database connection`);
      }

      await setupDatabase();
    } catch (dbError) {
      console.error(`[getActiveJobsAction][${requestId}] Database initialization error:`, dbError);
      return {
        isSuccess: false,
        message: "Failed to initialize database: " + (dbError instanceof Error ? dbError.message : "Unknown error"),
        data: [], // Return empty array as fallback
        error: dbError instanceof Error ? dbError : new Error("Database initialization failed")
      };
    }

    // Try to get jobs from repository with explicit error handling
    try {
      if (DEBUG_JOBS_ACTION) {
        console.debug(`[getActiveJobsAction][${requestId}] Fetching jobs from repository`);
      }

      // Use the repository's getAllVisibleBackgroundJobs method to get properly mapped BackgroundJob objects
      const jobs = await backgroundJobRepository.getAllVisibleBackgroundJobs();

      const duration = performance.now() - startTime;

      // No post-processing needed, all processing now happens in the mapper
      const processedJobs = jobs;

      // Still check jobs for data integrity issues for monitoring
      const incompleteJobs = processedJobs.filter(job =>
        job.status === JOB_STATUSES.COMPLETED[0] && !job.response && !job.errorMessage && !job.outputFilePath
      ).length;

      if (incompleteJobs > 0) {
        console.warn(`[getActiveJobsAction][${requestId}] Found ${incompleteJobs} completed jobs with no response or error message`);
      }

      // Log status distribution for monitoring
      if (DEBUG_JOBS_ACTION) {
        const statusCounts = processedJobs.reduce((acc, job) => {
          if (job.status && typeof job.status === 'string') {
            acc[job.status] = (acc[job.status] || 0) + 1;
          }
          return acc;
        }, {} as Record<string, number>);

        console.debug(`[getActiveJobsAction][${requestId}] Job status distribution:`, statusCounts);
      }

      // Log success metrics
      console.debug(`[getActiveJobsAction][${requestId}] Successfully retrieved ${processedJobs.length} jobs in ${Math.round(duration)}ms`);

      return {
        isSuccess: true,
        message: `Successfully retrieved ${processedJobs.length} background jobs`,
        data: processedJobs as BackgroundJob[]
      };
    } catch (repoError) {
      console.error(`[getActiveJobsAction][${requestId}] Repository error fetching background jobs:`, repoError);
      return {
        isSuccess: false,
        message: "Database error: " + (repoError instanceof Error ? repoError.message : "Unknown repository error"),
        data: [], // Return empty array as fallback
        error: repoError instanceof Error ? repoError : new Error("Repository operation failed")
      };
    }
  } catch (error) {
    const duration = performance.now() - startTime;
    console.error(`[getActiveJobsAction][${requestId}] Error fetching active background jobs after ${Math.round(duration)}ms:`, error);

    // Ensure we return a valid response even on error
    return {
      isSuccess: false,
      message: error instanceof Error ? error.message : "Unknown error fetching active jobs",
      data: [], // Return empty array as fallback
      error: error instanceof Error ? error : new Error("Unknown error")
    };
  }
}

/**
 * Cancel a specific background job
 */
export async function cancelBackgroundJobAction(
  jobId: string
): Promise<ActionState<null>> {
  // Immediately check if we're in a valid execution context
  if (!isValidExecutionEnvironment()) {
    console.warn("[cancelBackgroundJobAction] Invalid execution environment");
    return {
      isSuccess: false,
      message: "Cannot cancel job: Invalid execution environment",
      error: new Error("Invalid execution environment"),
      data: null
    };
  }
  
  // Validate job ID is present
  if (!jobId || typeof jobId !== 'string' || jobId.trim() === '') {
    return {
      isSuccess: false,
      message: "Invalid job ID provided",
      error: new Error("Invalid job ID"),
      data: null
    };
  }
  
  try {
    // Initialize database with error handling
    try {
      await setupDatabase();
    } catch (dbError) {
      console.error("Database initialization error during job cancellation:", dbError);
      return {
        isSuccess: false,
        message: "Failed to initialize database: " + (dbError instanceof Error ? dbError.message : "Unknown error"),
        error: dbError instanceof Error ? dbError : new Error("Database initialization failed"),
        data: null
      };
    }
    
    // First get the job to check its status
    const job = await backgroundJobRepository.getBackgroundJob(jobId);
    
    if (!job) {
      return {
        isSuccess: false,
        message: `Job with ID ${jobId} not found`,
        data: null
      };
    }
    
    // If job is already in a terminal state, we don't need to do anything
    if (JOB_STATUSES.TERMINAL.includes(job.status)) {
      return {
        isSuccess: true,
        message: `Job already in terminal state: ${job.status}`,
        data: null
      };
    }
    
    // Check if job is in the queue
    let queuedJobRemoved = false;
    if (job.status === 'queued' && job.metadata?.queueJobId) {
      const queueJobId = job.metadata.queueJobId as string;
      try {
        queuedJobRemoved = await globalJobQueue.remove(queueJobId);
        console.log(`[cancelBackgroundJobAction] Removed job from queue: ${queueJobId}`);
      } catch (queueError) {
        console.warn(`[cancelBackgroundJobAction] Error removing job from queue:`, queueError);
        // Continue even if queue removal fails - we'll still update the job status
      }
    }
    
    // If job is running, try to cancel it in the streaming request pool
    let requestCancelled = false;
    if (job.status === 'running') {
      try {
        // Job ID is used as the request ID in streamingRequestPool
        requestCancelled = streamingRequestPool.cancelRequest(jobId);
        if (requestCancelled) {
          console.log(`[cancelBackgroundJobAction] Cancelled active request: ${jobId}`);
        }
      } catch (cancelError) {
        console.warn(`[cancelBackgroundJobAction] Error canceling stream request:`, cancelError);
        // Continue even if request cancellation fails - we'll still update the job status
      }
    }
    
    // Update the job status to 'canceled'
    const cancellationReason = queuedJobRemoved 
      ? 'Canceled from queue by user'
      : requestCancelled 
        ? 'Active request canceled by user'
        : 'User requested cancellation';
        
    await updateJobToCancelled(jobId, cancellationReason);
    
    return {
      isSuccess: true,
      message: "Background job canceled successfully",
      data: null
    };
  } catch (error) {
    console.error(`Error canceling background job ${jobId}:`, error);
    
    return {
      isSuccess: false,
      message: error instanceof Error ? error.message : "Unknown error canceling job",
      error: error instanceof Error ? error : new Error("Unknown error"),
      data: null
    };
  }
}

/**
 * Clear all background job history (mark all jobs as cleared)
 * - When daysToKeep is -1: Permanently delete all completed/failed/canceled jobs
 * - When daysToKeep is 0 or undefined: Only permanently delete very old jobs (90+ days)
 * - When daysToKeep > 0: Mark jobs older than daysToKeep days as cleared (hidden from UI)
 */
export async function clearJobHistoryAction(daysToKeep: number = 0): Promise<ActionState<null>> {
  // Immediately check if we're in a valid execution context
  if (!isValidExecutionEnvironment()) {
    console.warn("[clearJobHistoryAction] Invalid execution environment");
    return {
      isSuccess: false,
      message: "Cannot clear job history: Invalid execution environment",
      error: new Error("Invalid execution environment"),
      data: null
    };
  }

  try {
    // Initialize database with error handling
    try {
      await setupDatabase();
    } catch (dbError) {
      console.error("Database initialization error during job history clearing:", dbError);
      return {
        isSuccess: false,
        message: "Failed to initialize database: " + (dbError instanceof Error ? dbError.message : "Unknown error"),
        error: dbError instanceof Error ? dbError : new Error("Database initialization failed"),
        data: null
      };
    }

    // Pass the daysToKeep parameter to control how jobs are cleared
    await backgroundJobRepository.clearBackgroundJobHistory(daysToKeep);

    // Use different message based on the daysToKeep value
    let message;
    if (daysToKeep === -1) {
      message = "All completed, failed, and canceled jobs have been permanently deleted";
    } else if (daysToKeep > 0) {
      message = `Jobs older than ${daysToKeep} days have been hidden from view`;
    } else {
      message = "Jobs older than 90 days have been permanently deleted; all other jobs remain visible";
    }

    return {
      isSuccess: true,
      message,
      data: null
    };
  } catch (error) {
    console.error("Error clearing job history:", error);

    return {
      isSuccess: false,
      message: error instanceof Error ? error.message : "Unknown error clearing job history",
      error: error instanceof Error ? error : new Error("Unknown error"),
      data: null
    };
  }
}

/**
 * Update the cleared status of a specific job
 */
export async function updateJobClearedStatusAction(
  jobId: string,
  cleared: boolean
): Promise<ActionState<null>> {
  // Immediately check if we're in a valid execution context
  if (!isValidExecutionEnvironment()) {
    console.warn("[updateJobClearedStatusAction] Invalid execution environment");
    return {
      isSuccess: false,
      message: "Cannot update job: Invalid execution environment",
      error: new Error("Invalid execution environment"),
      data: null
    };
  }
  
  // Validate job ID is present
  if (!jobId || typeof jobId !== 'string' || jobId.trim() === '') {
    return {
      isSuccess: false,
      message: "Invalid job ID provided",
      error: new Error("Invalid job ID"),
      data: null
    };
  }
  
  // Validate cleared is a boolean
  if (typeof cleared !== 'boolean') {
    return {
      isSuccess: false,
      message: "Invalid cleared status provided",
      error: new Error("Invalid cleared status"),
      data: null
    };
  }
  
  try {
    // Initialize database with error handling
    try {
      await setupDatabase();
    } catch (dbError) {
      console.error("Database initialization error during job cleared status update:", dbError);
      return {
        isSuccess: false,
        message: "Failed to initialize database: " + (dbError instanceof Error ? dbError.message : "Unknown error"),
        error: dbError instanceof Error ? dbError : new Error("Database initialization failed"),
        data: null
      };
    }
    
    await backgroundJobRepository.updateBackgroundJobClearedStatus(jobId, cleared);
    
    return {
      isSuccess: true,
      message: `Job ${cleared ? 'cleared' : 'restored'} successfully`,
      data: null
    };
  } catch (error) {
    console.error(`Error updating job ${jobId} cleared status:`, error);
    
    return {
      isSuccess: false,
      message: error instanceof Error ? error.message : `Unknown error updating job cleared status`,
      error: error instanceof Error ? error : new Error("Unknown error"),
      data: null
    };
  }
}

/**
 * Cancel all running background jobs for a session
 */
export async function cancelSessionBackgroundJobsAction(sessionId: string): Promise<ActionState<null>> {
  // Immediately check if we're in a valid execution context
  if (!isValidExecutionEnvironment()) {
    console.warn("[cancelSessionBackgroundJobsAction] Invalid execution environment");
    return {
      isSuccess: false,
      message: "Cannot cancel session jobs: Invalid execution environment",
      error: new Error("Invalid execution environment"),
      data: null
    };
  }
  
  // Validate session ID is present
  if (!sessionId || typeof sessionId !== 'string' || sessionId.trim() === '') {
    return {
      isSuccess: false,
      message: "Invalid session ID provided",
      error: new Error("Invalid session ID"),
      data: null
    };
  }
  
  try {
    // Initialize database with error handling
    try {
      await setupDatabase();
    } catch (dbError) {
      console.error(`Database initialization error during session jobs cancellation (${sessionId}):`, dbError);
      return {
        isSuccess: false,
        message: "Failed to initialize database: " + (dbError instanceof Error ? dbError.message : "Unknown error"),
        error: dbError instanceof Error ? dbError : new Error("Database initialization failed"),
        data: null
      };
    }
    
    // First remove any jobs in the queue for this session
    try {
      const removedCount = await globalJobQueue.removeBySessionId(sessionId);
      if (removedCount > 0) {
        console.log(`[cancelSessionBackgroundJobsAction] Removed ${removedCount} queued jobs for session ${sessionId}`);
      }
    } catch (queueError) {
      console.warn(`[cancelSessionBackgroundJobsAction] Error removing jobs from queue:`, queueError);
      // Continue even if queue removal fails - we'll still cancel the jobs in the database
    }
    
    // Then cancel any running requests for this session
    try {
      const cancelledCount = streamingRequestPool.cancelQueuedSessionRequests(sessionId);
      if (cancelledCount > 0) {
        console.log(`[cancelSessionBackgroundJobsAction] Cancelled ${cancelledCount} active requests for session ${sessionId}`);
      }
    } catch (cancelError) {
      console.warn(`[cancelSessionBackgroundJobsAction] Error canceling session requests:`, cancelError);
      // Continue even if request cancellation fails - we'll still cancel the jobs in the database
    }
    
    // Finally, cancel all session jobs in the database
    await backgroundJobRepository.cancelAllSessionBackgroundJobs(sessionId);
    
    return {
      isSuccess: true,
      message: `All background jobs for session ${sessionId} cancelled successfully`,
      data: null
    };
  } catch (error) {
    console.error(`Error canceling background jobs for session ${sessionId}:`, error);
    
    return {
      isSuccess: false,
      message: error instanceof Error ? error.message : "Unknown error canceling session jobs",
      error: error instanceof Error ? error : new Error("Unknown error"),
      data: null
    };
  }
}