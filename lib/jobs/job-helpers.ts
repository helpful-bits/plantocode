import { backgroundJobRepository } from '@/lib/db/repositories';
import { BackgroundJob, ApiType, TaskType, JobStatus } from '@/types/session-types';
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
    temperature = 0.7
  } = options;

  // Create the job
  const job = await backgroundJobRepository.createBackgroundJob(
    sessionId,
    apiType,
    taskType,
    rawInput,  // This is correctly passed to be stored as both prompt and rawInput
    includeSyntax,
    temperature,
    true // visible
  );
  
  // Update to preparing status
  await backgroundJobRepository.updateBackgroundJobStatus({
    jobId: job.id,
    status: 'preparing' as JobStatus,
    statusMessage: `Setting up ${apiType.toUpperCase()} API request`,
    metadata: {
      modelUsed: model,
      maxOutputTokens: options.maxOutputTokens
    }
  });
  
  return job;
}

/**
 * Updates a background job to running status
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
  await backgroundJobRepository.updateBackgroundJobStatus({
    jobId: jobId,
    status: 'running' as JobStatus,
    startTime: now, // Repository will normalize to seconds if needed
    statusMessage: statusMessage || `Processing with ${apiType.toUpperCase()} API`,
    metadata: {
      lastUpdateTime: now // Store lastUpdate in metadata instead
    }
  });
}

/**
 * Updates a background job to completed status
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

  const now = Date.now();
  await backgroundJobRepository.updateBackgroundJobStatus({
    jobId,
    status: 'completed',
    endTime: now,
    response: responseText,
    statusMessage: `Completed successfully`,
    metadata: {
      promptTokens: tokens.promptTokens || 0,
      completionTokens: tokens.completionTokens || 0,
      totalTokens: tokens.totalTokens || 0,
      lastUpdateTime: now // Store lastUpdate in metadata
    }
  });
}

/**
 * Updates a background job to failed status
 */
export async function updateJobToFailed(
  jobId: string,
  errorMessage: string
): Promise<void> {
  // Validate jobId
  if (!jobId || typeof jobId !== 'string' || !jobId.trim()) {
    throw new Error('Invalid job ID provided for updateJobToFailed');
  }

  const now = Date.now();
  await backgroundJobRepository.updateBackgroundJobStatus({
    jobId,
    status: 'failed',
    endTime: now,
    errorMessage,
    metadata: {
      lastUpdateTime: now // Store lastUpdate in metadata
    }
  });
}

/**
 * Updates a background job to cancelled status
 */
export async function updateJobToCancelled(
  jobId: string
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
    statusMessage: "Cancelled by user",
    metadata: {
      lastUpdateTime: now // Store lastUpdate in metadata
    }
  });
}

/**
 * Handles an API error and updates the job status accordingly
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

  const statusMessage = `${apiType.toUpperCase()} API Error: ${status} ${errorText.substring(0, 100)}${errorText.length > 100 ? '...' : ''}`;
  
  await backgroundJobRepository.updateBackgroundJobStatus({
    jobId: jobId,
    status: 'failed' as JobStatus,
    endTime: Date.now(), // Repository will normalize to seconds if needed
    statusMessage: statusMessage,
    errorMessage: errorText,
    metadata: {
      lastUpdateTime: Date.now() // Store lastUpdate in metadata
    }
  });
}

/**
 * Cancels all background jobs for a session
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
    
    // Filter for active jobs that can be cancelled
    const activeJobs = jobs.filter(job => 
      job.status === 'preparing' || 
      job.status === 'running' || 
      job.status === 'queued' || 
      job.status === 'created'
    );
    
    if (activeJobs.length === 0) {
      return;
    }
    
    // Mark each job as cancelled
    for (const job of activeJobs) {
      if (!job.id) continue; // Skip jobs with missing IDs
      
      await backgroundJobRepository.updateBackgroundJobStatus({
        jobId: job.id,
        status: 'canceled' as JobStatus,
        endTime: Date.now(), // Repository will normalize to seconds if needed
        response: job.response || job.modelOutput || '', // Use response first, fall back to modelOutput
        statusMessage: 'Cancelled due to session action',
        errorMessage: 'Cancelled due to session action',
        metadata: {
          lastUpdateTime: Date.now() // Store lastUpdate in metadata
        }
      });
    }
  } catch (error) {
    console.error(`[${apiType.toUpperCase()} Client] Error cancelling session jobs:`, error);
    throw error;
  }
} 