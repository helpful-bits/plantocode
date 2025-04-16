"use server";

import { callAnthropicAPI } from "@/lib/anthropic";
import { ActionState } from "@/types";

export async function correctTaskDescriptionAction(rawText: string): Promise<ActionState<string>> {
  try {
    if (!rawText || !rawText.trim()) {
      return { isSuccess: false, message: "No text provided for correction." }; // Keep message
    }
    const payload = { // Keep payload structure
      messages: [
        {
          role: "user", 
          content: `Please correct any spelling mistakes or unnatural phrasing in the following text, while preserving its meaning and intent.
---
${rawText}
---
Return only the corrected text without any additional commentary.`
        }
      ]
    };
    // Keep Anthropic API call
    const result: ActionState<string> = await callAnthropicAPI(payload); // Keep callAnthropicAPI call
    if (!result.isSuccess || !result.data) {
      return { isSuccess: false, message: result.message || "Failed to correct text via API" }; // Keep message
    }
    
    // Use result.data which is the string response
    const correctedText = result.data || rawText;

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
