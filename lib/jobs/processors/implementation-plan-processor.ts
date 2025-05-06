import { JobProcessor, JobProcessResult } from '../job-processor-interface';
import { ImplementationPlanPayload } from '../job-types';
import { 
  generateImplementationPlanSystemPrompt, 
  generateImplementationPlanUserPrompt 
} from '@/lib/prompts/implementation-plan-prompts';
import { updateJobToRunning, updateJobToCompleted, updateJobToFailed } from '../job-helpers';
import { generateDirectoryTree } from '@/lib/directory-tree';
import { ActionState } from '@/types';
import path from 'path';
import fs from 'fs/promises';
// Import Gemini client for API requests
import geminiClient from '@/lib/api/clients/gemini';

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
      // Update job status to running
      await updateJobToRunning(backgroundJobId, 'gemini', 'Preparing implementation plan generation');

      // Generate directory tree for context
      if (!projectDirectory) {
        throw new Error("Missing project directory in payload");
      }
      const projectStructure = await generateDirectoryTree(projectDirectory);
      
      // Generate prompts
      const systemPrompt = customSystemPrompt || generateImplementationPlanSystemPrompt();
      const userPrompt = generateImplementationPlanUserPrompt({
        originalDescription: originalTaskDescription,
        projectStructure,
        relevantFiles,
        fileContents: fileContentsMap
      });

      // Update job status to reflect prompt preparation is complete
      await updateJobToRunning(backgroundJobId, 'gemini', 'Sending request to Gemini API');

      // Make direct request to Gemini API without going through streaming request pool
      const result = await geminiClient.sendRequest(userPrompt, {
        model,
        systemPrompt,
        temperature,
        maxOutputTokens,
      });

      if (!result.isSuccess) {
        await updateJobToFailed(
          backgroundJobId, 
          result.message || "Failed to generate implementation plan"
        );
        
        return {
          success: false,
          message: result.message || "Failed to generate implementation plan",
          error: result.error
        };
      }

      // Save the implementation plan to a file
      const response = result.data as string;
      
      // Validate project directory
      if (!projectDirectory) {
        throw new Error("Missing project directory in payload");
      }
      
      const planFilePath = await this.saveImplementationPlan(
        response, 
        projectDirectory, 
        sessionId, 
        originalTaskDescription
      );

      // Update job to completed
      await updateJobToCompleted(
        backgroundJobId,
        response,
        {
          tokensSent: result.metadata?.tokensSent || 0,
          tokensReceived: result.metadata?.tokensReceived || 0,
          totalTokens: result.metadata?.totalTokens || 0,
          modelUsed: result.metadata?.modelUsed || model,
          maxOutputTokens: maxOutputTokens,
          outputFilePath: planFilePath
        }
      );

      return {
        success: true,
        message: "Successfully generated implementation plan",
        data: {
          planContent: response,
          planFilePath
        }
      };
    } catch (error) {
      // If any error occurs, mark the job as failed
      const errorMessage = error instanceof Error ? 
        error.message : 
        "Unknown error during implementation plan generation";
      
      try {
        await updateJobToFailed(backgroundJobId, errorMessage);
      } catch (updateError) {
        console.error("[ImplementationPlanProcessor] Error updating job status:", updateError);
      }

      return {
        success: false,
        message: errorMessage,
        error: error instanceof Error ? error : new Error(errorMessage)
      };
    }
  }

  /**
   * Save the implementation plan to a file in the project directory
   */
  private async saveImplementationPlan(
    content: string,
    projectDirectory: string,
    sessionId: string,
    taskDescription: string
  ): Promise<string> {
    try {
      // Create a sanitized filename from the task description
      const sanitizedTaskDesc = taskDescription
        .substring(0, 40)  // Take first 40 chars
        .replace(/[^\w\s]/g, '')  // Remove special chars
        .replace(/\s+/g, '_');  // Replace spaces with underscores
      
      // Create the implementation plans directory if it doesn't exist
      const planDir = path.join(projectDirectory, 'implementation_plans');
      await fs.mkdir(planDir, { recursive: true });
      
      // Generate the filename with timestamp and session info
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const filename = `plan_${timestamp}_${sanitizedTaskDesc}.md`;
      const filePath = path.join(planDir, filename);
      
      // Write the content to the file
      await fs.writeFile(filePath, content, 'utf-8');
      
      console.debug(`[ImplementationPlanProcessor] Saved implementation plan to ${filePath}`);
      return filePath;
    } catch (error) {
      console.error('[ImplementationPlanProcessor] Error saving implementation plan:', error);
      throw error;
    }
  }
}

// Export the job type this processor handles
export const PROCESSOR_TYPE = 'IMPLEMENTATION_PLAN_GENERATION';