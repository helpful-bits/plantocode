"use server";

import { ActionState } from "@/types";

const BASE_GEMINI_API_URL = "https://generativelanguage.googleapis.com/v1beta/models/";

interface GeminiApiPayload {
  contents: {
    role: string;
    parts: { text: string }[];
  }[];
  systemInstruction?: { // Add system instruction support
    role: string;
    parts: { text: string }[];
  };
  generationConfig?: {
    responseMimeType?: string;
    temperature?: number;
    maxOutputTokens?: number;
  };
}

interface GeminiApiResponse {
  candidates: {
    content: {
      parts: { text: string }[];
      role: string;
    };
  }[];
}

export async function callGeminiAPI(
  systemPrompt: string,
  userPrompt: string,
  modelId: string
): Promise<ActionState<string>> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return { isSuccess: false, message: "GEMINI_API_KEY is not configured." };
  }

  const apiUrl = `${BASE_GEMINI_API_URL}${modelId}:generateContent?key=${apiKey}`;

  const payload: GeminiApiPayload = {
    systemInstruction: { role: "system", parts: [{ text: systemPrompt }] },
    contents: [{ role: "user", parts: [{ text: userPrompt }] }],
    generationConfig: { responseMimeType: "text/plain" },
  };

  try {
    const response = await fetch(apiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const error = await response.text();
      return { 
        isSuccess: false, 
        message: `API request failed: ${response.status} ${response.statusText}. ${error}` 
      };
    }

    const data = await response.json() as GeminiApiResponse;
    
    if (!data.candidates || data.candidates.length === 0) {
      return { isSuccess: false, message: "API returned no candidates." };
    }

    const text = data.candidates[0].content.parts[0].text;
    return { isSuccess: true, data: text };
  } catch (error) {
    return { 
      isSuccess: false, 
      message: `Error calling Gemini API: ${error instanceof Error ? error.message : String(error)}` 
    };
  }
}
