import { backgroundJobRepository } from '@core/lib/db/repositories';
import { BackgroundJob, ApiType, TaskType, JobStatus, JOB_STATUSES } from '@core/types/session-types';
import { GEMINI_FLASH_MODEL } from '@core/lib/constants';
import { BaseJobPayload, JobType, AnyJobPayload } from './job-types';
import { globalJobQueue } from './global-job-queue';
import { estimateTokens } from '@core/lib/token-estimator';
import { ApiErrorType, mapStatusCodeToErrorType } from '@core/lib/api/api-error-handling';

/**
 * Creates a background job in the database
 * This function creates the job record with an initial status of 'queued' when jobTypeForWorker is provided.
 * Otherwise, it creates the job with status 'created'.
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
    jobTypeForWorker?: JobType;  // Type of job for worker processing
    jobPayloadForWorker?: any;   // Payload for worker processing
    jobPriorityForWorker?: number; // Priority for worker processing
  },
  projectDirectory?: string
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
    metadata = {},
    jobTypeForWorker,
    jobPayloadForWorker,
    jobPriorityForWorker
  } = options;

  // Create consolidated metadata that includes model and temperature
  // to ensure they're available in both top-level fields and metadata
  const finalMetadata: { [key: string]: any } = {
    ...metadata,
    modelUsed: model,
    temperature: temperature, // Store temperature in metadata as well
    maxOutputTokens: options.maxOutputTokens,
  };

  // If worker job information is provided, add it to metadata
  if (jobTypeForWorker) {
    finalMetadata.jobTypeForWorker = jobTypeForWorker;
    finalMetadata.jobPriorityForWorker = jobPriorityForWorker || 1; // Default priority is 1

    // Store worker payload, merged with key job information
    if (jobPayloadForWorker) {
      // We need to create the job first to get the ID
      finalMetadata.queuedAt = Date.now();
    }
  }

  // Estimate input tokens if rawInput is provided and estimatedInputTokens not set
  if (rawInput && !finalMetadata.estimatedInputTokens) {
    try {
      finalMetadata.estimatedInputTokens = await estimateTokens(rawInput);
    } catch (error) {
      console.warn(`Error estimating tokens for job creation: ${error}`);
      // Continue with job creation even if token estimation fails
    }
  }

  // Set status to 'queued' if this is a worker job, otherwise 'created'
  const initialStatus = jobTypeForWorker ? 'queued' : 'created';

  // Create the job with the appropriate status
  const job = await backgroundJobRepository.createBackgroundJob(
    sessionId,
    apiType,
    taskType,
    rawInput,
    includeSyntax,
    temperature,
    true, // visible
    finalMetadata,
    projectDirectory,
    initialStatus
  );

  // If we have worker-specific payload, update the job with complete payload including the job ID
  if (jobTypeForWorker && jobPayloadForWorker) {
    // Create the complete worker payload with the background job ID
    const completeWorkerPayload = {
      ...jobPayloadForWorker,
      backgroundJobId: job.id,
      sessionId: sessionId,
    };

    // Update the job with the complete worker payload
    await backgroundJobRepository.updateBackgroundJobStatus({
      jobId: job.id,
      status: initialStatus,
      metadata: {
        jobTypeForWorker,
        jobPayloadForWorker: completeWorkerPayload,
        jobPriorityForWorker: jobPriorityForWorker || 1,
        queueJobId: job.id,  // Use job ID as queue job ID for reference
        queuedAt: Date.now()
      }
    });
  }

  return job;
}

/**
 * Enqueues a job into the global job queue
 * This function adds a job to the queue and updates the background job status to 'queued'.
 *
 * @param jobType The type of job to enqueue
 * @param payload The job payload (must include backgroundJobId)
 * @param priority The job priority (default: 1)
 * @param options Optional configuration for the job
 * @returns The queue job ID
 */
export async function enqueueJob<T extends BaseJobPayload>(
  jobType: JobType,
  payload: T & { [K in keyof AnyJobPayload]?: AnyJobPayload[K] },
  priority: number = 1,
  options: {
    retryEnabled?: boolean;
    maxRetries?: number;
    description?: string;
    delay?: number;
  } = {}
): Promise<string> {
  // Validate payload
  if (!payload || !payload.backgroundJobId) {
    throw new Error('Job payload must include backgroundJobId');
  }

  // Validate session ID
  if (!payload.sessionId || typeof payload.sessionId !== 'string' || !payload.sessionId.trim()) {
    throw new Error('Job payload must include a valid sessionId');
  }

  // Apply defaults for options
  const {
    retryEnabled = true,
    maxRetries = 3,
    description = '',
    delay = 0
  } = options;

  // Add job to the queue
  const queueJobId = await globalJobQueue.enqueue({
    type: jobType,
    payload,
    priority
  });

  // Get the existing job to merge metadata
  const existingJob = await backgroundJobRepository.getBackgroundJob(payload.backgroundJobId);
  const currentMetadata = existingJob?.metadata || {};

  // Update background job status to 'queued'
  await backgroundJobRepository.updateBackgroundJobStatus({
    jobId: payload.backgroundJobId,
    status: 'queued',
    statusMessage: `Queued for processing (${jobType})`,
    metadata: {
      ...currentMetadata,
      queueJobId, // Store the queue job ID for reference
      queuedAt: Date.now(),
      priority,
      // Store essential job information for workers
      jobTypeForWorker: jobType,
      jobPayloadForWorker: payload,
      jobPriorityForWorker: priority,
      // Add retry configuration
      retryEnabled,
      maxRetries,
      // Add queue information
      description: description || `${jobType} job`,
      delayMs: delay
    }
  });

  return queueJobId;
}

/**
 * Updates a background job to running status
 * 
 * This status indicates active processing of the job. The job will have a startTime
 * but no endTime as it's still in progress.
 * 
 * @param jobId Unique identifier for the job
 * @param apiType The API being used (gemini, claude, openrouter, etc.)
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
  
  try {
    // First get the job to check if we need to set startTime
    const existingJob = await backgroundJobRepository.getBackgroundJob(jobId);
    
    // Only set startTime if it's not already set
    const startTime = (existingJob && existingJob.startTime) ? existingJob.startTime : now;
  
    // Don't set endTime for running jobs - clear it if it somehow was set
    await backgroundJobRepository.updateBackgroundJobStatus({
      jobId: jobId,
      status: 'running' as JobStatus,
      startTime: startTime, // Keep existing startTime if available, otherwise set new one
      endTime: null,  // Explicitly set to null to clear any endTime that might be set
      statusMessage: statusMessage || `Processing with ${apiType.toUpperCase()} API`,
      metadata: {
        lastUpdateTime: now,
        apiType: apiType,
        runningUpdateCount: ((existingJob?.metadata?.runningUpdateCount || 0) + 1)
      }
    });
  } catch (error) {
    console.error(`Error updating job ${jobId} to running:`, error);
    // Still try a basic update if the above fails
    await backgroundJobRepository.updateBackgroundJobStatus({
      jobId: jobId,
      status: 'running' as JobStatus,
      statusMessage: statusMessage || `Processing with ${apiType.toUpperCase()} API`,
    });
  }
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
    tokensSent?: number;
    tokensReceived?: number;
    totalTokens?: number;
    modelUsed?: string;
    maxOutputTokens?: number;
    temperatureUsed?: number; // Parameter for final temperature
  } = {}
): Promise<void> {
  // Validate jobId
  if (!jobId || typeof jobId !== 'string' || !jobId.trim()) {
    throw new Error('Invalid job ID provided for updateJobToCompleted');
  }

  // Ensure we have a proper response text for the job
  if (responseText === null || responseText === undefined) {
    console.warn(`[JobHelper] Completing job ${jobId} with null response`);
    // Provide a default message to indicate completion but no textual output
    responseText = "Job completed with no output content.";
  }

  const now = Date.now();
  
  try {
    // First get the job to check current state
    const existingJob = await backgroundJobRepository.getBackgroundJob(jobId);

    // If job doesn't exist, log a warning but don't throw an error
    if (!existingJob) {
      console.warn(`[JobHelper] Attempted to complete job ${jobId} but it was not found. This may be due to session cleanup.`);
      // Return early instead of throwing an error - this allows the processor to continue
      return;
    }

    // Ensure we have a valid startTime for the job (needed for duration calculations)
    // If startTime is missing, fallback to createdAt or now
    const startTime = existingJob.startTime || existingJob.createdAt || now;
    
    // Get the effective temperature - use the one provided in tokens parameter if available,
    // otherwise fallback to existing metadata or the job's top-level field
    const temperature = tokens.temperatureUsed !== undefined ? 
      tokens.temperatureUsed : 
      (existingJob.metadata as any)?.temperature ?? existingJob.temperature;
    
    await backgroundJobRepository.updateBackgroundJobStatus({
      jobId,
      status: 'completed',
      startTime: startTime, // Ensure startTime is set before completing
      endTime: now,         // Always set endTime on completion
      response: responseText,
      statusMessage: `Completed successfully`,
      // Clear any error messages that might have been set earlier
      errorMessage: '',
      metadata: {
        tokensSent: tokens.tokensSent || existingJob.tokensSent || 0,
        tokensReceived: tokens.tokensReceived || existingJob.tokensReceived || 0,
        totalTokens: tokens.totalTokens || 
                   ((tokens.tokensReceived || existingJob.tokensReceived || 0) + 
                    (tokens.tokensSent || existingJob.tokensSent || 0)),
        lastUpdateTime: now,
        completedAt: now,
        duration: now - startTime, // Calculate duration in ms
        modelUsed: tokens.modelUsed || existingJob.modelUsed || undefined,
        maxOutputTokens: tokens.maxOutputTokens || existingJob.maxOutputTokens || undefined,
        temperature: temperature, // Include the temperature in metadata
      }
    });
  } catch (error) {
    console.error(`Error updating job ${jobId} to completed:`, error);
    // Still try a basic update if the above fails
    await backgroundJobRepository.updateBackgroundJobStatus({
      jobId,
      status: 'completed',
      endTime: now,
      response: responseText,
      statusMessage: `Completed successfully`,
    });
  }
}

/**
 * Updates a background job to failed status
 * 
 * This terminal status indicates the job encountered an error.
 * The job must have an errorMessage and endTime.
 * 
 * @param jobId Unique identifier for the job
 * @param errorMessage Description of the error that occurred
 * @param partialResponse Optional partial response content from the job
 */
export async function updateJobToFailed(
  jobId: string,
  errorMessage: string,
  partialResponse?: string
): Promise<void> {
  // Validate jobId
  if (!jobId || typeof jobId !== 'string' || !jobId.trim()) {
    throw new Error('Invalid job ID provided for updateJobToFailed');
  }

  // Ensure error message is never null/empty for a failed job
  if (errorMessage === null || errorMessage === undefined || errorMessage.trim() === '') {
    console.warn(`[JobHelper] Failed job ${jobId} with null/empty error message - setting default message`);
    // Always provide a default error message for failed jobs
    errorMessage = "Job failed without a specific error message.";
  }

  const now = Date.now();
  
  try {
    // First get the job to check current state
    const existingJob = await backgroundJobRepository.getBackgroundJob(jobId);

    // If job doesn't exist, log a warning but don't try to update it
    if (!existingJob) {
      console.warn(`[JobHelper] Attempted to mark job ${jobId} as failed but it was not found. This may be due to session cleanup.`);
      // Return early instead of attempting to update a non-existent job
      return;
    }

    // Ensure we have a valid startTime for the job (needed for duration calculations)
    // If startTime is missing, fallback to createdAt or now
    const startTime = existingJob.startTime || existingJob.createdAt || now;
    
    const updateParams: any = {
      jobId,
      status: 'failed',
      startTime: startTime, // Ensure startTime is set before completing
      endTime: now,         // Always set endTime on completion
      errorMessage,
      // Set a standard status message for failed jobs
      statusMessage: "Failed due to error",
      metadata: {
        lastUpdateTime: now,
        failedAt: now,
        duration: now - startTime, // Calculate duration in ms
        // Add error indication in metadata for analytics
        hasError: true
      }
    };
    
    // Include partial response if provided
    if (partialResponse) {
      updateParams.response = partialResponse;
      updateParams.metadata.partialResponse = true;
    }
    
    await backgroundJobRepository.updateBackgroundJobStatus(updateParams);
  } catch (error) {
    console.error(`Error updating job ${jobId} to failed:`, error);
    // Still try a basic update if the above fails
    await backgroundJobRepository.updateBackgroundJobStatus({
      jobId,
      status: 'failed',
      endTime: now,
      errorMessage,
      statusMessage: "Failed due to error",
    });
  }
}

/**
 * Updates a background job to cancelled status
 * 
 * This terminal status indicates the job was cancelled by user action.
 * The job will have an endTime and a standard cancel message.
 * 
 * @param jobId Unique identifier for the job
 * @param reason Optional reason for cancellation
 * @param partialResponse Optional partial response content from the job
 */
export async function updateJobToCancelled(
  jobId: string,
  reason?: string,
  partialResponse?: string
): Promise<void> {
  // Validate jobId
  if (!jobId || typeof jobId !== 'string' || !jobId.trim()) {
    throw new Error('Invalid job ID provided for updateJobToCancelled');
  }

  // Ensure reason is never null/empty for a canceled job
  if (reason === null || reason === undefined || reason.trim() === '') {
    console.warn(`[JobHelper] Cancelling job ${jobId} with null/empty reason - setting default message`);
    // Always provide a default reason for canceled jobs
    reason = "Job canceled without a specific reason.";
  }

  const now = Date.now();
  
  try {
    // First get the job to check current state
    const existingJob = await backgroundJobRepository.getBackgroundJob(jobId);
    
    // Ensure job exists
    if (!existingJob) {
      console.warn(`[JobHelper] Cannot mark job ${jobId} as cancelled: Job not found`);
      // Create a basic update instead of throwing
      await backgroundJobRepository.updateBackgroundJobStatus({
        jobId,
        status: 'canceled',
        endTime: now,
        statusMessage: "Canceled by user interaction",
        errorMessage: reason || "Canceled by user interaction"
      });
      return;
    }
    
    // Ensure we have a valid startTime for the job (needed for duration calculations)
    // If startTime is missing, fallback to createdAt or now
    const startTime = existingJob.startTime || existingJob.createdAt || now;
    
    const updateParams: any = {
      jobId,
      status: 'canceled',
      startTime: startTime, // Ensure startTime is set before completing
      endTime: now,         // Always set endTime on completion
      statusMessage: "Canceled by user interaction",
      errorMessage: reason,
      metadata: {
        lastUpdateTime: now,
        cancelledAt: now,
        duration: now - startTime, // Calculate duration in ms
        // Add cancel indication in metadata for analytics
        userCancelled: true
      }
    };
    
    // Include partial response if provided
    if (partialResponse) {
      updateParams.response = partialResponse;
      updateParams.metadata.partialResponse = true;
    }
    
    await backgroundJobRepository.updateBackgroundJobStatus(updateParams);
  } catch (error) {
    console.error(`Error updating job ${jobId} to cancelled:`, error);
    // Still try a basic update if the above fails
    await backgroundJobRepository.updateBackgroundJobStatus({
      jobId,
      status: 'canceled',
      endTime: now,
      statusMessage: "Canceled by user interaction",
      errorMessage: reason
    });
  }
}

/**
 * Handles an API error and updates the job status accordingly
 *
 * Standardized error handling that integrates with the ApiErrorType system
 * to provide consistent job status updates and error reporting.
 *
 * @param jobId Unique identifier for the job
 * @param status HTTP status code or other numeric error code
 * @param errorText Detailed error message
 * @param apiType The API that generated the error
 * @returns A promise that resolves when the job status is updated
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

  // Map the HTTP status code to a standardized error type
  const errorType = mapStatusCodeToErrorType(status);

  // Format error message with API name, status code, and error type
  const formattedMessage = `${apiType.toUpperCase()} API Error [${errorType}]: ${status} ${
    errorText.substring(0, 100)}${errorText.length > 100 ? '...' : ''}`;

  // Additional metadata for the error
  const errorMetadata = {
    errorType,
    statusCode: status,
    apiType,
    isRetryable: [
      ApiErrorType.NETWORK_ERROR,
      ApiErrorType.TIMEOUT_ERROR,
      ApiErrorType.RATE_LIMIT_ERROR,
      ApiErrorType.CAPACITY_ERROR,
      ApiErrorType.SERVER_ERROR,
      ApiErrorType.UNAVAILABLE
    ].includes(errorType)
  };

  // Update job metadata to include error information
  const existingJob = await backgroundJobRepository.getBackgroundJob(jobId);
  if (existingJob) {
    const currentMetadata = existingJob.metadata || {};

    // Update the background job with error details in metadata
    await backgroundJobRepository.updateBackgroundJobStatus({
      jobId,
      status: 'failed',
      errorMessage: formattedMessage,
      statusMessage: `Failed with ${errorType} error`,
      metadata: {
        ...currentMetadata,
        error: errorMetadata,
        lastErrorType: errorType,
        lastErrorTime: Date.now(),
        lastErrorStatus: status
      }
    });
  } else {
    // Fallback if job not found
    await updateJobToFailed(jobId, formattedMessage);
  }
}

/**
 * Gets a job by its ID with helpful error handling
 *
 * @param jobId The ID of the job to retrieve
 * @param includeResponse Whether to include the potentially large response field
 * @returns The job or null if not found
 */
export async function getJob(jobId: string, includeResponse: boolean = false): Promise<BackgroundJob | null> {
  try {
    if (!jobId || typeof jobId !== 'string' || !jobId.trim()) {
      console.warn('Invalid job ID provided for getJob');
      return null;
    }

    // The includeResponse parameter is ignored since the repository method doesn't support it
    return await backgroundJobRepository.getBackgroundJob(jobId);
  } catch (error) {
    console.error(`Error retrieving job ${jobId}:`, error);
    return null;
  }
}

/**
 * Utility function to check if a job exists and is in an active state
 *
 * @param jobId The ID of the job to check
 * @returns True if the job exists and is active, false otherwise
 */
export async function isJobActive(jobId: string): Promise<boolean> {
  try {
    const job = await getJob(jobId, false);
    return !!(job && job.status && JOB_STATUSES.ACTIVE.includes(job.status));
  } catch (error) {
    console.error(`Error checking job ${jobId} status:`, error);
    return false;
  }
}

/**
 * Cancels all background jobs for a session
 *
 * This utility finds and cancels all active jobs associated with a session
 *
 * @param sessionId The session to cancel jobs for
 * @param apiType Optional API type for logging purposes
 * @returns The number of jobs cancelled
 */
export async function cancelAllSessionJobs(
  sessionId: string,
  apiType: ApiType = 'gemini'
): Promise<number> {
  // Validate sessionId
  if (!sessionId || typeof sessionId !== 'string' || !sessionId.trim()) {
    throw new Error('Invalid session ID provided for cancelAllSessionJobs');
  }

  try {
    const jobs = await backgroundJobRepository.findBackgroundJobsBySessionId(sessionId);

    // Filter for active jobs that can be cancelled using the standard constants
    // Explicitly exclude implementation plan jobs
    const activeJobs = jobs.filter(job => 
      job.status && 
      JOB_STATUSES.ACTIVE.includes(job.status) && 
      job.taskType !== 'implementation_plan'
    );

    if (activeJobs.length === 0) {
      return 0;
    }

    console.log(`[Jobs] Cancelling ${activeJobs.length} active jobs for session ${sessionId}`);

    let cancelledCount = 0;

    // Mark each job as cancelled using the helper method for consistent behavior
    for (const job of activeJobs) {
      if (!job.id) continue; // Skip jobs with missing IDs

      try {
        // Use the updateJobToCancelled helper for standardized cancellation behavior
        await updateJobToCancelled(
          job.id,
          `Cancelled due to session action or cleanup`
        );
        cancelledCount++;
      } catch (error) {
        console.error(`Error cancelling job ${job.id}:`, error);
        // Continue with other jobs
      }
    }

    return cancelledCount;
  } catch (error) {
    console.error(`[${apiType.toUpperCase()} Client] Error cancelling session jobs:`, error);
    throw error;
  }
}