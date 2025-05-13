import { JobProcessor, JobProcessResult } from '../job-processor-interface';
import { ImplementationPlanPayload } from '../job-types';
import {
  generateImplementationPlanSystemPrompt,
  generateImplementationPlanUserPrompt
} from '@/lib/prompts/implementation-plan-prompts';
import { updateJobToRunning, updateJobToCompleted, updateJobToFailed } from '../job-helpers';
import { generateDirectoryTree } from '@/lib/directory-tree';
import { loadFileContents } from '@/lib/file-utils';
import { ActionState } from '@/types';
// Import SDK-based streaming handler
import { streamGeminiCompletionWithSDK, GeminiSdkRequestPayload } from '@/lib/api/clients/gemini/gemini-sdk-handler';
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
  /**
   * Prepares the prompts for the implementation plan
   */
  private async _preparePrompts(payload: ImplementationPlanPayload): Promise<{ systemPrompt: string; userPrompt: string }> {
    const {
      backgroundJobId,
      projectDirectory,
      originalTaskDescription,
      relevantFiles,
      systemPrompt: customSystemPrompt
    } = payload;

    // Generate directory tree for context
    if (!projectDirectory) {
      throw new Error("Missing project directory in payload");
    }

    console.log(`[ImplementationPlanProcessor] Job ${backgroundJobId}: Loading file contents for ${relevantFiles.length} files`);

    // Load file contents directly from disk
    const fileContents = await loadFileContents(projectDirectory, relevantFiles);

    console.log(`[ImplementationPlanProcessor] Job ${backgroundJobId}: Successfully loaded ${Object.keys(fileContents).length} files`);
    if (Object.keys(fileContents).length > 0) {
      console.log(`[ImplementationPlanProcessor] Job ${backgroundJobId}: Loaded files: ${Object.keys(fileContents).slice(0, 5).join(', ')}${Object.keys(fileContents).length > 5 ? '...' : ''}`);
    }

    const projectStructure = await generateDirectoryTree(projectDirectory);

    // Generate prompts
    const systemPrompt = customSystemPrompt || generateImplementationPlanSystemPrompt();
    const userPrompt = generateImplementationPlanUserPrompt({
      originalDescription: originalTaskDescription,
      projectStructure,
      relevantFiles,
      fileContents: fileContents
    });

    // Log the size of the generated prompts
    console.log(`[ImplementationPlanProcessor] Job ${backgroundJobId}: Generated system prompt (${systemPrompt.length} chars) and user prompt (${userPrompt.length} chars)`);

    return { systemPrompt, userPrompt };
  }

  /**
   * Streams the implementation plan from Gemini API and saves to database
   */
  private async _streamPlanToDatabase(
    apiPayload: GeminiSdkRequestPayload,
    apiKey: string,
    model: string,
    backgroundJobId: string
  ): Promise<{
    aggregatedText: string;
    tokenCount: number;
    charCount: number;
  }> {
    // Create an abort controller for timeout or manual cancellation
    const abortController = new AbortController();

    // Get backgroundJobRepository instance to update job status during streaming
    const backgroundJobRepo = await getBackgroundJobRepository();

    // Track counters
    let aggregatedText = '';
    let tokenCount = 0;
    let charCount = 0;

    // Sending request to Gemini API with streaming updates using SDK
    console.log(`[ImplementationPlanProcessor] Job ${backgroundJobId}: Starting Gemini API streaming request to model: ${model}`);
    console.log(`[ImplementationPlanProcessor] Job ${backgroundJobId}: Request config - maxOutputTokens: ${apiPayload.generationConfig?.maxOutputTokens || 'undefined'}, temperature: ${apiPayload.generationConfig?.temperature || 'undefined'}`);

    let chunkCounter = 0;
    let lastLogTime = Date.now();
    const logInterval = 50; // Log every 50 chunks
    const logThreshold = 10000; // Or every 10KB
    const timeInterval = 10000; // Also log at least every 10 seconds

    try {
      for await (const textChunk of streamGeminiCompletionWithSDK(
        apiPayload,
        apiKey,
        model,
        abortController.signal
      )) {
        // Aggregate text and update counters
        aggregatedText += textChunk;
        charCount += textChunk.length;
        const chunkTokens = Math.ceil(textChunk.length / 3.5); // Approximate token count
        tokenCount += chunkTokens;

        // Update job response and streaming metadata in the database
        await backgroundJobRepo.appendToJobResponse(backgroundJobId, textChunk, chunkTokens, charCount);

        // Calculate estimated total length and progress percentage
        const estimatedTotalLength = (apiPayload.generationConfig?.maxOutputTokens || 60000) * 3.5;
        const calculatedProgress = estimatedTotalLength > 0 ? Math.min(Math.floor((charCount / estimatedTotalLength) * 100), 99) : 0;

        // Update streaming progress indicators
        await backgroundJobRepo.updateBackgroundJobStatus({
          jobId: backgroundJobId,
          status: 'running',
          metadata: {
            isStreaming: true,
            streamProgress: calculatedProgress,
            responseLength: charCount,
            lastStreamUpdateTime: Date.now(),
            estimatedTotalLength
          },
          statusMessage: `Streaming implementation plan... ${calculatedProgress}% complete`
        });

        // Increment chunk counter
        chunkCounter++;

        // Calculate time since last log
        const currentTime = Date.now();
        const timeSinceLastLog = currentTime - lastLogTime;

        // Log under any of these conditions:
        // 1. We've reached the chunk interval
        // 2. This chunk is larger than the threshold
        // 3. It's been more than timeInterval ms since our last log
        if (chunkCounter % logInterval === 0 ||
            textChunk.length > logThreshold ||
            timeSinceLastLog > timeInterval) {

          console.log(`[ImplementationPlanProcessor] Job ${backgroundJobId}: Received chunk #${chunkCounter}, length: ${textChunk.length}, cumulative chars: ${charCount}, estimated tokens: ${tokenCount}`);

          // Check for opening/closing tags in aggregated text so far
          const hasOpeningTag = /<implementation[-_]plan/i.test(aggregatedText);
          const hasClosingTag = /<\/implementation[-_]plan>/i.test(aggregatedText);

          if (hasOpeningTag && !hasClosingTag) {
            console.log(`[ImplementationPlanProcessor] Job ${backgroundJobId}: XML structure check - Opening tag found, waiting for closing tag`);
          } else if (hasOpeningTag && hasClosingTag) {
            console.log(`[ImplementationPlanProcessor] Job ${backgroundJobId}: XML structure check - Both opening and closing tags found, content looks complete`);
          } else if (!hasOpeningTag && aggregatedText.length > 1000) {
            console.log(`[ImplementationPlanProcessor] Job ${backgroundJobId}: XML structure check - Warning: No opening tag found yet after ${aggregatedText.length} characters`);
          }

          // Update last log time
          lastLogTime = currentTime;
        }
      }

      console.log(`[ImplementationPlanProcessor] Job ${backgroundJobId}: Stream completed, received ${chunkCounter} chunks, total chars: ${aggregatedText.length}, estimated tokens: ${tokenCount}`);

      return { aggregatedText, tokenCount, charCount };
    } catch (error) {
      console.error(`[ImplementationPlanProcessor] Job ${backgroundJobId}: Error during streaming:`, error);
      console.log(`[ImplementationPlanProcessor] Job ${backgroundJobId}: Content size at point of streaming failure: ${aggregatedText?.length || 0} chars`);

      throw error;
    }
  }

  /**
   * Validates the content of the implementation plan
   */
  private _validatePlanContent(
    aggregatedText: string,
    backgroundJobId: string
  ): string {
    console.log(`[ImplementationPlanProcessor] Job ${backgroundJobId}: Validating generated content of length ${aggregatedText.length}`);

    // Check if content is empty or whitespace only
    if (!aggregatedText || !aggregatedText.trim()) {
      throw new Error("Generated implementation plan is empty");
    }

    // Check for error indicators in the content
    if (aggregatedText.includes("[Request interrupted") ||
        aggregatedText.includes("Think hard!")) {
      throw new Error("Stream appears to have been interrupted");
    }

    // First, check if the content is wrapped in Markdown code fence
    let processedText = aggregatedText;
    const markdownFenceMatch = aggregatedText.match(/```(?:xml)?\s*([\s\S]*?)```/);

    if (markdownFenceMatch) {
      console.log(`[ImplementationPlanProcessor] Job ${backgroundJobId}: Detected markdown code fence around the content, extracting XML content`);
      // Extract the content inside the code fence
      const contentInsideFence = markdownFenceMatch[1];

      // Only use the extracted content if it contains XML tags
      if (contentInsideFence &&
          (contentInsideFence.includes("<implementation_plan") ||
           contentInsideFence.includes("<implementation-plan"))) {
        processedText = contentInsideFence;
        console.log(`[ImplementationPlanProcessor] Job ${backgroundJobId}: Successfully extracted XML content from markdown fence (${processedText.length} chars)`);
      } else {
        console.log(`[ImplementationPlanProcessor] Job ${backgroundJobId}: Extracted content from markdown fence does not contain XML tags, using original text`);
      }
    }

    // Validate XML structure - but allow for text before/after the XML content
    // This handles cases where AI might include introductory text, code blocks, etc.
    // And support both implementation_plan and implementation-plan tag formats
    const openingTagRegex = /<implementation[-_]plan/i;
    const closingTagRegex = /<\/implementation[-_]plan>/i;

    const openingTagMatch = processedText.match(openingTagRegex);
    const closingTagMatch = processedText.match(closingTagRegex);

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
    const closingTagText = processedText.substring(closingIndex, closingIndex + 30);
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

    if (xmlContentEnd < processedText.length) {
      console.log(`[ImplementationPlanProcessor] Job ${backgroundJobId}: Found ${processedText.length - xmlContentEnd} characters of text after XML content`);
    }

    console.log(`[ImplementationPlanProcessor] Job ${backgroundJobId}: Content validation successful`);

    // Extract the actual XML content
    const xmlContent = processedText.substring(xmlContentStart, xmlContentEnd);
    console.log(`[ImplementationPlanProcessor] Job ${backgroundJobId}: Extracted XML content of ${xmlContent.length} characters for summary generation`);

    return xmlContent;
  }

  /**
   * Finalizes a successful job, updating its status and metadata
   */
  private async _finalizeJobSuccess(
    backgroundJobId: string,
    aggregatedText: string,
    xmlContent: string,
    model: string | undefined,
    maxOutputTokens: number | undefined,
    tokenCount: number
  ): Promise<void> {
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
      `Plan contains ${stepCount} steps.\n` +
      `Size: ${(aggregatedText.length / 1024).toFixed(1)}KB | Tokens: ${tokenCount.toLocaleString()}`;

    console.log(`[ImplementationPlanProcessor] Job ${backgroundJobId}: Updating job status to completed`);

    // Get the background job repository
    const backgroundJobRepo = await getBackgroundJobRepository();

    // Update job to completed status with standard fields
    await updateJobToCompleted(backgroundJobId, xmlContent, {
      tokensReceived: tokenCount,
      outputFilePath: undefined,
      modelUsed: model,
      maxOutputTokens: maxOutputTokens,
      temperatureUsed: temperature // Use the temperature passed in the payload
    });

    // Update job with additional metadata in a separate call
    await backgroundJobRepo.updateBackgroundJobStatus({
      jobId: backgroundJobId,
      status: 'completed', // Required status property
      metadata: {
        planSize: aggregatedText.length,
        hasSteps: stepCount > 0,
        stepCount: stepCount,
        isStreaming: false // Explicitly mark as no longer streaming
      },
      statusMessage: `Plan generated successfully with ${stepCount} steps`
    });
  }

  /**
   * Handles errors during processing
   */
  private async _handleProcessingError(
    error: unknown,
    backgroundJobId: string
  ): Promise<void> {
    console.error(`[ImplementationPlanProcessor] Job ${backgroundJobId}: Error during processing:`, error);

    // Categorize the error for better diagnostics
    let errorType = "unknown";
    let errorStage = "processing";

    if (error instanceof Error) {
      // Determine the type of error
      if (error.name === 'TypeError' || error.name === 'ReferenceError') {
        errorType = "code";
      } else if (error.message.includes("API") || error.message.includes("token") || error.message.includes("key")) {
        errorType = "api";
      } else if (error.message.includes("file") || error.message.includes("read") || error.message.includes("write") || error.message.includes("path")) {
        errorType = "filesystem";
      } else if (error.message.includes("validation") || error.message.includes("malformed") || error.message.includes("incomplete") || error.message.includes("XML")) {
        errorType = "validation";
      } else if (error.message.includes("timeout") || error.message.includes("interrupted") || error.message.includes("aborted")) {
        errorType = "timeout";
      } else if (error.message.includes("permission") || error.message.includes("access")) {
        errorType = "permission";
      }

      // Determine at which stage the error occurred
      if (error.message.includes("prompt") || error.stack?.includes("_preparePrompts")) {
        errorStage = "prompt_preparation";
      } else if (error.message.includes("stream") || error.stack?.includes("_streamPlanToDatabase")) {
        errorStage = "streaming";
      } else if (error.message.includes("validate") || error.stack?.includes("_validatePlanContent")) {
        errorStage = "validation";
      } else if (error.message.includes("finalize") || error.stack?.includes("_finalizeJobSuccess")) {
        errorStage = "finalization";
      }
    }

    console.log(`[ImplementationPlanProcessor] Job ${backgroundJobId}: Error categorized as type: ${errorType}, stage: ${errorStage}`);

    // Create a clear error message that distinguishes between different types of failures
    let errorMessage = "Unknown error during implementation plan generation";
    if (error instanceof Error) {
      // Build a more informative error message based on the error type and stage
      if (errorType === "api") {
        errorMessage = `API error during ${errorStage}: ${error.message}`;
      } else if (errorType === "filesystem") {
        errorMessage = `File system error during ${errorStage}: ${error.message}`;
      } else if (errorType === "validation") {
        errorMessage = `Content validation failed: ${error.message}`;
      } else if (errorType === "timeout") {
        errorMessage = `Request timed out during ${errorStage}: ${error.message}`;
      } else if (errorType === "permission") {
        errorMessage = `Permission error during ${errorStage}: ${error.message}`;
      } else if (errorType === "code") {
        errorMessage = `Internal error during ${errorStage}: ${error.message}`;
      } else {
        // For other errors, still provide context about where the error occurred
        errorMessage = `Error during ${errorStage}: ${error.message}`;
      }
    }

    // Update job status to failed with the enhanced error message
    console.log(`[ImplementationPlanProcessor] Job ${backgroundJobId}: Updating job status to failed: ${errorMessage}`);
    await updateJobToFailed(backgroundJobId, errorMessage);

    // Update streaming metadata separately
    const backgroundJobRepo = await getBackgroundJobRepository();
    await backgroundJobRepo.updateBackgroundJobStatus({
      jobId: backgroundJobId,
      status: 'failed',
      metadata: { isStreaming: false },
      statusMessage: errorMessage
    });

    // Additional logging for troubleshooting
    console.log(`[ImplementationPlanProcessor] Job ${backgroundJobId}: Error handling complete`);
  }

  /**
   * Main process method that orchestrates the implementation plan generation
   */
  async process(payload: ImplementationPlanPayload): Promise<JobProcessResult> {
    const {
      backgroundJobId,
      sessionId,
      projectDirectory,
      originalTaskDescription,
      relevantFiles,
      temperature,
      model,
      maxOutputTokens
    } = payload;

    // Variables that might be needed in the catch block
    let aggregatedText = '';

    try {
      // Initial status update - job is now running with streaming flag
      // Calculate initial estimated total length
      const initialEstimatedTotalLength = (payload.maxOutputTokens || 60000) * 3.5;
      
      await updateJobToRunning(backgroundJobId, 'gemini', 'Preparing implementation plan generation');

      // Update with streaming metadata separately
      const backgroundJobRepo = await getBackgroundJobRepository();
      await backgroundJobRepo.updateBackgroundJobStatus({
        jobId: backgroundJobId,
        status: 'running',
        metadata: { 
          isStreaming: true, 
          estimatedTotalLength: initialEstimatedTotalLength
        },
        statusMessage: 'Initializing implementation plan generation...'
      });

      // Step 1: Prepare the prompts
      await updateJobToRunning(backgroundJobId, 'gemini', 'Generating prompts and context from project structure');
      
      // Update with more detailed status message
      await backgroundJobRepo.updateBackgroundJobStatus({
        jobId: backgroundJobId,
        status: 'running',
        statusMessage: 'Preparing prompts and project context...'
      });
      
      const { systemPrompt, userPrompt } = await this._preparePrompts(payload);

      // Step 2: Update job status to reflect API request is about to start
      await updateJobToRunning(backgroundJobId, 'gemini', 'Sending request to Gemini API and streaming plan');
      
      // Update with more detailed status message
      await backgroundJobRepo.updateBackgroundJobStatus({
        jobId: backgroundJobId,
        status: 'running',
        statusMessage: 'Connecting to AI model and streaming plan...'
      });

      // Get API key from environment
      const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
      if (!apiKey) {
        throw new Error("Gemini API key not found in environment variables");
      }

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

      // Step 3: Stream plan to the database
      // Update with more detailed status message
      await backgroundJobRepo.updateBackgroundJobStatus({
        jobId: backgroundJobId,
        status: 'running',
        statusMessage: 'Streaming implementation plan from AI model...'
      });
      
      const streamResult = await this._streamPlanToDatabase(
        apiPayload,
        apiKey,
        model || GEMINI_FLASH_MODEL,
        backgroundJobId
      );

      aggregatedText = streamResult.aggregatedText;

      // Step 4: Validate the plan content
      await updateJobToRunning(backgroundJobId, 'gemini', 'Validating implementation plan');
      
      // Update with more detailed status message
      await backgroundJobRepo.updateBackgroundJobStatus({
        jobId: backgroundJobId,
        status: 'running',
        statusMessage: 'Validating generated plan structure...'
      });
      
      const xmlContent = this._validatePlanContent(aggregatedText, backgroundJobId);

      // Before finalizing, update with one more status message
      await backgroundJobRepo.updateBackgroundJobStatus({
        jobId: backgroundJobId,
        status: 'running',
        statusMessage: 'Finalizing and saving plan...'
      });

      // Step 5: Finalize the job as successful
      await this._finalizeJobSuccess(
        backgroundJobId,
        aggregatedText,
        xmlContent,
        model,
        maxOutputTokens,
        streamResult.tokenCount
      );

      // Return success result
      return {
        success: true,
        message: "Successfully generated implementation plan",
        data: {
          tokens: streamResult.tokenCount,
          chars: streamResult.charCount
        }
      };
    } catch (error) {
      // Handle all errors centrally
      await this._handleProcessingError(error, backgroundJobId);

      // Return failure result
      return {
        success: false,
        message: error instanceof Error ? error.message : "Failed to generate implementation plan",
        error: error instanceof Error ? error : new Error(String(error))
      };
    }
  }
}

// Export the job type this processor handles
export const PROCESSOR_TYPE = 'IMPLEMENTATION_PLAN_GENERATION';