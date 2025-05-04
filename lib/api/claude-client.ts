import { ActionState, BackgroundJob } from "@/types";
import crypto from 'crypto';
import { setupDatabase } from "@/lib/db";
import { backgroundJobRepository } from '@/lib/db/repositories';
import { getModelSettingsForProject } from "@/actions/project-settings-actions";
import { TaskType } from "@/types/session-types";
import streamingRequestPool, { RequestType } from '@/lib/api/streaming-request-pool';
import { ApiType } from '@/types/session-types';
import { 
  createBackgroundJob,
  updateJobToRunning,
  updateJobToCompleted,
  updateJobToFailed,
  handleApiError,
  cancelAllSessionJobs
} from '@/lib/jobs/job-helpers';

// Constants
const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";
const DEFAULT_MODEL = "claude-3-7-sonnet-20250219";

// Types
export interface ClaudeRequestPayload {
  messages: { role: string; content: string }[];
  max_tokens?: number;
  temperature?: number;
  top_p?: number;
  top_k?: number;
  system?: string;
  model?: string;
}

export interface ClaudeResponse {
  content: { type: string; text: string }[];
  usage?: { input_tokens: number, output_tokens: number };
}

class ClaudeClient {
  /**
   * Send a request to Claude API with automatic queueing, rate limiting and retries
   */
  async sendRequest(
    payload: ClaudeRequestPayload, 
    sessionId?: string,
    taskType: string = 'text_improvement',
    projectDirectory?: string
  ): Promise<ActionState<string | { isBackgroundJob: true, jobId: string }>> {
    // Get API key from environment
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return { isSuccess: false, message: "Anthropic API key is not configured." };
    }
    
    let job: BackgroundJob | null = null;
    
    // Load project settings if project directory is provided
    let modelSettings = null;
    if (projectDirectory) {
      try {
        modelSettings = await getModelSettingsForProject(projectDirectory);
        if (modelSettings && modelSettings[taskType as keyof typeof modelSettings]) {
          const settings = modelSettings[taskType as keyof typeof modelSettings];
          
          // Apply settings to payload if not explicitly overridden
          if (settings && settings.model && !payload.model) {
            payload.model = settings.model;
          }
          
          if (settings && settings.maxTokens && !payload.max_tokens) {
            payload.max_tokens = settings.maxTokens;
          }
          
          if (settings && settings.temperature !== undefined && !payload.temperature) {
            payload.temperature = settings.temperature;
          }
        }
      } catch (err) {
        console.warn(`Failed to load project settings for ${projectDirectory}:`, err);
      }
    }
    
    // Create a background job record if sessionId is provided
    if (sessionId) {
      await setupDatabase();
      try {
        // Extract the prompt text from the messages
        const promptText = payload.messages.map(m => `${m.role}: ${m.content}`).join('\n');
        
        // Create the job using the centralized helper
        job = await createBackgroundJob(
          sessionId,
          {
            apiType: 'claude',
            taskType: taskType as TaskType,
            model: payload.model || DEFAULT_MODEL,
            rawInput: promptText,
            includeSyntax: !!payload.messages,
            temperature: payload.temperature || 0.7
          }
        );
      } catch (err) {
        console.error("Error creating background job:", err);
        return { 
          isSuccess: false, 
          message: `Error creating background job: ${err instanceof Error ? err.message : String(err)}`
        };
      }
    }
    
    // Prepare the execution function that will be passed to streamingRequestPool
    const executeRequest = async (): Promise<ActionState<ClaudeResponse>> => {
      try {
        // Update job status to running
        if (job) {
          await updateJobToRunning(job.id, 'claude');
        }
        
        const response = await fetch(ANTHROPIC_API_URL, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-api-key": apiKey,
            "anthropic-version": ANTHROPIC_VERSION,
          },
          body: JSON.stringify({
            model: payload.model || DEFAULT_MODEL,
            max_tokens: payload.max_tokens ?? 2048,
            messages: payload.messages,
            temperature: payload.temperature,
            top_p: payload.top_p,
            top_k: payload.top_k,
            system: payload.system
          }),
        });
        
        if (!response.ok) {
          const errText = await response.text();
          console.error(`Anthropic API error: ${response.status} ${errText}`);
          
          // Update job status to failed before throwing
          if (job) {
            await handleApiError(job.id, response.status, errText, 'claude');
          }
          
          // Check for specific error types
          let errorJson: any = {};
          try {
            errorJson = JSON.parse(errText);
          } catch (e) {
            // Not valid JSON, ignore
          }
          
          // Handle different error types
          if (response.status === 429 || response.status === 529 || 
              (errorJson.error?.type === "rate_limit_error") || 
              (errorJson.error?.type === "overloaded_error" && errorJson.error?.message === "Overloaded")) {
            return {
              isSuccess: false,
              message: `Anthropic API is currently overloaded. Please try again in a few moments.`,
              error: new Error(`RATE_LIMIT:${response.status}:Anthropic API is currently overloaded.`)
            };
          } else if (response.status >= 500) {
            return {
              isSuccess: false,
              message: `Anthropic API server error.`,
              error: new Error(`SERVER_ERROR:${response.status}:Anthropic API server error.`)
            };
          } else {
            return {
              isSuccess: false,
              message: `API error: ${errText.slice(0, 150)}`,
              error: new Error(`API_ERROR:${response.status}:${errText.slice(0, 150)}`)
            };
          }
        }
        
        const data = await response.json();
        
        // Validate response
        if (!data.content || data.content.length === 0 || typeof data.content[0].text !== 'string') {
          console.error("Anthropic returned an empty or invalid response structure:", JSON.stringify(data).slice(0, 500));
          
          // Update job status to failed before throwing
          if (job) {
            await updateJobToFailed(job.id, "Anthropic returned an invalid response structure.");
          }
          
          return {
            isSuccess: false,
            message: "Anthropic returned an invalid response structure.",
            error: new Error("Anthropic returned an invalid response structure.")
          };
        }
        
        // Update job status to completed
        if (job) {
          const responseText = data.content[0].text.trim();
          await updateJobToCompleted(job.id, responseText);
        }
        
        return {
          isSuccess: true,
          data: data,
          message: "Successfully processed with Claude API"
        };
      } catch (error) {
        console.error("Error during Claude API request execution:", error);
        
        // Ensure job status is updated to failed if any error occurs
        if (job) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          await updateJobToFailed(job.id, errorMessage);
        }
        
        return {
          isSuccess: false,
          message: `Error during Claude API request: ${error instanceof Error ? error.message : String(error)}`,
          error: error instanceof Error ? error : new Error(String(error))
        };
      }
    };
    
    // Use the streaming request pool instead of request queue
    const requestId = crypto.randomUUID();
    
    try {
      // Execute the request through the streaming request pool
      const result = await streamingRequestPool.execute(
        executeRequest,
        {
          sessionId: sessionId || 'anonymous',
          requestId,
          requestType: RequestType.CLAUDE_REQUEST,
          priority: 0
        }
      );
      
      if (!result.isSuccess) {
        return {
          isSuccess: false,
          message: result.message,
          error: result.error
        };
      }
      
      const data = result.data as ClaudeResponse;
      const responseText = data.content[0].text.trim();
      
      // Return immediately with the job ID if this is a background job
      if (job) {
        return { 
          isSuccess: true, 
          message: "Claude request processed successfully.",
          data: { isBackgroundJob: true, jobId: job.id },
          metadata: {
            isBackgroundJob: true,
            jobId: job.id,
            requestId: requestId
          }
        };
      } else {
        return { 
          isSuccess: true, 
          message: "Claude request processed successfully.",
          data: responseText,
          metadata: {
            requestId: requestId
          }
        };
      }
    } catch (error) {
      console.error("Error executing Claude request:", error);
      
      // Even if we encounter an error at the pool level, we need to ensure the job is marked as failed
      if (job) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        await updateJobToFailed(job.id, errorMessage);
        
        return {
          isSuccess: false,
          message: `Error executing Claude request: ${errorMessage}`,
          error: error instanceof Error ? error : new Error(errorMessage),
          metadata: {
            isBackgroundJob: true,
            jobId: job.id
          }
        };
      }
      
      return {
        isSuccess: false,
        message: `Error executing Claude request: ${error instanceof Error ? error.message : String(error)}`,
        error: error instanceof Error ? error : new Error(String(error))
      };
    }
  }
  
  /**
   * Simplified method to improve text using Claude
   */
  async improveText(
    text: string, 
    sessionId?: string,
    options?: {
      max_tokens?: number;
      preserveFormatting?: boolean;
      model?: string;
    },
    projectDirectory?: string
  ): Promise<ActionState<string | { isBackgroundJob: true, jobId: string }>> {
    const preserveFormatting = options?.preserveFormatting !== false;
    
    const formattingInstructions = preserveFormatting ? 
      `while EXACTLY preserving its formatting style, including:
- All line breaks
- All indentation
- All bullet points and numbering
- All blank lines
- All special characters and symbols

Do not change the formatting structure at all.` : '';
    
    // Skip empty or whitespace-only texts
    if (!text || text.trim() === '') {
      return { isSuccess: false, message: "No text provided for improvement." };
    }
    
    const payload: ClaudeRequestPayload = {
      messages: [{
        role: "user",
        content: `Please improve the following text to make it clearer (and grammatically correct) ${formattingInstructions}

IMPORTANT: Keep the original language of the text.

Here is the text to improve:
${text}

Return only the improved text without any additional commentary.`
      }],
      max_tokens: options?.max_tokens || 2048,
      model: options?.model
    };
    
    try {
      // Execute the request and wait for response
      const result = await this.sendRequest(payload, sessionId, 'text_improvement', projectDirectory);
      
      // If this is a background job, return the jobId with a clear metadata structure
      if (result.isSuccess && result.metadata?.jobId) {
        return {
          isSuccess: true,
          message: "Text improvement is being processed in the background.",
          data: { isBackgroundJob: true, jobId: result.metadata.jobId } as { isBackgroundJob: true, jobId: string },
          metadata: { 
            isBackgroundJob: true, 
            jobId: result.metadata.jobId,
            operationId: result.metadata.jobId // Include operationId for backward compatibility
          }
        };
      }
      
      // Otherwise return the immediate text result
      return result;
    } catch (error) {
      console.error("Error improving text with Claude:", error);
      return {
        isSuccess: false,
        message: error instanceof Error ? error.message : "Unknown error during text improvement",
      };
    }
  }

  /**
   * Processes and corrects raw task description text, improving its clarity and structure
   */
  async correctTaskDescription(
    rawText: string,
    options?: {
      sessionId?: string;
      language?: string;
      max_tokens?: number;
      model?: string;
      projectDirectory?: string;
    }
  ): Promise<ActionState<string | { isBackgroundJob: true, jobId: string }>> {
    console.log(`[Claude] Processing voice correction request for ${options?.sessionId || 'anonymous user'}`);
    
    // Parameter validation
    if (!rawText || typeof rawText !== 'string' || rawText.trim() === '') {
      return {
        isSuccess: false,
        message: "No text provided for correction."
      };
    }
    
    const { sessionId, language = 'en', max_tokens = 2048, model, projectDirectory } = options || {};
    
    // Prepare the system prompt
    const systemPrompt = `You are a helpful, accurate assistant that specializes in refining verbally dictated text. 
When given transcribed speech, you will:
1. Fix grammar, spelling, and punctuation errors
2. Improve sentence structure and clarity
3. Make the language more professional and coherent
4. Preserve the original meaning and intent
5. Maintain important technical terms and concepts

When reformatting, focus on making the text more suitable for a written technical document. 
Do not add new concepts or information not present in the original.
Language: ${language}`;

    // Prepare the user message
    const userMessage = `Here is a transcription of verbally dictated text that needs to be refined into clear, professional written form:

${rawText}

Please correct and improve this text while maintaining its original meaning and technical content.`;

    return this.sendRequest(
      {
        model: model || "claude-3-haiku-20240307",
        messages: [
          { role: "user", content: userMessage }
        ],
        system: systemPrompt,
        max_tokens,
        temperature: 0.3 // Lower temperature for more predictable corrections
      },
      sessionId,
      'voice_correction',
      projectDirectory
    );
  }
  
  /**
   * Get current queue stats
   */
  getQueueStats() {
    return streamingRequestPool.getStats();
  }
  
  /**
   * Cancel all requests for a specific session
   */
  async cancelAllSessionRequests(sessionId: string): Promise<ActionState<null>> {
    try {
      // Cancel any queued requests through the streaming request pool
      const cancelledCount = streamingRequestPool.cancelQueuedSessionRequests(sessionId);
      
      // Also cancel background jobs in the database
      await cancelAllSessionJobs(sessionId);
      
      return { 
        isSuccess: true, 
        message: `Cancelled ${cancelledCount} Claude requests for session ${sessionId}.`,
        data: null
      };
    } catch (error) {
      return { 
        isSuccess: false, 
        message: `Error cancelling Claude requests: ${error instanceof Error ? error.message : String(error)}`,
        error: error instanceof Error ? error : new Error(String(error))
      };
    }
  }
}

// Export singleton instance
const claudeClient = new ClaudeClient();
export default claudeClient; 