"use server";
import claudeClient from "@/lib/api/claude-client";
import { ActionState } from "@/types";
import { generateRegexPatternPrompt } from "@/lib/prompts/regex-prompts";

function isValidRegex(pattern: string): boolean {
  try {
    new RegExp(pattern);
    return true;
  } catch (e) {
    return false;
  }
}

export async function generateRegexPatternsAction(
  taskDescription: string,
  directoryTree?: string,
  projectDirectory?: string,
  sessionId?: string
): Promise<ActionState<{ titleRegex?: string; contentRegex?: string; negativeTitleRegex?: string; negativeContentRegex?: string } | { jobId: string }>> {
  if (!taskDescription || !taskDescription.trim()) {
    return { isSuccess: false, message: "Task description cannot be empty." };
  }

  try {
    console.log(`[generateRegexPatternsAction] Starting regex generation for task: "${taskDescription.substring(0, 50)}..."`);
    
    const promptContent = generateRegexPatternPrompt(taskDescription, directoryTree);

    const payload: { messages: { role: string; content: string }[], max_tokens: number } = {
      max_tokens: 1024,
      messages: [{
          role: "user",
          content: promptContent,
        }, // Close user message
      ],
    };
    console.log("[generateRegexPatternsAction] Sending payload to Claude for regex generation");

    // Add strict session ID validation
    if (!sessionId || typeof sessionId !== 'string' || !sessionId.trim()) {
      return { isSuccess: false, message: "Active session required to generate regex patterns." };
    }

    const result: ActionState<string | { isBackgroundJob: true; jobId: string }> = await claudeClient.sendRequest(payload, sessionId, 'regex_generation', projectDirectory);

    if (!result.isSuccess) {
      console.error("[generateRegexPatternsAction] Claude API call failed:", result.message);
      return { isSuccess: false, message: result.message || "Failed to generate regex patterns via Claude" };
    }

    // Check if this is a background job and return jobId if it is
    if (result.metadata?.jobId) {
      console.log(`[generateRegexPatternsAction] Regex generation started as background job with ID: ${result.metadata.jobId}`);
      return {
        isSuccess: true,
        message: "Regex generation job started",
        data: { jobId: result.metadata.jobId }
      };
    }

    // Only proceed with parsing if this is not a background job and we have data
    if (result.data) {
      console.log(`[generateRegexPatternsAction] Received immediate result (not a background job)`);
      
      const jsonResponse = result.data;
      if (!jsonResponse) {
        console.error("[generateRegexPatternsAction] Claude returned an empty text response.");
        return { isSuccess: false, message: "Claude returned an empty text response." };
      }

      try {
        // Type guard to ensure jsonResponse is a string
        if (typeof jsonResponse !== 'string') {
          console.error("[generateRegexPatternsAction] Expected string response but got an object:", jsonResponse);
          return { isSuccess: false, message: "Unexpected response format from Claude." };
        }
        
        console.log(`[generateRegexPatternsAction] Raw JSON response string from Claude: ${jsonResponse.substring(0, 100)}...`);

        // Attempt to extract JSON from potential markdown code blocks
        const jsonMatch = jsonResponse.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
        const cleanedJsonResponse = (jsonMatch ? jsonMatch[1] : jsonResponse).trim();

        console.log(`[generateRegexPatternsAction] Cleaned JSON response string: ${cleanedJsonResponse.substring(0, 100)}...`);
        
        // Try to sanitize the JSON string before parsing
        let sanitizedJson = cleanedJsonResponse;
        // Handle potential issues with escaped backslashes in regex patterns
        try {
          // First attempt - try regular JSON.parse
          const patterns = JSON.parse(cleanedJsonResponse);
          
          const titleRegex = patterns.titleRegex || "";
          const contentRegex = patterns.contentRegex || "";
          const negativeTitleRegex = patterns.negativeTitleRegex || "";
          const negativeContentRegex = patterns.negativeContentRegex || "";

          if (titleRegex && !isValidRegex(titleRegex)) {
            throw new Error(`Claude generated an invalid title regex: ${titleRegex}`);
          }
          if (contentRegex && !isValidRegex(contentRegex)) {
            throw new Error(`Claude generated an invalid content regex: ${contentRegex}`);
          }
          if (negativeTitleRegex && !isValidRegex(negativeTitleRegex)) {
            throw new Error(`Claude generated an invalid negative title regex: ${negativeTitleRegex}`);
          }
          if (negativeContentRegex && !isValidRegex(negativeContentRegex)) {
            throw new Error(`Claude generated an invalid negative content regex: ${negativeContentRegex}`);
          }
          
          console.log(`[generateRegexPatternsAction] Successfully parsed and validated regex patterns`);
          return {
            isSuccess: true,
            message: "Regex patterns generated successfully",
            data: { titleRegex, contentRegex, negativeTitleRegex, negativeContentRegex }
          };
        } catch (parseError) {
          console.error(`[generateRegexPatternsAction] Initial JSON parse failed, attempting to sanitize: ${parseError}`);
          
          // Second attempt - try to fix common JSON escaping issues
          try {
            // Convert single backslashes to double in regex patterns (common issue)
            sanitizedJson = sanitizedJson.replace(/([^\\])\\([^\\"])/g, '$1\\\\$2');
            
            // Sometimes Claude doesn't properly escape quotes inside regex patterns
            sanitizedJson = sanitizedJson.replace(/([^\\])"/g, '$1\\"').replace(/^"/, '\\"');
            
            // Try to create a simpler JSON structure manually
            const titleMatch = sanitizedJson.match(/"titleRegex"\s*:\s*"([^"]*?)(?<!\\)"/);
            const contentMatch = sanitizedJson.match(/"contentRegex"\s*:\s*"([^"]*?)(?<!\\)"/);
            const negativeTitleMatch = sanitizedJson.match(/"negativeTitleRegex"\s*:\s*"([^"]*?)(?<!\\)"/);
            const negativeContentMatch = sanitizedJson.match(/"negativeContentRegex"\s*:\s*"([^"]*?)(?<!\\)"/);
            
            const titleRegex = titleMatch ? titleMatch[1].replace(/\\"/g, '"') : "";
            const contentRegex = contentMatch ? contentMatch[1].replace(/\\"/g, '"') : "";
            const negativeTitleRegex = negativeTitleMatch ? negativeTitleMatch[1].replace(/\\"/g, '"') : "";
            const negativeContentRegex = negativeContentMatch ? negativeContentMatch[1].replace(/\\"/g, '"') : "";
            
            console.log(`[generateRegexPatternsAction] Extracted patterns manually:`, { 
              titleRegex: titleRegex.substring(0, 30) + (titleRegex.length > 30 ? "..." : ""), 
              contentRegex: contentRegex.substring(0, 30) + (contentRegex.length > 30 ? "..." : ""), 
              negativeTitleRegex: negativeTitleRegex.substring(0, 30) + (negativeTitleRegex.length > 30 ? "..." : ""), 
              negativeContentRegex: negativeContentRegex.substring(0, 30) + (negativeContentRegex.length > 30 ? "..." : "")
            });
            
            if (titleRegex && !isValidRegex(titleRegex)) {
              throw new Error(`Claude generated an invalid title regex: ${titleRegex}`);
            }
            if (contentRegex && !isValidRegex(contentRegex)) {
              throw new Error(`Claude generated an invalid content regex: ${contentRegex}`);
            }
            if (negativeTitleRegex && !isValidRegex(negativeTitleRegex)) {
              throw new Error(`Claude generated an invalid negative title regex: ${negativeTitleRegex}`);
            }
            if (negativeContentRegex && !isValidRegex(negativeContentRegex)) {
              throw new Error(`Claude generated an invalid negative content regex: ${negativeContentRegex}`);
            }
            
            return {
              isSuccess: true,
              message: "Regex patterns extracted successfully",
              data: { titleRegex, contentRegex, negativeTitleRegex, negativeContentRegex }
            };
          } catch (extractError) {
            console.error(`[generateRegexPatternsAction] Failed to extract regex patterns: ${extractError}`);
            // Keep the existing error handling
            throw parseError;
          }
        }
      } catch (err: any) {
        console.error(`[generateRegexPatternsAction] Error parsing JSON response: ${err.message}`);
        let parseErrorMsg = `Failed to parse Claude response: ${err.message}`;
        return { isSuccess: false, message: parseErrorMsg };
      }
    }
    
    console.error(`[generateRegexPatternsAction] No response data or jobId returned from Claude`);
    return {
      isSuccess: false,
      message: "No response data or jobId returned from Claude",
    };
  } catch (error) {
    console.error(`[generateRegexPatternsAction] Unexpected error: ${error instanceof Error ? error.message : String(error)}`);
    return {
      isSuccess: false,
      message: error instanceof Error ? error.message : "Failed to generate regex patterns",
    };
  }
}
