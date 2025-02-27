"use server";

import { ActionState } from "@/types";

export async function improveSelectedTextAction(selectedText: string, foundFiles: string[]): Promise<ActionState<string>> {
  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": `${process.env.ANTHROPIC_API_KEY}`,
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify({
        model: "claude-3-5-sonnet-20241022",
        max_tokens: 2500,
        messages: [{
          role: "user",
          content: `Please improve the following text to make it clearer (and grammatically correct) while EXACTLY preserving its formatting style, including:
- All line breaks
- All indentation
- All bullet points and numbering
- All blank lines
- All special characters and symbols

Do not change the formatting structure at all. Only improve the content while keeping the exact same format.

Here is the text to improve:
${selectedText}

Return only the improved text without any additional commentary, keeping the exact same formatting as the original.`
        }],
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Anthropic API error: ${errText}`);
    }

    const data = await response.json();
    const improvedText = data.content[0].text?.trim() || selectedText;

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