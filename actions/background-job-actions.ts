'use server';

import { ActionState, BackgroundJob } from '@/types';
import { backgroundJobRepository } from '@/lib/db/repositories';
import { setupDatabase } from '@/lib/db';
import streamingRequestPool from '@/lib/api/streaming-request-pool';

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
  // Immediately check if we're in a valid execution context
  if (!isValidExecutionEnvironment()) {
    console.warn("[getActiveJobsAction] Invalid execution environment");
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
      await setupDatabase();
    } catch (dbError) {
      console.error("[getActiveJobsAction] Database initialization error:", dbError);
      return {
        isSuccess: false,
        message: "Failed to initialize database: " + (dbError instanceof Error ? dbError.message : "Unknown error"),
        data: [], // Return empty array as fallback
        error: dbError instanceof Error ? dbError : new Error("Database initialization failed")
      };
    }

    // Try to get jobs from repository with explicit error handling
    try {
      // Use the repository's getAllVisibleBackgroundJobs method to get properly mapped BackgroundJob objects
      const jobs = await backgroundJobRepository.getAllVisibleBackgroundJobs();
      
      return {
        isSuccess: true,
        message: `Successfully retrieved ${jobs.length} active background jobs`,
        data: jobs as BackgroundJob[]
      };
    } catch (repoError) {
      console.error("[getActiveJobsAction] Repository error fetching background jobs:", repoError);
      return {
        isSuccess: false,
        message: "Database error: " + (repoError instanceof Error ? repoError.message : "Unknown repository error"),
        data: [], // Return empty array as fallback 
        error: repoError instanceof Error ? repoError : new Error("Repository operation failed")
      };
    }
  } catch (error) {
    console.error("[getActiveJobsAction] Error fetching active background jobs:", error);
    
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
    
    // If job is already completed, failed, or canceled, we don't need to do anything
    if (['completed', 'failed', 'canceled'].includes(job.status)) {
      return {
        isSuccess: true,
        message: `Job already in terminal state: ${job.status}`,
        data: null
      };
    }
    
    // Update the job status to 'canceled'
    await backgroundJobRepository.updateBackgroundJobStatus({
      jobId: jobId,
      status: 'canceled',
      endTime: Date.now(),
      statusMessage: 'Canceled by user'
    });
    
    // Additionally, if it's an API call, try to cancel it in the request pool
    if (['running', 'preparing'].includes(job.status) && 
        typeof streamingRequestPool.cancelRequest === 'function') {
      try {
        streamingRequestPool.cancelRequest(jobId);
      } catch (cancelError) {
        console.warn(`Error canceling stream request for job ${jobId}:`, cancelError);
        // Continue even if cancel request fails
      }
    }
    
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
 */
export async function clearJobHistoryAction(): Promise<ActionState<null>> {
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
    
    await backgroundJobRepository.clearBackgroundJobHistory();
    
    return {
      isSuccess: true,
      message: "Job history cleared successfully",
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