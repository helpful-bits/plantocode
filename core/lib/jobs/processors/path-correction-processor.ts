import { JobProcessor, JobProcessResult } from '../job-processor-interface';
import { PathCorrectionPayload } from '../job-types';
import { updateJobToRunning, updateJobToCompleted, updateJobToFailed } from '../job-helpers';
import geminiClient from '@core/lib/api/clients/gemini';

/**
 * Path Correction Processor
 * 
 * Processes jobs that correct malformed paths
 */
export class PathCorrectionProcessor implements JobProcessor<PathCorrectionPayload> {
  async process(payload: PathCorrectionPayload): Promise<JobProcessResult> {
    const { 
      backgroundJobId, 
      sessionId,
      projectDirectory,
      paths, // Raw paths string
      systemPrompt,
      temperature,
      maxOutputTokens,
      model,
      promptText
    } = payload;

    try {
      // Update job status to running
      await updateJobToRunning(backgroundJobId, 'gemini', 'Correcting paths');

      // Make request to Gemini API
      const result = await geminiClient.sendRequest(promptText, {
        model,
        systemPrompt,
        temperature,
        maxOutputTokens
      });

      if (!result.isSuccess) {
        await updateJobToFailed(
          backgroundJobId, 
          result.message || "Failed to correct paths"
        );
        
        return {
          success: false,
          message: result.message || "Failed to correct paths",
          error: result.error
        };
      }

      // Parse the corrected paths from the response
      const response = result.data as string;
      const correctedPaths = this.extractPaths(response);

      // Update job to completed
      await updateJobToCompleted(
        backgroundJobId,
        response,
        {
          tokensSent: result.metadata?.tokensSent || 0,
          tokensReceived: result.metadata?.tokensReceived || 0,
          totalTokens: result.metadata?.totalTokens || 0,
          modelUsed: result.metadata?.modelUsed || model,
          maxOutputTokens,
        }
      );

      return {
        success: true,
        message: `Successfully corrected paths. Found ${correctedPaths.length} paths.`,
        data: {
          rawResponse: response,
          correctedPaths
        }
      };
    } catch (error) {
      // If any error occurs, mark the job as failed
      const errorMessage = error instanceof Error ? 
        error.message : 
        "Unknown error during path correction";
      
      try {
        await updateJobToFailed(backgroundJobId, errorMessage);
      } catch (updateError) {
        console.error("[PathCorrectionProcessor] Error updating job status:", updateError);
      }

      return {
        success: false,
        message: errorMessage,
        error: error instanceof Error ? error : new Error(errorMessage)
      };
    }
  }

  /**
   * Extract paths from the Gemini response
   */
  private extractPaths(response: string): string[] {
    const paths: string[] = [];
    
    // First look for paths in a markdown code block with JSON format
    // Use a regex pattern without the 's' flag
    const jsonMatch = response.match(/```(?:json)?\s*(\[\s*"[^"]+(?:",\s*"[^"]+)*"\s*\])/);
    if (jsonMatch && jsonMatch[1]) {
      try {
        const jsonPaths = JSON.parse(jsonMatch[1]);
        if (Array.isArray(jsonPaths) && jsonPaths.every(p => typeof p === 'string')) {
          return jsonPaths;
        }
      } catch (e) {
        console.warn("[PathCorrectionProcessor] Failed to parse JSON paths:", e);
        // Continue with other extraction methods
      }
    }
    
    // Look for markdown list items
    const listItemsRegex = /[-*+]\s+`([^`]+)`|[-*+]\s+([^\s].*?)(?:\s*\n|$)/gm;
    let match;
    while ((match = listItemsRegex.exec(response)) !== null) {
      const path = match[1] || match[2];
      if (path && !paths.includes(path)) {
        paths.push(path.trim());
      }
    }
    
    // Also extract paths between backticks
    const backtickRegex = /`([^`\n]+)`/g;
    while ((match = backtickRegex.exec(response)) !== null) {
      const path = match[1];
      if (path && !paths.includes(path)) {
        paths.push(path.trim());
      }
    }
    
    // Deduplicate and filter out non-path items (like explanations)
    return paths
      .filter(Boolean)
      .filter(path => {
        // Basic path validation - should contain at least one / or . character
        // and not contain certain invalid characters 
        return (path.includes('/') || path.includes('.')) && 
               !path.includes('?') && 
               !path.includes('#') &&
               !path.includes('*');
      });
  }
}

// Export the job type this processor handles
export const PROCESSOR_TYPE = 'PATH_CORRECTION';