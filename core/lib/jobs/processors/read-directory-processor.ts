import { JobProcessor, JobProcessResult } from '../job-processor-interface';
import { BaseJobPayload } from '../job-types';
import { updateJobToRunning, updateJobToCompleted, updateJobToFailed } from '../job-helpers';
import fs from 'fs/promises';
import path from 'path';
import { generateDirectoryTree } from '@core/lib/directory-tree';

/**
 * Read Directory Payload interface
 * Extends BaseJobPayload with projectDirectory
 */
export interface ReadDirectoryPayload extends BaseJobPayload {
  projectDirectory: string;
}

/**
 * Read Directory Processor
 * 
 * Processes jobs that read and analyze directory structures
 */
export class ReadDirectoryProcessor implements JobProcessor<ReadDirectoryPayload> {
  async process(payload: ReadDirectoryPayload): Promise<JobProcessResult> {
    const { 
      backgroundJobId, 
      sessionId,
      projectDirectory
    } = payload;

    try {
      // Update job status to running
      await updateJobToRunning(backgroundJobId, 'gemini', 'Reading directory structure');

      // Validate directory exists
      try {
        const stats = await fs.stat(projectDirectory);
        if (!stats.isDirectory()) {
          await updateJobToFailed(backgroundJobId, `Path is not a directory: ${projectDirectory}`);
          return {
            success: false,
            message: `Path is not a directory: ${projectDirectory}`,
            error: new Error(`Path is not a directory: ${projectDirectory}`)
          };
        }
      } catch (error) {
        const errorMessage = `Directory does not exist or is not accessible: ${projectDirectory}`;
        await updateJobToFailed(backgroundJobId, errorMessage);
        return {
          success: false,
          message: errorMessage,
          error: error instanceof Error ? error : new Error(errorMessage)
        };
      }

      // Generate directory tree
      const directoryTree = await generateDirectoryTree(projectDirectory);
      
      // Update job to completed
      await updateJobToCompleted(
        backgroundJobId,
        directoryTree
      );

      return {
        success: true,
        message: "Successfully read directory structure",
        data: {
          directoryTree,
          projectDirectory
        }
      };
    } catch (error) {
      // If any error occurs, mark the job as failed
      const errorMessage = error instanceof Error ? 
        error.message : 
        "Unknown error during directory reading";
      
      try {
        await updateJobToFailed(backgroundJobId, errorMessage);
      } catch (updateError) {
        console.error("[ReadDirectoryProcessor] Error updating job status:", updateError);
      }

      return {
        success: false,
        message: errorMessage,
        error: error instanceof Error ? error : new Error(errorMessage)
      };
    }
  }
}

// Export the job type this processor handles
export const PROCESSOR_TYPE = 'READ_DIRECTORY';