"use server";

import { callAnthropicAPI } from "@/lib/anthropic";
import { ActionState } from "@/types";

export async function correctTaskDescriptionAction(rawText: string): Promise<ActionState<string>> {
  try {
    if (!process.env.ANTHROPIC_API_KEY) {
      return { isSuccess: false, message: "Anthropic API key not configured." };
    }
    
    const payload = {
      messages: [{
        role: "user",
        content: `Please correct any spelling mistakes or unnatural phrasing in the following text, while preserving its meaning and intent.
---
${rawText}
---
Return only the corrected text without any additional commentary.`
      }],
    };

    const result = await callAnthropicAPI(payload);

    if (!result.isSuccess) {
      return { isSuccess: false, message: result.message || "Failed to correct text via API" };
    }
    
    // Use result.data which is the string response
    const correctedText = result.data || rawText; // Fallback to original if empty response


    return {
      isSuccess: true,
      message: "Corrections successful",
      data: correctedText,
    };
  } catch (error) {
    console.error("Error correcting text with Anthropic:", error);
    return {
      isSuccess: false,
      message: "Failed to correct text",
    };
  }
} 