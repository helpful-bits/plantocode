import { JobType } from './job-types';
import { JobProcessor } from './job-processor-interface';

/**
 * Registry for job processors.
 * Maps job types to their respective processor instances.
 */
export class JobRegistry {
  private processors: Map<JobType, JobProcessor<any>> = new Map();

  /**
   * Register a processor for a specific job type.
   * 
   * @param jobType The type of job this processor handles
   * @param processor The processor instance
   */
  register(jobType: JobType, processor: JobProcessor<any>): void {
    if (this.processors.has(jobType)) {
      console.warn(`[JobRegistry] Overwriting existing processor for job type ${jobType}`);
    }
    
    this.processors.set(jobType, processor);
    console.debug(`[JobRegistry] Registered processor for job type ${jobType}`);
  }

  /**
   * Get the processor for a specific job type.
   * 
   * @param jobType The type of job to get the processor for
   * @returns The processor or undefined if no processor is registered for this job type
   */
  getProcessor(jobType: JobType): JobProcessor<any> | undefined {
    return this.processors.get(jobType);
  }
  
  /**
   * Check if a processor is registered for a job type.
   * 
   * @param jobType The job type to check
   * @returns True if a processor is registered, false otherwise
   */
  hasProcessor(jobType: JobType): boolean {
    return this.processors.has(jobType);
  }
  
  /**
   * Get all registered job types.
   * 
   * @returns Array of registered job types
   */
  getRegisteredJobTypes(): JobType[] {
    return Array.from(this.processors.keys());
  }
}

// Export a singleton instance
export const jobRegistry = new JobRegistry();