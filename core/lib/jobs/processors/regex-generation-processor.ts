import { JobProcessor, JobProcessResult } from '../job-processor-interface';
import { RegexGenerationPayload } from '../job-types';
import { updateJobToRunning, updateJobToCompleted, updateJobToFailed } from '../job-helpers';

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

      // The prompt content is expected to be already in the job's rawInput
      // Extract Claude API parameters from job metadata or use defaults
      const apiKey = process.env.ANTHROPIC_API_KEY;
      if (!apiKey) {
        await updateJobToFailed(backgroundJobId, "Anthropic API key is not configured");
        return {
          success: false,
          message: "Anthropic API key is not configured",
          error: new Error("Anthropic API key is not configured")
        };
      }

      // Retrieve the job to get the raw prompt and metadata
      const { backgroundJobRepository } = await import('@core/lib/db/repositories');
      const job = await backgroundJobRepository.getBackgroundJob(backgroundJobId);

      if (!job) {
        await updateJobToFailed(backgroundJobId, "Background job not found");
        return {
          success: false,
          message: "Background job not found",
          error: new Error("Background job not found")
        };
      }

      const promptContent = job.prompt; // Use job.prompt instead of rawInput
      const metadata = job.metadata || {};

      // Extract parameters from metadata or use defaults
      const model = metadata.model || 'claude-3-7-sonnet-20250219';
      const maxTokens = metadata.max_tokens || 1024;
      const temperature = metadata.temperature || 0.2;

      // Make a direct API call to Claude
      const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
      const ANTHROPIC_VERSION = "2023-06-01";

      console.log(`[RegexGenerationProcessor] Calling Claude API directly with model ${model}`);

      const response = await fetch(ANTHROPIC_API_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": ANTHROPIC_VERSION,
        },
        body: JSON.stringify({
          model: model,
          max_tokens: maxTokens,
          messages: [{ role: "user", content: promptContent }],
          temperature: temperature
        }),
      });

      if (!response.ok) {
        const errText = await response.text();
        console.error(`[RegexGenerationProcessor] Anthropic API error: ${response.status} ${errText}`);

        await updateJobToFailed(
          backgroundJobId,
          `API error: ${response.status} ${errText.substring(0, 100)}`
        );

        return {
          success: false,
          message: `API error: ${errText.slice(0, 150)}`,
          error: new Error(`API error ${response.status}: ${errText.slice(0, 150)}`)
        };
      }

      const data = await response.json();

      // Validate response
      if (!data.content || data.content.length === 0 || typeof data.content[0].text !== 'string') {
        const errorMsg = "Anthropic returned an invalid response structure.";
        console.error(`[RegexGenerationProcessor] ${errorMsg}`, JSON.stringify(data).slice(0, 500));

        await updateJobToFailed(backgroundJobId, errorMsg);

        return {
          success: false,
          message: errorMsg,
          error: new Error(errorMsg)
        };
      }

      // Get the text content from the response
      const responseText = data.content[0].text.trim();

      // Extract token counts from the response usage metadata
      const tokensSent = data.usage?.input_tokens || 0;
      const tokensReceived = data.usage?.output_tokens || 0;

      // Parse the generated regex patterns
      let parsedJson: any = null;
      let parseError: Error | null = null;
      let regexPatterns: any = {
        titleRegex: '',
        contentRegex: '',
        negativeTitleRegex: '',
        negativeContentRegex: ''
      };

      // Try to parse the response directly as JSON first
      try {
        parsedJson = JSON.parse(responseText);
        console.log("[RegexGenerationProcessor] Successfully parsed response as direct JSON");
      } catch (e) {
        parseError = e as Error;
        console.warn("[RegexGenerationProcessor] Failed to parse response as JSON directly:", e);

        // Fallback: Try to extract JSON from markdown code blocks
        const jsonMatch = responseText.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
        if (jsonMatch && jsonMatch[1]) {
          try {
            parsedJson = JSON.parse(jsonMatch[1].trim());
            parseError = null;
            console.log("[RegexGenerationProcessor] Successfully parsed JSON from code block");
          } catch (e2) {
            console.error("[RegexGenerationProcessor] Failed to parse extracted JSON from code block:", e2);
          }
        }

        // If still not successful, try to extract JSON from anywhere in the text
        if (!parsedJson) {
          const potentialJson = responseText.match(/({[\s\S]*})/);
          if (potentialJson && potentialJson[1]) {
            try {
              parsedJson = JSON.parse(potentialJson[1].trim());
              parseError = null;
              console.log("[RegexGenerationProcessor] Successfully parsed JSON from plaintext extraction");
            } catch (e3) {
              console.error("[RegexGenerationProcessor] Failed to parse JSON from plaintext extraction:", e3);
            }
          }
        }
      }

      // If we have successfully parsed JSON, extract the patterns
      if (parsedJson) {
        regexPatterns = {
          titleRegex: parsedJson.titleRegex || '',
          contentRegex: parsedJson.contentRegex || '',
          negativeTitleRegex: parsedJson.negativeTitleRegex || '',
          negativeContentRegex: parsedJson.negativeContentRegex || ''
        };

        console.log("[RegexGenerationProcessor] Extracted structured regex patterns:", Object.keys(regexPatterns));
      } else {
        console.warn("[RegexGenerationProcessor] Could not parse JSON, patterns will be empty");
      }

      // Get the existing job to access existing metadata
      const finalMetadata = {
        ...metadata,
        regexPatterns,  // This is the structured regex patterns object
        tokensSent,
        tokensReceived,
        totalTokens: tokensSent + tokensReceived,
        modelUsed: model
      };

      // Debugging log to verify what's being stored
      console.log("[RegexGenerationProcessor] Final metadata for job:", finalMetadata);
      console.log("[RegexGenerationProcessor] Regex patterns in metadata:", finalMetadata.regexPatterns);

      // Update job to completed with the regex patterns in metadata
      await backgroundJobRepository.updateBackgroundJobStatus({
        jobId: backgroundJobId,
        status: 'completed',
        responseText: responseText,
        endTime: Date.now(),
        statusMessage: 'Completed successfully',
        metadata: finalMetadata
      });

      return {
        success: true,
        message: `Successfully generated regex patterns. Found ${Object.keys(regexPatterns).filter(k => regexPatterns[k]).length} patterns.`,
        data: {
          rawResponse: responseText,
          patterns: regexPatterns
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
}

// Export the job type this processor handles
export const PROCESSOR_TYPE = 'REGEX_GENERATION';