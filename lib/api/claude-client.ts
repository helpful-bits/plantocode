import { ActionState } from "@/types";
import requestQueue from "./request-queue";

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
}

export interface ClaudeResponse {
  content: { type: string; text: string }[];
  usage?: { input_tokens: number, output_tokens: number };
}

class ClaudeClient {
  /**
   * Send a request to Claude API with automatic queueing, rate limiting and retries
   */
  async sendRequest(payload: ClaudeRequestPayload): Promise<ActionState<string>> {
    // Get API key from environment
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return { isSuccess: false, message: "Anthropic API key is not configured." };
    }
    
    // Prepare the execution function
    const executeRequest = async (): Promise<ClaudeResponse> => {
      const response = await fetch(ANTHROPIC_API_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": ANTHROPIC_VERSION,
        },
        body: JSON.stringify({
          model: DEFAULT_MODEL,
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
            resolve({
              isSuccess: true,
              message: "Anthropic API call successful",
              data: responseText,
              metadata: {
                usage: data.usage
              }
            });
          },
          onError: (error: Error) => {
            console.error("Error calling Anthropic API:", error);
            
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
                statusCode
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
  async improveText(text: string, options?: {
    max_tokens?: number;
    preserveFormatting?: boolean;
  }): Promise<ActionState<string>> {
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
      max_tokens: options?.max_tokens ?? 2048
    };
    return this.sendRequest(payload);
  }


  /**
   * Method to correct task descriptions
   */
  async correctTaskDescription(rawText: string): Promise<ActionState<string>> {
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
      max_tokens: 1024
    };
    
    return this.sendRequest(payload);
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