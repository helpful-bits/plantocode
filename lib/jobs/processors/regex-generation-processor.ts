import { JobProcessor, JobProcessResult } from '../job-processor-interface';
import { RegexGenerationPayload } from '../job-types';
import { updateJobToRunning, updateJobToCompleted, updateJobToFailed } from '../job-helpers';
import claudeClient from '@/lib/api/claude-client';
// Import regex prompts generator
import { generateRegexPatternPrompt } from '@/lib/prompts/regex-prompts';

/**
 * Regex Generation Processor
 * 
 * Processes jobs that generate regex patterns based on task description
 */
export class RegexGenerationProcessor implements JobProcessor<RegexGenerationPayload> {
  async process(payload: RegexGenerationPayload): Promise<JobProcessResult> {
    const { 
      backgroundJobId, 
      sessionId,
      projectDirectory,
      taskDescription,
      directoryTree
    } = payload;

    try {
      // Update job status to running
      await updateJobToRunning(backgroundJobId, 'claude', 'Generating regex patterns');

      // Generate the prompt
      const prompt = generateRegexPatternPrompt(taskDescription, directoryTree);

      // Call Claude API
      const result = await claudeClient.sendRequest({
        messages: [{ role: 'user', content: prompt }],
        model: 'claude-3-7-sonnet-20250219',
        max_tokens: 2048,
        temperature: 0.2 // Lower temperature for more precise regex
      });

      if (!result.isSuccess) {
        await updateJobToFailed(
          backgroundJobId, 
          result.message || "Failed to generate regex patterns"
        );
        
        return {
          success: false,
          message: result.message || "Failed to generate regex patterns",
          error: result.error
        };
      }

      // Parse the generated regex patterns
      const response = result.data as string;
      const patterns = this.extractRegexPatterns(response);

      // Update job to completed
      await updateJobToCompleted(
        backgroundJobId,
        response,
        {
          tokensSent: result.metadata?.tokensSent || 0,
          tokensReceived: result.metadata?.tokensReceived || 0,
          totalTokens: result.metadata?.totalTokens || 0,
          modelUsed: result.metadata?.modelUsed,
        }
      );

      return {
        success: true,
        message: `Successfully generated regex patterns. Found ${Object.keys(patterns).length} patterns.`,
        data: {
          rawResponse: response,
          patterns
        }
      };
    } catch (error) {
      // If any error occurs, mark the job as failed
      const errorMessage = error instanceof Error ? 
        error.message : 
        "Unknown error during regex generation";
      
      try {
        await updateJobToFailed(backgroundJobId, errorMessage);
      } catch (updateError) {
        console.error("[RegexGenerationProcessor] Error updating job status:", updateError);
      }

      return {
        success: false,
        message: errorMessage,
        error: error instanceof Error ? error : new Error(errorMessage)
      };
    }
  }

  /**
   * Extract regex patterns from Claude's response
   */
  private extractRegexPatterns(response: string): {
    titleRegex?: string;
    contentRegex?: string;
    negativeTitleRegex?: string;
    negativeContentRegex?: string;
  } {
    const patterns: {
      [key: string]: string | undefined;
      titleRegex?: string;
      contentRegex?: string;
      negativeTitleRegex?: string;
      negativeContentRegex?: string;
    } = {};

    console.log("[RegexGenerationProcessor] Extracting regex patterns from response");

    // First check for a JSON object with properties in the format { "field": "/pattern/" }
    // which is commonly returned by Claude but requires special handling
    try {
      // Look for JSON with regex patterns that include slashes
      const regexJsonMatch = response.match(/```(?:json)?\s*({[\s\S]*?})\s*```/);
      if (regexJsonMatch && regexJsonMatch[1]) {
        // First convert any regex literals (e.g., /pattern/) to strings before parsing
        const processedJson = regexJsonMatch[1].replace(/:\s*\/(.*?)\/([gim]*)(?=,|\s*})/g, ': "$1"');
        console.log("[RegexGenerationProcessor] Attempting to parse processed JSON:", processedJson.substring(0, 100) + "...");

        try {
          const jsonPatterns = JSON.parse(processedJson);

          patterns.titleRegex = jsonPatterns.titleRegex || jsonPatterns.title_regex || undefined;
          patterns.contentRegex = jsonPatterns.contentRegex || jsonPatterns.content_regex || undefined;
          patterns.negativeTitleRegex = jsonPatterns.negativeTitleRegex || jsonPatterns.negative_title_regex || undefined;
          patterns.negativeContentRegex = jsonPatterns.negativeContentRegex || jsonPatterns.negative_content_regex || undefined;

          // Check if we found any patterns - if we did, return early
          if (Object.keys(patterns).filter(k => patterns[k] !== undefined).length > 0) {
            console.log("[RegexGenerationProcessor] Successfully extracted patterns from processed JSON");
            return patterns;
          }
        } catch (e) {
          console.warn("[RegexGenerationProcessor] Failed to parse processed JSON:", e);
        }
      }
    } catch (e) {
      console.warn("[RegexGenerationProcessor] Error in regex JSON processing:", e);
    }

    // Try to extract standard JSON format
    const jsonMatch = response.match(/```(?:json)?\s*({[\s\S]*?})\s*```/);
    if (jsonMatch && jsonMatch[1]) {
      try {
        const jsonPatterns = JSON.parse(jsonMatch[1]);
        console.log("[RegexGenerationProcessor] Parsed JSON patterns:", Object.keys(jsonPatterns));

        patterns.titleRegex = jsonPatterns.titleRegex || jsonPatterns.title_regex || undefined;
        patterns.contentRegex = jsonPatterns.contentRegex || jsonPatterns.content_regex || undefined;
        patterns.negativeTitleRegex = jsonPatterns.negativeTitleRegex || jsonPatterns.negative_title_regex || undefined;
        patterns.negativeContentRegex = jsonPatterns.negativeContentRegex || jsonPatterns.negative_content_regex || undefined;

        // Check if we found any patterns - if we did, return early
        if (Object.keys(patterns).filter(k => patterns[k] !== undefined).length > 0) {
          console.log("[RegexGenerationProcessor] Successfully extracted patterns from JSON");
          return patterns;
        }
      } catch (e) {
        console.warn("[RegexGenerationProcessor] Failed to parse JSON patterns:", e);
        // Continue with regex extraction
      }
    }

    // Attempt to parse as a standalone JSON object outside code blocks
    try {
      // Look for a JSON-like structure in the plain text
      if (response.includes('{') && response.includes('}')) {
        const potentialJson = response.match(/({[\s\S]*})/);
        if (potentialJson && potentialJson[1]) {
          try {
            const jsonPatterns = JSON.parse(potentialJson[1]);

            patterns.titleRegex = jsonPatterns.titleRegex || jsonPatterns.title_regex || undefined;
            patterns.contentRegex = jsonPatterns.contentRegex || jsonPatterns.content_regex || undefined;
            patterns.negativeTitleRegex = jsonPatterns.negativeTitleRegex || jsonPatterns.negative_title_regex || undefined;
            patterns.negativeContentRegex = jsonPatterns.negativeContentRegex || jsonPatterns.negative_content_regex || undefined;

            // Check if we found any patterns
            if (Object.keys(patterns).filter(k => patterns[k] !== undefined).length > 0) {
              console.log("[RegexGenerationProcessor] Successfully extracted patterns from plain JSON");
              return patterns;
            }
          } catch (e) {
            console.warn("[RegexGenerationProcessor] Failed to parse plain JSON:", e);
          }
        }
      }
    } catch (e) {
      console.warn("[RegexGenerationProcessor] Error in plain JSON extraction:", e);
    }

    // Extract individual patterns with regex - improved to handle more formats
    // For title regex
    const titleMatch = response.match(/title(?:\s+regex)?[:\s=]+["`']?([^`"',\n]+)[`"']?|title(?:\s+regex)?[:\s=]+\/([^\/\n]+)\/[gim]*/i);
    if (titleMatch) {
      patterns.titleRegex = titleMatch[1] || titleMatch[2];
      console.log("[RegexGenerationProcessor] Found title regex:", patterns.titleRegex);
    }

    // For content regex
    const contentMatch = response.match(/content(?:\s+regex)?[:\s=]+["`']?([^`"',\n]+)[`"']?|content(?:\s+regex)?[:\s=]+\/([^\/\n]+)\/[gim]*/i);
    if (contentMatch) {
      patterns.contentRegex = contentMatch[1] || contentMatch[2];
      console.log("[RegexGenerationProcessor] Found content regex:", patterns.contentRegex);
    }

    // For negative title regex
    const negTitleMatch = response.match(/negative(?:\s+title)?(?:\s+regex)?[:\s=]+["`']?([^`"',\n]+)[`"']?|negative(?:\s+title)?(?:\s+regex)?[:\s=]+\/([^\/\n]+)\/[gim]*/i);
    if (negTitleMatch) {
      patterns.negativeTitleRegex = negTitleMatch[1] || negTitleMatch[2];
      console.log("[RegexGenerationProcessor] Found negative title regex:", patterns.negativeTitleRegex);
    }

    // For negative content regex
    const negContentMatch = response.match(/negative(?:\s+content)?(?:\s+regex)?[:\s=]+["`']?([^`"',\n]+)[`"']?|negative(?:\s+content)?(?:\s+regex)?[:\s=]+\/([^\/\n]+)\/[gim]*/i);
    if (negContentMatch) {
      patterns.negativeContentRegex = negContentMatch[1] || negContentMatch[2];
      console.log("[RegexGenerationProcessor] Found negative content regex:", patterns.negativeContentRegex);
    }

    // Log the results of the extraction
    const extractedPatternCount = Object.values(patterns).filter(Boolean).length;
    console.log(`[RegexGenerationProcessor] Extracted ${extractedPatternCount} patterns using regex matching`);

    return patterns;
  }
}

// Export the job type this processor handles
export const PROCESSOR_TYPE = 'REGEX_GENERATION';