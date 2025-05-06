import { QueuedJob } from './job-types';
import { jobRegistry } from './job-registry';
import { globalJobQueue } from './global-job-queue';
import { JobProcessResult } from './job-processor-interface';
import { updateJobToFailed } from '../jobs/job-helpers';

/**
 * Dispatch a job to its appropriate processor.
 * 
 * @param queuedJob The job to dispatch
 * @returns A JobProcessResult indicating success or failure
 */
export async function dispatchJob(queuedJob: QueuedJob): Promise<JobProcessResult> {
  const { id, type, payload, attempt } = queuedJob;
  
  try {
    console.debug(`[JobDispatcher] Dispatching job ${id} of type ${type} (attempt ${attempt})`);
    
    // Get the processor for this job type
    const processor = jobRegistry.getProcessor(type);
    
    if (!processor) {
      // If no processor is registered, fail the job
      const errorMessage = `No processor registered for job type ${type}`;
      console.error(`[JobDispatcher] ${errorMessage}`);
      
      await updateJobToFailed(payload.backgroundJobId, errorMessage);
      
      // Return failure result without retry (configuration error, not transient)
      return { 
        success: false, 
        message: errorMessage, 
        error: new Error(errorMessage),
        shouldRetry: false
      };
    }
    
    // Process the job using the registered processor
    const result = await processor.process(payload);
    
    if (result.success) {
      console.debug(`[JobDispatcher] Successfully processed job ${id} of type ${type}`);
    } else {
      console.warn(`[JobDispatcher] Job ${id} of type ${type} failed: ${result.message}`);
      
      // If the job failed but didn't update the background job status,
      // make sure it's marked as failed
      if (!result.message?.includes('already updated')) {
        try {
          await updateJobToFailed(
            payload.backgroundJobId, 
            result.message || "Job processing failed with no specific error message"
          );
        } catch (updateError) {
          console.error(`[JobDispatcher] Failed to update job status after processor failure: ${updateError}`);
          // Continue with the result anyway
        }
      }
      
      // If we should retry (either explicitly or by default for certain errors)
      const shouldRetry = result.shouldRetry ?? isRetryableError(result.error);
      
      if (shouldRetry) {
        console.debug(`[JobDispatcher] Job ${id} of type ${type} will be retried`);
        
        // Attempt to re-enqueue the job
        const newJobId = await globalJobQueue.reEnqueue(queuedJob);
        
        if (newJobId) {
          console.debug(`[JobDispatcher] Job ${id} re-enqueued as ${newJobId} for retry`);
          // Update the result to indicate a retry is happening
          result.message = `${result.message || 'Job failed'} (Re-enqueued for retry)`;
        } else {
          console.debug(`[JobDispatcher] Job ${id} reached max retry attempts`);
          // Update message to indicate max retries reached
          result.message = `${result.message || 'Job failed'} (Max retry attempts reached)`;
        }
      }
    }
    
    return result;
    
  } catch (error: any) {
    // Handle unhandled errors during processor execution
    const errorMessage = `Unhandled error processing job ${id} of type ${type}: ${error.message}`;
    console.error(`[JobDispatcher] ${errorMessage}`, error);
    
    // Update the background job to failed status
    try {
      await updateJobToFailed(payload.backgroundJobId, errorMessage);
    } catch (updateError) {
      console.error(`[JobDispatcher] Failed to update job ${id} status to failed: ${updateError}`);
    }
    
    // Determine if this error should trigger a retry
    const shouldRetry = isRetryableError(error);
    
    if (shouldRetry) {
      // Attempt to re-enqueue the job
      const newJobId = await globalJobQueue.reEnqueue(queuedJob);
      
      if (newJobId) {
        console.debug(`[JobDispatcher] Job ${id} re-enqueued as ${newJobId} after unhandled error`);
      }
    }
    
    // Return a standardized error result
    return { 
      success: false, 
      message: errorMessage, 
      error, 
      shouldRetry 
    };
  }
}

/**
 * Determine if an error is retryable
 * 
 * @param error The error to check
 * @returns True if the error should trigger a retry, false otherwise
 */
function isRetryableError(error?: Error): boolean {
  if (!error) return false;
  
  // Network errors, timeouts, and rate limits are good candidates for retry
  const retryableErrorMessages = [
    'timeout',
    'network',
    'socket',
    'ECONNRESET',
    'ETIMEDOUT',
    'ENOTFOUND',
    'rate limit',
    'too many requests',
    '429', // HTTP 429 Too Many Requests
    '503', // HTTP 503 Service Unavailable
    'temporarily unavailable',
    'retry',
    'connection'
  ];
  
  // Check if the error message contains any retryable keywords
  const errorMessage = error.message.toLowerCase();
  return retryableErrorMessages.some(keyword => errorMessage.includes(keyword));
}