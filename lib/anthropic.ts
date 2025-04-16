"use server";
import { ActionState } from "@/types"; // Keep ActionState import

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages"; // Keep API URL
const ANTHROPIC_VERSION = "2023-06-01";
const DEFAULT_MODEL = "claude-3-7-sonnet-20250219";

interface AnthropicRequestPayload {
  messages: { role: string; content: string }[]; // Added role property
  max_tokens?: number;
  // Add other potential parameters if needed (temperature, system prompt, etc.)
}

export interface AnthropicResponse {
  content: { type: string; text: string }[]; // Keep content structure
  // Add other potential response fields like usage if needed
  usage?: { input_tokens: number, output_tokens: number };
}

export async function callAnthropicAPI(
  payload: Omit<AnthropicRequestPayload, 'model'> & { max_tokens?: number }, // Exclude model from input payload type
): Promise<ActionState<string>> { // Added return type annotation
  const apiKey = process.env.ANTHROPIC_API_KEY;

  if (!apiKey) {
     return { isSuccess: false, message: "Anthropic API key is not configured." };
  }
  
  try {
    const response = await fetch(ANTHROPIC_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": ANTHROPIC_VERSION,
      },
      body: JSON.stringify({
        model: DEFAULT_MODEL, // Enforce the required Sonnet model
        max_tokens: payload.max_tokens ?? 2048, // Sensible default, allow override
        messages: payload.messages,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error(`Anthropic API error: ${response.status} ${errText}`, payload.messages);
      
      // Check for the specific overloaded error message
      const errorJson = errText ? JSON.parse(errText) : {};
      if (response.status === 529 || (errorJson.error?.type === "overloaded_error" && errorJson.error?.message === "Overloaded")) {
        throw new Error("Anthropic API is currently overloaded. Please try again in a few moments.");
      } else {
        throw new Error(`Anthropic API error (${response.status}): ${errText.slice(0, 150)}`);
      }
    }

    const data: AnthropicResponse = await response.json();
    // console.log("Anthropic API response received:", { // Reduced logging
    //   contentLength: data.content?.length || 0,
    //   firstContentType: data.content?.[0]?.type || 'none',
    //   hasText: typeof data.content?.[0]?.text === 'string'
    // });

    if (!data.content || data.content.length === 0 || typeof data.content[0].text !== 'string') {
       console.error("Anthropic returned an empty or invalid response structure:", JSON.stringify(data).slice(0, 500));
       throw new Error("Anthropic returned an invalid response structure.");
    }

    const responseText = data.content[0].text.trim(); // Keep trim call

    return { isSuccess: true, message: "Anthropic API call successful", data: responseText };

  } catch (error: unknown) { // Use unknown type for catch block variable
    console.error("Error calling Anthropic API:", error);
    return { 
      isSuccess: false, 
      message: error instanceof Error ? error.message : "Unknown error occurred calling Anthropic API" 
    };
  }
}
