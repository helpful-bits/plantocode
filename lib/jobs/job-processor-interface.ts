import { BaseJobPayload, AnyJobPayload } from './job-types';

/**
 * Standard result interface for job processing
 * This helps standardize error handling and success reporting across processors
 */
export interface JobProcessResult {
  success: boolean;
  message?: string;
  error?: Error;
  data?: any; // Optional data returned by the processor (if needed by other components)
  shouldRetry?: boolean; // Whether the job should be retried if it failed
  retryAfterMs?: number; // Optional delay before retry (not used in the current implementation)
}

/**
 * Interface for job processors.
 * Each job type will have its own processor implementation that handles the specific job logic.
 */
export interface JobProcessor<P extends BaseJobPayload = AnyJobPayload> {
  /**
   * Process a job with the given payload.
   * This is the main method that is called to execute the job.
   * 
   * @param payload The job payload containing all data needed to process the job
   * @returns A promise that resolves to a JobProcessResult indicating success or failure
   */
  process(payload: P): Promise<JobProcessResult>;
}