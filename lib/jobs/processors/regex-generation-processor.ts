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
      titleRegex?: string; 
      contentRegex?: string; 
      negativeTitleRegex?: string; 
      negativeContentRegex?: string; 
    } = {};

    // Try to extract JSON format first if available
    const jsonMatch = response.match(/```(?:json)?\s*({[\s\S]*?})\s*```/);
    if (jsonMatch && jsonMatch[1]) {
      try {
        const jsonPatterns = JSON.parse(jsonMatch[1]);
        
        patterns.titleRegex = jsonPatterns.titleRegex || jsonPatterns.title_regex || undefined;
        patterns.contentRegex = jsonPatterns.contentRegex || jsonPatterns.content_regex || undefined;
        patterns.negativeTitleRegex = jsonPatterns.negativeTitleRegex || jsonPatterns.negative_title_regex || undefined;
        patterns.negativeContentRegex = jsonPatterns.negativeContentRegex || jsonPatterns.negative_content_regex || undefined;
        
        // Check if we found all patterns - if we did, return early
        if (Object.keys(patterns).length > 0) {
          return patterns;
        }
      } catch (e) {
        console.warn("[RegexGenerationProcessor] Failed to parse JSON patterns:", e);
        // Continue with regex extraction
      }
    }

    // Extract individual patterns with regex
    const titleMatch = response.match(/title(?:\s+regex)?:\s*`([^`]+)`|title(?:\s+regex)?:\s*"([^"]+)"|title(?:\s+regex)?:\s*\/([^\/]+)\//i);
    if (titleMatch) {
      patterns.titleRegex = titleMatch[1] || titleMatch[2] || titleMatch[3];
    }

    const contentMatch = response.match(/content(?:\s+regex)?:\s*`([^`]+)`|content(?:\s+regex)?:\s*"([^"]+)"|content(?:\s+regex)?:\s*\/([^\/]+)\//i);
    if (contentMatch) {
      patterns.contentRegex = contentMatch[1] || contentMatch[2] || contentMatch[3];
    }

    const negTitleMatch = response.match(/negative(?:\s+title)?(?:\s+regex)?:\s*`([^`]+)`|negative(?:\s+title)?(?:\s+regex)?:\s*"([^"]+)"|negative(?:\s+title)?(?:\s+regex)?:\s*\/([^\/]+)\//i);
    if (negTitleMatch) {
      patterns.negativeTitleRegex = negTitleMatch[1] || negTitleMatch[2] || negTitleMatch[3];
    }

    const negContentMatch = response.match(/negative(?:\s+content)?(?:\s+regex)?:\s*`([^`]+)`|negative(?:\s+content)?(?:\s+regex)?:\s*"([^"]+)"|negative(?:\s+content)?(?:\s+regex)?:\s*\/([^\/]+)\//i);
    if (negContentMatch) {
      patterns.negativeContentRegex = negContentMatch[1] || negContentMatch[2] || negContentMatch[3];
    }

    return patterns;
  }
}

// Export the job type this processor handles
export const PROCESSOR_TYPE = 'REGEX_GENERATION';