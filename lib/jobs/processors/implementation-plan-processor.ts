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

      console.log(`[ImplementationPlanProcessor] Target output file path: ${targetOutputFilePath}`);

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
          temperature: temperature !== undefined ? temperature : 0.7,
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
        console.log(`[ImplementationPlanProcessor] Job ${backgroundJobId}: Starting Gemini API streaming request`);

        let chunkCounter = 0;
        const logInterval = 50; // Log every 50 chunks
        const logThreshold = 10000; // Or every 10KB

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

          // Increment chunk counter
          chunkCounter++;

          // Log periodically to avoid excessive logging
          if (chunkCounter % logInterval === 0 || textChunk.length > logThreshold) {
            console.log(`[ImplementationPlanProcessor] Job ${backgroundJobId}: Received chunk #${chunkCounter}, length: ${textChunk.length}, cumulative chars: ${charCount}, estimated tokens: ${tokenCount}`);
          }
        }

        console.log(`[ImplementationPlanProcessor] Job ${backgroundJobId}: Stream completed, received ${chunkCounter} chunks, total chars: ${aggregatedText.length}, estimated tokens: ${tokenCount}`);

        // Before closing the stream, perform robust validation of the content
        // Check for common error indicators and validate XML structure
        console.log(`[ImplementationPlanProcessor] Job ${backgroundJobId}: Validating generated content`);

        // Check if content is empty or whitespace only
        if (!aggregatedText || !aggregatedText.trim()) {
          throw new Error("Generated implementation plan is empty");
        }

        // Check for error indicators in the content
        if (aggregatedText.includes("[Request interrupted") ||
            aggregatedText.includes("Think hard!")) {
          throw new Error("Stream appears to have been interrupted");
        }

        // Validate XML structure - but allow for text before/after the XML content
        // This handles cases where AI might include introductory text, code blocks, etc.
        // And support both implementation_plan and implementation-plan tag formats
        const openingTagRegex = /<implementation[-_]plan/i;
        const closingTagRegex = /<\/implementation[-_]plan>/i;

        const openingTagMatch = aggregatedText.match(openingTagRegex);
        const closingTagMatch = aggregatedText.match(closingTagRegex);

        if (!openingTagMatch) {
          console.error(`[ImplementationPlanProcessor] Job ${backgroundJobId}: Content missing opening implementation plan tag`);
          throw new Error("Generated implementation plan content is incomplete or malformed (missing opening tag)");
        }

        if (!closingTagMatch) {
          console.error(`[ImplementationPlanProcessor] Job ${backgroundJobId}: Content missing closing implementation plan tag`);
          throw new Error("Generated implementation plan content is incomplete or malformed (missing closing tag)");
        }

        // At this point, we know both matches exist, so we can safely use their indexes
        // TypeScript needs non-null assertion to understand this
        const openingIndex = openingTagMatch.index!;
        const closingIndex = closingTagMatch.index!;

        // Check that opening tag appears before closing tag
        if (openingIndex > closingIndex) {
          console.error(`[ImplementationPlanProcessor] Job ${backgroundJobId}: XML tags in incorrect order`);
          throw new Error("Generated implementation plan content has XML tags in wrong order");
        }

        // Extract the actual implementation plan XML content for later use
        const xmlContentStart = openingIndex;

        // Determine the exact closing tag used by finding it in the original text
        // We know the regex matched, so we know there's a closing tag at this position
        const closingTagText = aggregatedText.substring(closingIndex, closingIndex + 30);
        const closingTagMatch2 = closingTagText.match(/<\/implementation[-_]plan>/i);
        if (!closingTagMatch2) {
          // This should never happen, but just in case
          throw new Error("Failed to determine closing tag format");
        }
        const closingTagFound = closingTagMatch2[0];
        const xmlContentEnd = closingIndex + closingTagFound.length;

        // Log if we found any non-XML content
        if (xmlContentStart > 0) {
          console.log(`[ImplementationPlanProcessor] Job ${backgroundJobId}: Found ${xmlContentStart} characters of text before XML content`);
        }

        if (xmlContentEnd < aggregatedText.length) {
          console.log(`[ImplementationPlanProcessor] Job ${backgroundJobId}: Found ${aggregatedText.length - xmlContentEnd} characters of text after XML content`);
        }

        console.log(`[ImplementationPlanProcessor] Job ${backgroundJobId}: Content validation successful`);

        // Create a promise that resolves when the write stream is finished
        const streamFinished = new Promise<void>((resolve, reject) => {
          writeStream.on('finish', () => {
            console.log(`[ImplementationPlanProcessor] Job ${backgroundJobId}: Write stream finished successfully`);
            resolve();
          });
          writeStream.on('error', (error) => {
            console.error(`[ImplementationPlanProcessor] Job ${backgroundJobId}: Write stream error:`, error);
            reject(error);
          });
        });

        // Close the write stream
        console.log(`[ImplementationPlanProcessor] Job ${backgroundJobId}: Closing write stream`);
        writeStream.end();

        // Wait for the stream to finish writing to disk
        console.log(`[ImplementationPlanProcessor] Job ${backgroundJobId}: Waiting for file write to complete`);
        await streamFinished;
        console.log(`[ImplementationPlanProcessor] Job ${backgroundJobId}: File successfully written to ${targetOutputFilePath}`);

        // Log the size of aggregatedText for debugging
        console.log(`[ImplementationPlanProcessor] Job ${backgroundJobId} completed. Full content written to file (${aggregatedText?.length || 0} chars).`);

        // Now that content is validated and file is written successfully, we can extract summary information
        console.log(`[ImplementationPlanProcessor] Job ${backgroundJobId}: Extracting plan summary from validated content`);

        // Extract the actual XML content for summary generation
        // Using the indexes we found during validation (we know they exist at this point)
        const xmlContent = aggregatedText.substring(xmlContentStart, xmlContentEnd);
        console.log(`[ImplementationPlanProcessor] Job ${backgroundJobId}: Extracted XML content of ${xmlContent.length} characters for summary generation`);

        // Extract a brief summary from the parsed XML content
        let planSummary = '';
        // Match the content between opening and closing implementation plan tags
        // Support both hyphen and underscore formats
        const planTag = xmlContent.match(/<implementation[-_]plan[^>]*>([\s\S]*?)<\/implementation[-_]plan>/i);
        if (planTag && planTag[1]) {
            const stepsMatch = planTag[1].match(/<steps[^>]*>([\s\S]*?)<\/steps>/i);
            if (stepsMatch && stepsMatch[1]) {
                const stepMatch = stepsMatch[1].match(/<step[^>]*>[\s\S]*?<title>([\s\S]*?)<\/title>/i);
                if (stepMatch && stepMatch[1]) {
                    planSummary = `Plan includes step: "${stepMatch[1]}" and other steps...`;
                }
            }

            // If we can't extract steps, try to get the title
            if (!planSummary) {
                const titleMatch = planTag[1].match(/<title>([\s\S]*?)<\/title>/i);
                if (titleMatch && titleMatch[1]) {
                    planSummary = `Plan titled: "${titleMatch[1]}"`;
                }
            }
        }

        // Count the number of steps in the plan for metadata using the XML content
        const stepCount = (xmlContent.match(/<step\s/ig) || []).length;
        console.log(`[ImplementationPlanProcessor] Job ${backgroundJobId}: Extracted summary. Plan has ${stepCount} steps.`);

        // Create a comprehensive response message
        const responseText =
          `Implementation plan generated successfully.\n\n` +
          `${planSummary ? planSummary + '\n\n' : ''}` +
          `Full XML content stored in file: ${path.basename(targetOutputFilePath)}\n` +
          `File location: ${targetOutputFilePath}\n` +
          `Size: ${(aggregatedText.length / 1024).toFixed(1)}KB | Tokens: ${tokenCount.toLocaleString()}\n\n` +
          `You can view the full content in the file or reload it in this dialog.`;

        console.log(`[ImplementationPlanProcessor] Job ${backgroundJobId}: Updating job status to completed`);

        // Update the job with comprehensive metadata
        // For the properties that are not defined in the tokens type, use the metadata object properly
        await updateJobToCompleted(backgroundJobId, responseText, {
          tokensReceived: tokenCount,
          outputFilePath: targetOutputFilePath,
          modelUsed: model,
          maxOutputTokens: maxOutputTokens
        });

        // Update job with additional metadata in a separate call
        await backgroundJobRepo.updateBackgroundJobStatus({
          jobId: backgroundJobId,
          status: 'completed', // Required status property
          metadata: {
            planSize: aggregatedText.length,
            hasSteps: stepCount > 0,
            stepCount: stepCount,
            planFilename: path.basename(targetOutputFilePath)
          }
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
        // Make sure the write stream is properly closed in case of error
        if (writeStream.writable) {
          console.log(`[ImplementationPlanProcessor] Job ${backgroundJobId}: Closing write stream after error`);
          writeStream.end();
        }

        // Log the error and current state of aggregated text
        console.error(`[ImplementationPlanProcessor] Job ${backgroundJobId}: Error during streaming or content validation:`, error);
        console.log(`[ImplementationPlanProcessor] Job ${backgroundJobId}: Content size at point of failure: ${aggregatedText?.length || 0} chars`);

        // Always delete the output file if we reached this point as it's likely corrupted or incomplete
        try {
          console.log(`[ImplementationPlanProcessor] Job ${backgroundJobId}: Cleaning up incomplete/corrupted file: ${targetOutputFilePath}`);
          await fs.unlink(targetOutputFilePath).catch(e => {
            console.error(`[ImplementationPlanProcessor] Job ${backgroundJobId}: Failed to delete corrupted file: ${e.message}`);
          });
        } catch (cleanupError) {
          console.error(`[ImplementationPlanProcessor] Job ${backgroundJobId}: Error during file cleanup:`, cleanupError);
        }

        // Create a clear error message that distinguishes between streaming and validation failures
        let errorMessage = "Unknown error during implementation plan generation";
        if (error instanceof Error) {
          errorMessage = error.message;

          // Add context to the error message
          if (error.message.includes("malformed") || error.message.includes("incomplete")) {
            errorMessage = `Content validation failed: ${error.message}`;
          } else if (error.message.includes("interrupted")) {
            errorMessage = `Stream interrupted: ${error.message}`;
          }
        }

        // Update job status to failed with the enhanced error message
        console.log(`[ImplementationPlanProcessor] Job ${backgroundJobId}: Updating job status to failed: ${errorMessage}`);
        await updateJobToFailed(backgroundJobId, errorMessage);

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