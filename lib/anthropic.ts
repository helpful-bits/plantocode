"use server";

import { ActionState } from "@/types";

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";
const DEFAULT_MODEL = "claude-3-7-sonnet-20250219"; // Enforced Sonnet model

interface AnthropicRequestPayload {
  model?: string; // Allow override but default will be enforced
  messages: { role: string; content: string }[];
  max_tokens?: number;
  // Add other potential parameters if needed (temperature, system prompt, etc.)
}

export interface AnthropicResponse {
  content: { type: string; text: string }[];
  // Add other potential response fields like usage if needed
  usage?: { input_tokens: number, output_tokens: number };
}

export async function callAnthropicAPI<T>(
  payload: Omit<AnthropicRequestPayload, 'model'> & { max_tokens?: number }, // Exclude model from input payload type
  processResponse: (data: AnthropicResponse) => T
): Promise<ActionState<T>> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return { isSuccess: false, message: "Anthropic API key not configured." };
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
      throw new Error(`Anthropic API error (${response.status}): ${errText.slice(0, 150)}`);
    }

    const data: AnthropicResponse = await response.json();

    if (!data.content || data.content.length === 0 || typeof data.content[0].text !== 'string') {
       console.error("Anthropic returned an empty or invalid response:", JSON.stringify(data).slice(0, 500));
       throw new Error("Anthropic returned an invalid response structure.");
    }

    const processedData = processResponse(data);

    return { isSuccess: true, message: "Anthropic API call successful", data: processedData };

  } catch (error) {
    console.error("Error calling Anthropic API:", error);
    return { 
      isSuccess: false, 
      message: error instanceof Error ? error.message : "Unknown error occurred calling Anthropic API" 
    };
  }
}
