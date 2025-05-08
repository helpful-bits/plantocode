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
import { createWriteStream } from 'fs';
// Import SDK-based streaming handler
import { streamGeminiCompletionWithSDK, GeminiSdkRequestPayload } from '@/lib/api/clients/gemini/gemini-sdk-handler';
import { getProjectImplementationPlansDirectory } from '@/lib/path-utils';
import { GEMINI_FLASH_MODEL } from '@/lib/constants';
import { RequestType } from '@/lib/api/streaming-request-pool-types';

/**
 * Lazy-load the background job repository to avoid circular dependencies
 * This function returns a promise that resolves to the backgroundJobRepository instance
 */
async function getBackgroundJobRepository() {
  // Dynamic import to avoid circular dependencies
  const { backgroundJobRepository } = await import('@/lib/db/repositories/background-job-repository');
  return backgroundJobRepository;
}

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
      const filename = `plan_${backgroundJobId}_${timestamp}.xml`;
      const targetOutputFilePath = path.join(planDir, filename);
      
      // Ensure the directory exists
      await fs.mkdir(planDir, { recursive: true });

      // Update job status to reflect API request is about to start
      await updateJobToRunning(backgroundJobId, 'gemini', 'Sending request to Gemini API and processing stream');

      // Get API key from environment
      const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
      if (!apiKey) {
        throw new Error("Gemini API key not found in environment variables");
      }
      
      // Create an abort controller for timeout or manual cancellation
      const abortController = new AbortController();
      
      // Open a write stream to the output file
      const writeStream = createWriteStream(targetOutputFilePath);
      
      // Build Gemini API request payload
      const apiPayload: GeminiSdkRequestPayload = {
        contents: [
          {
            role: 'user',
            parts: [{ text: userPrompt }]
          }
        ],
        generationConfig: {
          maxOutputTokens: maxOutputTokens || 60000,
          temperature: temperature || 0.7,
          topP: 0.95,
          topK: 40,
        },
      };
      
      // Add system instruction if provided
      if (systemPrompt) {
        apiPayload.systemInstruction = {
          parts: [{ text: systemPrompt }]
        };
      }
      
      // Track counters
      let aggregatedText = '';
      let tokenCount = 0;
      let charCount = 0;
      
      try {
        // Get the background job repository - loaded only when needed
        const backgroundJobRepo = await getBackgroundJobRepository();
        
        // Sending request to Gemini API with streaming updates using SDK
        // We don't use the callback for database updates to avoid incremental response updates
        // This ensures the final response is set only once at completion time
        for await (const textChunk of streamGeminiCompletionWithSDK(
          apiPayload, 
          apiKey, 
          model || GEMINI_FLASH_MODEL, 
          abortController.signal
          // No callback for streaming database updates - we'll set the full response at the end
        )) {
          // Write each chunk to the file
          writeStream.write(textChunk);
          
          // Aggregate text and update counters
          aggregatedText += textChunk;
          charCount += textChunk.length;
          const chunkTokens = Math.ceil(textChunk.length / 3.5); // Approximate token count
          tokenCount += chunkTokens;
          
          // We can still update the job status or metadata if needed, but not the response field
          // This keeps UI progress without affecting the final response
          await updateJobToRunning(backgroundJobId, 'gemini', `Processing stream: Received ${Math.round(charCount / 1024)}KB`);
        }
        
        // Close the write stream
        writeStream.end();
        
        // Log the size of aggregatedText for debugging, but clarify we're using a placeholder in the DB
        console.log(`[ImplementationPlanProcessor] Job ${backgroundJobId} completed. Full content written to file (${aggregatedText?.length || 0} chars). Using placeholder for DB response.`);
        
        // Mark job as completed with a placeholder response instead of the full XML content
        // The full content is available in the output file
        const placeholderResponse = "Implementation plan generated successfully. Full content available in output file.";
        await updateJobToCompleted(backgroundJobId, placeholderResponse, {
          tokensReceived: tokenCount,
          outputFilePath: targetOutputFilePath,
          modelUsed: model,
          maxOutputTokens: maxOutputTokens,
        });
        
        // Successfully completed implementation plan generation
        
        return {
          success: true,
          message: "Successfully generated implementation plan",
          data: {
            planFilePath: targetOutputFilePath,
            tokens: tokenCount,
            chars: charCount
          }
        };
      } catch (error) {
        // Close the write stream in case of error
        writeStream.end();
        
        // Log the error
        console.error(`[ImplementationPlanProcessor] Gemini API request failed:`, error);
        
        // Update job status to failed
        await updateJobToFailed(
          backgroundJobId, 
          error instanceof Error ? error.message : String(error)
        );
        
        return {
          success: false,
          message: error instanceof Error ? error.message : "Failed to generate implementation plan",
          error: error instanceof Error ? error : new Error(String(error))
        };
      }
    } catch (error) {
      // Handle setup errors that occurred before starting the stream
      console.error(`[ImplementationPlanProcessor] Setup error:`, error);
      
      const errorMessage = error instanceof Error ? 
        error.message : 
        "Unknown error during implementation plan generation setup";
      
      // Update job status to failed
      await updateJobToFailed(backgroundJobId, errorMessage);
      
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