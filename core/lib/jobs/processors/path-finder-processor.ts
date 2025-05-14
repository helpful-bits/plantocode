import { JobProcessor, JobProcessResult } from '../job-processor-interface';
import { PathFinderPayload } from '../job-types';
import { updateJobToRunning, updateJobToCompleted, updateJobToFailed } from '../job-helpers';
import { generateDirectoryTree } from '@core/lib/directory-tree';
import { backgroundJobRepository, sessionRepository } from '@core/lib/db/repositories';
import { generatePathFinderSystemPrompt, generatePathFinderUserPrompt } from '@core/lib/prompts/path-finder-prompts';
import geminiClient from '@core/lib/api/clients/gemini';
import { normalizePathForComparison, parseFilePathsFromAIResponse } from '@core/lib/path-utils';

/**
 * Path Finder Processor
 *
 * Processes jobs that find relevant paths for a task based on the task description.
 * Ensures jobs remain visible and properly formatted for UI handling.
 */
export class PathFinderProcessor implements JobProcessor<PathFinderPayload> {
  async process(payload: PathFinderPayload): Promise<JobProcessResult> {
    const {
      backgroundJobId,
      sessionId,
      projectDirectory,
      taskDescription,
      modelOverride,
      systemPrompt,
      temperature,
      maxOutputTokens
    } = payload;

    try {
      // First, ensure the job is marked as visible before we start
      await this.ensureJobVisible(backgroundJobId);

      // Update job status to running
      await updateJobToRunning(backgroundJobId, 'gemini', 'Analyzing project to find relevant paths');

      // Validate required parameters
      if (!projectDirectory) {
        throw new Error("Missing project directory in payload");
      }

      if (!taskDescription) {
        throw new Error("Missing task description in payload");
      }

      // Generate directory tree for the LLM to analyze
      const projectStructure = await generateDirectoryTree(projectDirectory);

      // Generate the prompt with project structure and task description
      const userPrompt = generatePathFinderUserPrompt(projectStructure, taskDescription);

      // Make request to Gemini API
      const result = await geminiClient.sendRequest(userPrompt, {
        model: modelOverride,
        systemPrompt,
        temperature,
        maxOutputTokens
      });

      // Handle API request failure
      if (!result.isSuccess) {
        await this.handleJobFailure(
          backgroundJobId,
          result.message || "Failed to find relevant paths",
          result.error
        );
        return {
          success: false,
          message: result.message || "Failed to find relevant paths",
          error: result.error
        };
      }

      // Parse the response to extract paths
      const response = result.data as string;
      const paths = this.extractPaths(response, projectDirectory);

      // Handle case where no paths were found
      if (paths.length === 0) {
        const errorMessage = "No valid paths were found in the response";
        await this.handleJobFailure(backgroundJobId, errorMessage);
        return {
          success: false,
          message: errorMessage,
          error: new Error(errorMessage)
        };
      }

      // Prepare job response format - both human-readable list and structured JSON
      // The human-readable list is for display in the job card
      // The structured JSON in metadata helps with processing by the UI

      // Create a more informative human-readable format for display
      const pathsListDisplay = paths.length > 0
        ? `Found ${paths.length} relevant files for the task:\n\n${paths.join('\n')}`
        : 'No relevant paths found for the specified task';

      // Group files by directory for better organization in UI
      const filesByDirectory: Record<string, string[]> = {};
      paths.forEach(path => {
        const dir = path.split('/').slice(0, -1).join('/') || '.';
        if (!filesByDirectory[dir]) {
          filesByDirectory[dir] = [];
        }
        filesByDirectory[dir].push(path);
      });

      // Create a more comprehensive structured data object for the metadata
      const structuredData = JSON.stringify({
        paths,
        count: paths.length,
        sessionId,
        timestamp: Date.now(),
        // Add these additional fields for better UI handling
        filesByDirectory,
        dirs: Object.keys(filesByDirectory).sort(),
        taskDescriptionUsed: taskDescription.substring(0, 100) + (taskDescription.length > 100 ? '...' : ''),
        modelUsed: result.metadata?.modelUsed || modelOverride
      });

      // Check if job still exists before updating
      const jobStillExists = await backgroundJobRepository.getBackgroundJob(backgroundJobId);
      if (!jobStillExists) {
        console.warn(`[PathFinderProcessor] Job ${backgroundJobId} not found before completion.`);
        // Return paths anyway so caller can use them
        return {
          success: true,
          message: `Successfully found ${paths.length} relevant paths (Note: job was removed)`,
          data: {
            paths,
            rawResponse: response
          }
        };
      }

      // Make sure job is visible before updating
      await this.ensureJobVisible(backgroundJobId);

      // Update job to completed with both human-readable and structured data
      await updateJobToCompleted(
        backgroundJobId,
        pathsListDisplay, // Human-readable response for display
        {
          tokensSent: result.metadata?.tokensSent || 0,
          tokensReceived: result.metadata?.tokensReceived || 0,
          totalTokens: result.metadata?.totalTokens || 0,
          modelUsed: result.metadata?.modelUsed || modelOverride,
          maxOutputTokens,
          // Add additional metadata with custom fields
          ...{
            pathData: structuredData, // Add structured data to metadata for easier parsing
            pathCount: paths.length
          }
        }
      );

      // Final visibility check to ensure the job remains visible after completion
      await this.ensureJobVisible(backgroundJobId);

      console.log(`[PathFinderProcessor] Job ${backgroundJobId} completed with ${paths.length} paths`);

      return {
        success: true,
        message: `Successfully found ${paths.length} relevant paths`,
        data: {
          paths,
          rawResponse: response
        }
      };
    } catch (error) {
      await this.handleJobFailure(
        backgroundJobId,
        error instanceof Error ? error.message : "Unknown error during path finding",
        error instanceof Error ? error : undefined
      );

      return {
        success: false,
        message: error instanceof Error ? error.message : "Unknown error during path finding",
        error: error instanceof Error ? error : new Error("Unknown error during path finding")
      };
    }
  }

  /**
   * Ensures a job is marked as visible in the UI
   */
  private async ensureJobVisible(jobId: string): Promise<void> {
    try {
      await backgroundJobRepository.updateBackgroundJobClearedStatus(jobId, false);
    } catch (error) {
      console.warn(`[PathFinderProcessor] Error ensuring job visibility for ${jobId}:`, error);
      // Continue anyway - this is a non-critical operation
    }
  }

  /**
   * Handles job failure with consistent error reporting and visibility
   */
  private async handleJobFailure(jobId: string, errorMessage: string, error?: any): Promise<void> {
    try {
      // Check if job exists before trying to update it
      const jobExists = await backgroundJobRepository.getBackgroundJob(jobId);
      if (!jobExists) {
        console.warn(`[PathFinderProcessor] Job ${jobId} not found when attempting to mark as failed.`);
        return; // Don't try to update non-existent job
      }

      // Ensure job is visible
      await this.ensureJobVisible(jobId);

      // Update job to failed status
      await updateJobToFailed(jobId, errorMessage);

      // Double-check visibility after update
      await this.ensureJobVisible(jobId);

      // Log detailed error for debugging
      if (error) {
        console.error(`[PathFinderProcessor] Error details for job ${jobId}:`, error);
      }
    } catch (updateError) {
      console.error(`[PathFinderProcessor] Error updating job ${jobId} failure status:`, updateError);
    }
  }

  /**
   * Extract and normalize paths from the LLM response
   */
  private extractPaths(response: string, projectDirectory?: string): string[] {
    // Use the centralized path parsing utility
    const rawPaths = parseFilePathsFromAIResponse(response, projectDirectory);

    // Process and normalize paths
    const normalizedPaths = rawPaths
      .map(path => {
        if (!path) return '';

        let cleanPath = path;

        // If path is absolute and starts with project directory, make it relative
        if (projectDirectory && cleanPath.startsWith(projectDirectory)) {
          cleanPath = cleanPath.substring(projectDirectory.length);
        }

        // Remove leading slash to ensure it's relative
        if (cleanPath.startsWith('/')) {
          cleanPath = cleanPath.substring(1);
        }

        // Apply consistent normalization
        return normalizePathForComparison(cleanPath);
      })
      .filter(Boolean) // Remove empty paths
      .filter((path, index, self) => self.indexOf(path) === index); // Remove duplicates

    return normalizedPaths;
  }
}

// Export the job type this processor handles
export const PROCESSOR_TYPE = 'PATH_FINDER';