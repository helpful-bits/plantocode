"use server";

import { ActionState } from "@/types";
import { GEMINI_FLASH_MODEL, GEMINI_PRO_PREVIEW_MODEL } from '@/lib/constants';

// Maximum context token limit - don't export from a 'use server' file
const MAX_TOKENS = 1000000; // Gemini models support up to 1M tokens
const MAX_OUTPUT_TOKENS = 60000; // Default maximum output tokens
const GEMINI_PRO_MAX_OUTPUT_TOKENS = 65536; // Maximum output tokens for Gemini 2.5 Pro

// Define options for the API call
interface GeminiAPIOptions {
  maxOutputTokens?: number;
  temperature?: number;
  topP?: number;
  topK?: number;
}

/**
 * Calls Google's Gemini API with the given system prompt and user content
 */
export async function callGeminiAPI(
  systemPrompt: string,
  userPromptContent: string,
  modelId = GEMINI_FLASH_MODEL,
  options: GeminiAPIOptions = {}
): Promise<ActionState<string>> {
  try {
    // For local development/testing, you can return mock data
    if (process.env.MOCK_AI_RESPONSES === 'true') {
      console.log('[Gemini API] Mock mode enabled, returning mock response');
      return {
        isSuccess: true,
        data: `This is a mock response from the Gemini API.\n\nYou asked about: ${userPromptContent.slice(0, 50)}...`,
      };
    }

    // Check if API key is available
    const apiKey = process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY;
    if (!apiKey) {
      console.error('[Gemini API] API key missing');
      return {
        isSuccess: false,
        message: 'Gemini API key is not configured. Set either GOOGLE_API_KEY or GEMINI_API_KEY in your environment.',
      };
    }

    // Define API endpoint based on model
    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:generateContent?key=${apiKey}`;

    // Set default options with model-specific max output tokens
    const defaultMaxOutputTokens = modelId === GEMINI_PRO_PREVIEW_MODEL ? 
      GEMINI_PRO_MAX_OUTPUT_TOKENS : MAX_OUTPUT_TOKENS;
    
    const {
      maxOutputTokens = defaultMaxOutputTokens,
      temperature = 0.8,
      topP = 0.95,
      topK = 40,
    } = options;

    // Build request payload
    const payload = {
      contents: [
        {
          role: 'user',
          parts: [
            { text: userPromptContent }
          ]
        }
      ],
      systemInstruction: {
        parts: [
          { text: systemPrompt }
        ]
      },
      generationConfig: {
        maxOutputTokens,
        temperature,
        topP,
        topK,
      },
    };

    console.log(`[Gemini API] Calling ${modelId} with ${JSON.stringify(payload.generationConfig)}`);
    console.log(`[Gemini API] IMPORTANT - Using Gemini model: ${modelId}`);
    console.log(`[Gemini API] Full API URL: ${apiUrl}`);

    // Make API request
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[Gemini API] Error: ${response.status} ${response.statusText}`, errorText);
      return {
        isSuccess: false,
        message: `Gemini API error: ${response.status} ${response.statusText}`,
      };
    }

    const data = await response.json();
    
    // Extract text from response
    if (data.candidates && data.candidates.length > 0 && 
        data.candidates[0].content && 
        data.candidates[0].content.parts && 
        data.candidates[0].content.parts.length > 0) {
      const text = data.candidates[0].content.parts[0].text;
      return {
        isSuccess: true,
        data: text,
      };
    }

    console.error('[Gemini API] No valid response data found', data);
    return {
      isSuccess: false,
      message: 'No valid response from Gemini API',
    };
  } catch (error) {
    console.error('[Gemini API] Exception:', error);
    return {
      isSuccess: false,
      message: error instanceof Error ? error.message : 'Unknown error calling Gemini API',
    };
  }
} 