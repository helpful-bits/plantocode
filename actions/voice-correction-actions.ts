"use server";

import { ActionState } from "@/types";

export async function correctTaskDescriptionAction(rawText: string, foundFiles: string[]): Promise<ActionState<string>> {
  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": `${process.env.ANTHROPIC_API_KEY}`,
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify({
        model: "claude-3-7-sonnet-20250219",
        max_tokens: 2500,
        messages: [{
          role: "user",
          content: `Please correct any spelling mistakes or unnatural phrasing in the following text, while preserving its meaning and intent.
---
${rawText}
---
Return only the corrected text without any additional commentary.`
        }],
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Anthropic API error: ${errText}`);
    }

    const data = await response.json();
    // The response format for Claude 3 messages API
    const correctedText = data.content[0].text?.trim() || rawText;

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