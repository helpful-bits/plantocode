import { ActionState, BackgroundJob } from "@/types";
import requestQueue from "./request-queue";
import { setupDatabase } from "@/lib/db";
import { sessionRepository } from "@/lib/db/repository-factory";
import { getModelSettingsForProject } from "@/actions/project-settings-actions";

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
  ): Promise<ActionState<string>> {
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
        if (modelSettings && modelSettings[taskType as any]) {
          const settings = modelSettings[taskType as any];
          
          // Apply settings to payload if not explicitly overridden
          if (settings.model && !payload.model) {
            payload.model = settings.model;
          }
          
          if (settings.maxTokens && !payload.max_tokens) {
            payload.max_tokens = settings.maxTokens;
          }
          
          if (settings.temperature !== undefined && !payload.temperature) {
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
        
        // Create background job
        job = await sessionRepository.createBackgroundJob(
          sessionId,
          promptText,
          'claude',
          taskType,
          payload.model || DEFAULT_MODEL,
          payload.max_tokens || 2048
        );
        
        // Update status to preparing
        await sessionRepository.updateBackgroundJobStatus(
          job.id,
          'preparing',
          null,
          null,
          null,
          'Setting up Claude API request'
        );
      } catch (err) {
        console.error("Error creating background job:", err);
      }
    }
    
    // Prepare the execution function
    const executeRequest = async (): Promise<ClaudeResponse> => {
      // Update job status to running if we have a job
      if (job) {
        await sessionRepository.updateBackgroundJobStatus(
          job.id,
          'running',
          Date.now(),
          null,
          null,
          'Processing with Claude API'
        );
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
          throw new Error(`RATE_LIMIT:${response.status}:Anthropic API is currently overloaded. Please try again in a few moments.`);
        } else if (response.status >= 500) {
          throw new Error(`SERVER_ERROR:${response.status}:Anthropic API server error.`);
        } else {
          throw new Error(`API_ERROR:${response.status}:${errText.slice(0, 150)}`);
        }
      }
      
      const data = await response.json();
      
      // Validate response
      if (!data.content || data.content.length === 0 || typeof data.content[0].text !== 'string') {
        console.error("Anthropic returned an empty or invalid response structure:", JSON.stringify(data).slice(0, 500));
        throw new Error("Anthropic returned an invalid response structure.");
      }
      
      return data;
    };
    
    // Return a promise that resolves when the queued request completes
    return new Promise((resolve) => {
      // Enqueue the request
      requestQueue.enqueue(
        executeRequest,
        {
          provider: 'claude',
          // Set priority based on payload (can be customized)
          priority: 0,
          onSuccess: (data: ClaudeResponse) => {
            const responseText = data.content[0].text.trim();
            
            // Update job status to completed if we have a job
            if (job) {
              sessionRepository.updateBackgroundJobStatus(
                job.id,
                'completed',
                null,
                Date.now(),
                null,
                "Successfully processed with Claude API",
                {
                  tokensReceived: data.usage?.output_tokens || 0,
                  charsReceived: responseText.length
                }
              ).catch(err => console.error("Error updating job status:", err));
            }
            
            resolve({
              isSuccess: true,
              message: "Anthropic API call successful",
              data: responseText,
              metadata: {
                usage: data.usage,
                jobId: job?.id
              }
            });
          },
          onError: (error: Error) => {
            console.error("Error calling Anthropic API:", error);
            
            // Update job status to failed if we have a job
            if (job) {
              sessionRepository.updateBackgroundJobStatus(
                job.id,
                'failed',
                null,
                Date.now(),
                null,
                `Error: ${error.message}`
              ).catch(err => console.error("Error updating job status:", err));
            }
            
            // Extract information from error message
            let errorType = "UNKNOWN";
            let statusCode = 0;
            let errorMessage = error.message;
            
            // Parse structured error messages
            const errorMatch = error.message.match(/^([A-Z_]+):(\d+):(.+)$/);
            if (errorMatch) {
              errorType = errorMatch[1];
              statusCode = parseInt(errorMatch[2], 10);
              errorMessage = errorMatch[3];
            }
            
            resolve({
              isSuccess: false,
              message: errorMessage,
              metadata: {
                errorType,
                statusCode,
                jobId: job?.id
              }
            });
          }
        }
      );
    });
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
  ): Promise<ActionState<string>> {
    const preserveFormatting = options?.preserveFormatting !== false;
    
    const formattingInstructions = preserveFormatting ? 
      `while EXACTLY preserving its formatting style, including:
- All line breaks
- All indentation
- All bullet points and numbering
- All blank lines
- All special characters and symbols

Do not change the formatting structure at all.` : '';
    
    const payload: ClaudeRequestPayload = {
      messages: [{
        role: "user",
        content: `Please improve the following text to make it clearer (and grammatically correct) ${formattingInstructions}

IMPORTANT: Keep the original language of the text.

Here is the text to improve:
${text}

Return only the improved text without any additional commentary.`
      }],
      max_tokens: options?.max_tokens,
      model: options?.model
    };
    
    return this.sendRequest(payload, sessionId, 'text_improvement', projectDirectory);
  }


  /**
   * Method to correct task descriptions
   */
  async correctTaskDescription(
    rawText: string,
    sessionId?: string,
    options?: {
      max_tokens?: number;
      model?: string;
    },
    projectDirectory?: string
  ): Promise<ActionState<string>> {
    if (!rawText || !rawText.trim()) {
      return { isSuccess: false, message: "No text provided for correction." };
    }
    
    const payload: ClaudeRequestPayload = {
      messages: [{
        role: "user", 
        content: `Please correct any spelling mistakes or unnatural phrasing in the following text, while preserving its meaning and intent.
---
${rawText}
---
Return only the corrected text without any additional commentary.`
      }],
      max_tokens: options?.max_tokens,
      model: options?.model
    };
    
    return this.sendRequest(payload, sessionId, 'voice_correction', projectDirectory);
  }
  
  /**
   * Get queue statistics specific to Claude
   */
  getQueueStats() {
    return requestQueue.getStats();
  }
}

// Export singleton instance
const claudeClient = new ClaudeClient();
export default claudeClient; 