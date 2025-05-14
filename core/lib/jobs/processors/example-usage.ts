import { createBackgroundJob, enqueueJob } from '../job-helpers';
import { globalJobQueue } from '../global-job-queue';
import { registerAllProcessors } from './index';
import { JobScheduler } from '../job-scheduler';
import { ApiType, TaskType } from '@core/types/session-types';

/**
 * Example of how to use the global job queue system
 * This demonstrates the end-to-end flow from job creation to processing.
 * 
 * In a real application, this would be called from API routes or other entry points.
 */
export async function runJobQueueExample(): Promise<void> {
  console.log('Starting job queue example...');
  
  // 1. Register all processors (in production, this would be done at app startup)
  registerAllProcessors();
  
  // 2. Create a job scheduler with appropriate settings
  const jobScheduler = new JobScheduler({
    pollingIntervalMs: 500,         // Check for new jobs every 500ms
    concurrencyLimit: 3,            // Process up to 3 jobs at once
    jobTimeoutMs: 30000,            // 30 second timeout for each job
    debugMode: true                 // Enable debug logging
  });
  
  // 3. Start the job scheduler
  console.log('Starting job scheduler...');
  jobScheduler.start();
  
  try {
    // 4. Create a session ID for this example (in production, this would come from the session)
    const sessionId = `example-session-${Date.now()}`;
    
    // 5. Create a background job record
    console.log('Creating background job...');
    const job = await createBackgroundJob(
      sessionId,
      {
        apiType: 'gemini' as ApiType,
        taskType: 'implementation_plan' as TaskType,
        rawInput: 'Example task: Create a job queue system',
        temperature: 0.7,
        metadata: {
          exampleRun: true,
          testMode: true
        }
      }
    );
    
    // 6. Enqueue the job for processing
    console.log(`Enqueueing job ${job.id}...`);
    const queuedJobId = await enqueueJob(
      'GEMINI_REQUEST',
      {
        backgroundJobId: job.id,
        sessionId: sessionId,
        projectDirectory: process.cwd(),
        promptText: 'Example task: Create a job queue system',
        systemPrompt: 'You are a helpful AI assistant.',
        temperature: 0.7,
        taskType: 'implementation_plan' as TaskType,
        apiType: 'gemini' as ApiType,
        metadata: {
          modelUsed: 'gemini-pro',
          exampleRun: true
        }
      },
      5 // Priority (higher number = higher priority)
    );
    
    console.log(`Job enqueued with queue ID: ${queuedJobId}`);
    
    // 7. Let the scheduler run for a bit to process the job
    console.log('Waiting for job to be processed...');
    await new Promise(resolve => setTimeout(resolve, 10000));
    
    // 8. Get queue stats
    const stats = globalJobQueue.getStats();
    console.log('Queue stats:', stats);
    
  } catch (error) {
    console.error('Error in job queue example:', error);
  } finally {
    // 9. Stop the scheduler
    console.log('Stopping job scheduler...');
    jobScheduler.stop();
    
    console.log('Job queue example completed.');
  }
}

// If this file is run directly, execute the example
if (require.main === module) {
  runJobQueueExample()
    .then(() => process.exit(0))
    .catch(err => {
      console.error('Example failed with error:', err);
      process.exit(1);
    });
}