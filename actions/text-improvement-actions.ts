"use server";

import { ActionState } from "@/types";
import { callAnthropicAPI } from "@/lib/anthropic";

export async function improveSelectedTextAction(selectedText: string, foundFiles: string[]): Promise<ActionState<string>> {
  try {
    if (!process.env.ANTHROPIC_API_KEY) {
      return { isSuccess: false, message: "Anthropic API key not configured." };
    }
    
    const payload = {
      messages: [{
        role: "user",
        content: `Please improve the following text to make it clearer (and grammatically correct) while EXACTLY preserving its formatting style, including:
- All line breaks
- All indentation
- All bullet points and numbering
- All blank lines
- All special characters and symbols

Do not change the formatting structure at all. Only improve the content while keeping the exact same format.

IMPORTANT: Keep the original language of the text.

Here is the text to improve:
${selectedText}

Return only the improved text without any additional commentary, keeping the exact same formatting as the original.`
      }],
    };

    const result = await callAnthropicAPI(payload, (data) => {
      return data.content[0].text?.trim() || selectedText;
    });

    if (!result.isSuccess) {
      throw new Error(result.message);
    }
    
    const improvedText = result.data;

    return {
      isSuccess: true,
      message: "Text improved successfully",
      data: improvedText,
    };
  } catch (error) {
    console.error("Error improving text with Anthropic:", error);
    return {
      isSuccess: false,
      message: "Failed to improve text",
    };
  }
} 