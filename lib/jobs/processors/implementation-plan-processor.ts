import { JobProcessor, JobProcessResult } from '../job-processor-interface';
import { ImplementationPlanPayload } from '../job-types';
import { 
  generateImplementationPlanSystemPrompt, 
  generateImplementationPlanUserPrompt 
} from '@/lib/prompts/implementation-plan-prompts';
import { updateJobToRunning } from '../job-helpers';
import { generateDirectoryTree } from '@/lib/directory-tree';
import { ActionState } from '@/types';
import path from 'path';
import fs from 'fs/promises';
// Import Gemini streaming client for streaming API requests
import geminiClient from '@/lib/api/clients/gemini';
import { getProjectImplementationPlansDirectory } from '@/lib/path-utils';

/**
 * Implementation Plan Processor
 * 
 * Handles the generation of implementation plans using the Gemini API
 */
export class ImplementationPlanProcessor implements JobProcessor<ImplementationPlanPayload> {
  async process(payload: ImplementationPlanPayload): Promise<JobProcessResult> {
    const { 
      backgroundJobId, 
      sessionId, 
      projectDirectory,
      originalTaskDescription,
      relevantFiles,
      fileContentsMap,
      temperature,
      model,
      maxOutputTokens,
      systemPrompt: customSystemPrompt
    } = payload;

    try {
      // Initial status update - job is now running
      await updateJobToRunning(backgroundJobId, 'gemini', 'Preparing implementation plan generation');

      // Generate directory tree for context
      if (!projectDirectory) {
        throw new Error("Missing project directory in payload");
      }
      
      // Update job status for prompt generation phase
      await updateJobToRunning(backgroundJobId, 'gemini', 'Generating prompts and context from project structure');
      
      const projectStructure = await generateDirectoryTree(projectDirectory);
      
      // Generate prompts
      const systemPrompt = customSystemPrompt || generateImplementationPlanSystemPrompt();
      const userPrompt = generateImplementationPlanUserPrompt({
        originalDescription: originalTaskDescription,
        projectStructure,
        relevantFiles,
        fileContents: fileContentsMap
      });

      // Update job status to reflect file preparation phase
      await updateJobToRunning(backgroundJobId, 'gemini', 'Preparing output file location');

      // Generate the output file path
      const planDir = getProjectImplementationPlansDirectory(projectDirectory);
      
      // Create a sanitized filename from the task description
      const sanitizedTaskDesc = originalTaskDescription
        .substring(0, 40)  // Take first 40 chars
        .replace(/[^\w\s]/g, '')  // Remove special chars
        .replace(/\s+/g, '_');  // Replace spaces with underscores
      
      // Generate the filename with timestamp
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const filename = `plan_${timestamp}_${sanitizedTaskDesc}.xml`;
      const targetOutputFilePath = path.join(planDir, filename);
      
      // Ensure the directory exists
      await fs.mkdir(planDir, { recursive: true });

      // Update job status to reflect API request is about to start
      await updateJobToRunning(backgroundJobId, 'gemini', 'Sending request to Gemini API and processing stream');

      // Make a streaming request to Gemini API using the streaming client
      console.log(`[ImplementationPlanProcessor] Sending request to Gemini API for job ${backgroundJobId}`);
      const result = await geminiClient.sendStreamingRequest(userPrompt, sessionId, {
        model,
        systemPrompt,
        temperature,
        maxOutputTokens,
        taskType: 'implementation_plan',
        outputFilePath: targetOutputFilePath,
        requestId: backgroundJobId, // Use the background job ID as the request ID for tracking
        projectDirectory,
        apiType: 'gemini',
        metadata: {
          sessionName: sessionId, // Use the session ID as a fallback session name
          taskDescription: originalTaskDescription
        }
      });

      // Debug log the result
      console.log(`[ImplementationPlanProcessor] Received result from Gemini API:`, {
        isSuccess: result.isSuccess,
        message: result.message,
        savedFilePath: result.data?.savedFilePath,
        hasError: !!result.error
      });

      // The streaming client handles job status updates (completed, failed) based on the result
      if (!result.isSuccess) {
        console.error(`[ImplementationPlanProcessor] Gemini API request failed:`, result.error || result.message);
        return {
          success: false,
          message: result.message || "Failed to generate implementation plan",
          error: result.error
        };
      }

      return {
        success: true,
        message: "Successfully generated implementation plan",
        data: {
          planFilePath: result.data?.savedFilePath || null
        }
      };
    } catch (error) {
      // If any error occurs, the streaming client should update the job to failed
      const errorMessage = error instanceof Error ? 
        error.message : 
        "Unknown error during implementation plan generation";
      
      return {
        success: false,
        message: errorMessage,
        error: error instanceof Error ? error : new Error(errorMessage)
      };
    }
  }

}

// Export the job type this processor handles
export const PROCESSOR_TYPE = 'IMPLEMENTATION_PLAN_GENERATION';