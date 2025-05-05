import { backgroundJobRepository } from '@/lib/db/repositories';
import { BackgroundJob, ApiType, TaskType, JobStatus, JOB_STATUSES } from '@/types/session-types';
import { GEMINI_FLASH_MODEL } from '@/lib/constants';

/**
 * Creates a background job for an API request
 */
export async function createBackgroundJob(
  sessionId: string,
  options: {
    apiType: ApiType;
    taskType: TaskType;
    model?: string;
    rawInput?: string;
    maxOutputTokens?: number;
    includeSyntax?: boolean;
    temperature?: number;
    metadata?: { [key: string]: any };
  }
): Promise<BackgroundJob> {
  // Strictly validate sessionId
  if (!sessionId || typeof sessionId !== 'string' || !sessionId.trim()) {
    throw new Error('Invalid session ID provided for background job creation');
  }

  const { 
    apiType,
    taskType,
    model = GEMINI_FLASH_MODEL,
    rawInput = '',
    includeSyntax = false,
    temperature = 0.7,
    metadata = {}
  } = options;

  // Create the job
  const job = await backgroundJobRepository.createBackgroundJob(
    sessionId,
    apiType,
    taskType,
    rawInput,  // This is correctly passed to be stored as both prompt and rawInput
    includeSyntax,
    temperature,
    true, // visible
    metadata // Pass the custom metadata
  );
  
  // Update to preparing status
  await backgroundJobRepository.updateBackgroundJobStatus({
    jobId: job.id,
    status: 'preparing' as JobStatus,
    statusMessage: `Setting up ${apiType.toUpperCase()} API request`,
    metadata: {
      modelUsed: model,
      maxOutputTokens: options.maxOutputTokens,
      ...metadata // Include custom metadata in the status update
    }
  });
  
  return job;
}

/**
 * Updates a background job to running status
 * 
 * This status indicates active processing of the job. The job will have a startTime
 * but no endTime as it's still in progress.
 * 
 * @param jobId Unique identifier for the job
 * @param apiType The API being used (gemini, claude, groq, etc.)
 * @param statusMessage Optional message describing the current processing stage
 */
export async function updateJobToRunning(
  jobId: string, 
  apiType: ApiType = 'gemini',
  statusMessage?: string
): Promise<void> {
  // Validate jobId
  if (!jobId || typeof jobId !== 'string' || !jobId.trim()) {
    throw new Error('Invalid job ID provided for updateJobToRunning');
  }

  const now = Date.now();
  
  // Don't set endTime for running jobs - clear it if it somehow was set
  await backgroundJobRepository.updateBackgroundJobStatus({
    jobId: jobId,
    status: 'running' as JobStatus,
    startTime: now, // Set or update startTime 
    endTime: null,  // Explicitly set to null to clear any endTime that might be set
    statusMessage: statusMessage || `Processing with ${apiType.toUpperCase()} API`,
    metadata: {
      lastUpdateTime: now,
      apiType: apiType
    }
  });
}

/**
 * Updates a background job to completed status
 * 
 * This terminal status indicates successful completion of the job. 
 * The job must have a response and endTime.
 * 
 * @param jobId Unique identifier for the job
 * @param responseText The successful response content from the job
 * @param tokens Optional token usage metrics
 */
export async function updateJobToCompleted(
  jobId: string,
  responseText: string,
  tokens: {
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
  } = {}
): Promise<void> {
  // Validate jobId
  if (!jobId || typeof jobId !== 'string' || !jobId.trim()) {
    throw new Error('Invalid job ID provided for updateJobToCompleted');
  }

  // Validate response - must not be null or undefined for completed jobs
  if (responseText === null || responseText === undefined) {
    console.warn(`[JobHelper] Attempt to complete job ${jobId} with null/undefined response, using placeholder`);
    responseText = '[Job completed with no response]';
  }

  const now = Date.now();
  await backgroundJobRepository.updateBackgroundJobStatus({
    jobId,
    status: 'completed',
    endTime: now,
    response: responseText,
    statusMessage: `Completed successfully`,
    // Clear any error messages that might have been set earlier
    errorMessage: '',
    metadata: {
      promptTokens: tokens.promptTokens || 0,
      completionTokens: tokens.completionTokens || 0,
      totalTokens: tokens.totalTokens || 0,
      lastUpdateTime: now,
      completedAt: now
    }
  });
}

/**
 * Updates a background job to failed status
 * 
 * This terminal status indicates the job encountered an error.
 * The job must have an errorMessage and endTime.
 * 
 * @param jobId Unique identifier for the job
 * @param errorMessage Description of the error that occurred
 */
export async function updateJobToFailed(
  jobId: string,
  errorMessage: string
): Promise<void> {
  // Validate jobId
  if (!jobId || typeof jobId !== 'string' || !jobId.trim()) {
    throw new Error('Invalid job ID provided for updateJobToFailed');
  }

  // Validate error message - must not be null or undefined for failed jobs
  if (errorMessage === null || errorMessage === undefined || errorMessage.trim() === '') {
    console.warn(`[JobHelper] Attempt to fail job ${jobId} with empty error message, using placeholder`);
    errorMessage = 'Job failed with no error message';
  }

  const now = Date.now();
  await backgroundJobRepository.updateBackgroundJobStatus({
    jobId,
    status: 'failed',
    endTime: now,
    errorMessage,
    // Set a standard status message for failed jobs
    statusMessage: "Failed due to error",
    metadata: {
      lastUpdateTime: now,
      failedAt: now,
      // Add error indication in metadata for analytics
      hasError: true
    }
  });
}

/**
 * Updates a background job to cancelled status
 * 
 * This terminal status indicates the job was cancelled by user action.
 * The job will have an endTime and a standard cancel message.
 * 
 * @param jobId Unique identifier for the job
 * @param reason Optional reason for cancellation
 */
export async function updateJobToCancelled(
  jobId: string,
  reason: string = "Canceled by user interaction"
): Promise<void> {
  // Validate jobId
  if (!jobId || typeof jobId !== 'string' || !jobId.trim()) {
    throw new Error('Invalid job ID provided for updateJobToCancelled');
  }

  const now = Date.now();
  await backgroundJobRepository.updateBackgroundJobStatus({
    jobId,
    status: 'canceled',
    endTime: now,
    statusMessage: "Canceled by user interaction",
    errorMessage: reason || "Canceled by user interaction",
    metadata: {
      lastUpdateTime: now,
      cancelledAt: now,
      // Add cancel indication in metadata for analytics
      userCancelled: true
    }
  });
}

/**
 * Handles an API error and updates the job status accordingly
 * 
 * This is a utility function to standardize error handling for API calls
 * 
 * @param jobId Unique identifier for the job
 * @param status HTTP status code or other numeric error code
 * @param errorText Detailed error message
 * @param apiType The API that generated the error
 */
export async function handleApiError(
  jobId: string, 
  status: number, 
  errorText: string,
  apiType: ApiType = 'gemini'
): Promise<void> {
  // Validate jobId
  if (!jobId || typeof jobId !== 'string' || !jobId.trim()) {
    throw new Error('Invalid job ID provided for handleApiError');
  }

  // Format error message with API name and status code
  const statusMessage = `${apiType.toUpperCase()} API Error: ${status} ${errorText.substring(0, 100)}${errorText.length > 100 ? '...' : ''}`;
  
  // Use updateJobToFailed for consistent behavior with other terminal states
  await updateJobToFailed(jobId, errorText);
}

/**
 * Cancels all background jobs for a session
 * 
 * This utility finds and cancels all active jobs associated with a session
 * 
 * @param sessionId The session to cancel jobs for
 * @param apiType Optional API type for logging purposes
 */
export async function cancelAllSessionJobs(
  sessionId: string, 
  apiType: ApiType = 'gemini'
): Promise<void> {
  // Validate sessionId
  if (!sessionId || typeof sessionId !== 'string' || !sessionId.trim()) {
    throw new Error('Invalid session ID provided for cancelAllSessionJobs');
  }

  try {
    const jobs = await backgroundJobRepository.findBackgroundJobsBySessionId(sessionId);
    
    // Filter for active jobs that can be cancelled using the standard constants
    const activeJobs = jobs.filter(job => job.status && JOB_STATUSES.ACTIVE.includes(job.status));
    
    if (activeJobs.length === 0) {
      return;
    }
    
    console.log(`[Jobs] Cancelling ${activeJobs.length} active jobs for session ${sessionId}`);
    
    // Mark each job as cancelled using the helper method for consistent behavior
    for (const job of activeJobs) {
      if (!job.id) continue; // Skip jobs with missing IDs
      
      // Use the updateJobToCancelled helper for standardized cancellation behavior
      await updateJobToCancelled(
        job.id, 
        `Cancelled due to session action or cleanup`
      );
    }
  } catch (error) {
    console.error(`[${apiType.toUpperCase()} Client] Error cancelling session jobs:`, error);
    throw error;
  }
} 