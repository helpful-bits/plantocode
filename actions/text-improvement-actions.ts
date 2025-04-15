"use server";

import { ActionState } from "@/types";
import { callAnthropicAPI } from "@/lib/anthropic";
 
export async function improveSelectedTextAction(selectedText: string): Promise<ActionState<string>> {
  try {
  if (!selectedText || !selectedText.trim()) {
      return { isSuccess: false, message: "No text selected for improvement." };
  }
    const payload = {
        max_tokens: 1024, // Provide max_tokens
        messages: [{ // Keep messages array
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
        }] // End of messages array
    };

    const result: ActionState<string> = await callAnthropicAPI(payload);

    if (!result.isSuccess || !result.data) {
      return { isSuccess: false, message: result.message || "Failed to improve pattern description via API" };
    }
    
    const improvedText = result.data || selectedText; // Keep fallback

    return {
      isSuccess: true,
      message: "Text improved successfully",
      data: improvedText,
    };
  } catch (error) {
    console.error("Error improving text with Anthropic:", error);
    return {
      isSuccess: false,
      message: error instanceof Error ? error.message : "Failed to improve text",
    };
  }
}
 
export async function improvePatternDescriptionAction(selectedText: string, directoryTree?: string): Promise<ActionState<string>> {
  try {
    if (!selectedText || !selectedText.trim()) {
      return { isSuccess: false, message: "No pattern description provided for improvement." };
    }

    let structureContext = "";
    if (directoryTree && directoryTree.trim()) {
      structureContext = `
Here is the current project directory structure to help with context:
\`\`\`
${directoryTree}
\`\`\`
`;
    }
 
    const payload = {
        messages: [{
          role: "user",
          content: `Please improve the following text description to make it clearer and more precise for generating file path and content regular expressions. Focus on clarifying file types, content keywords, folder structures, exclusions, and overall intent. Preserve the original language and general meaning.${structureContext}

When improving the text:
- Be specific about file extensions (e.g., .tsx, .md, .json)
- Clarify directory paths when mentioned
- Be explicit about content patterns (e.g., "files importing useState" rather than "files with useState")
- Specify any exclusions clearly (e.g., "excluding test files")

IMPORTANT: Keep the original language of the text.

Here is the text to improve:
---
${selectedText}
---
Return ONLY the improved text without any additional commentary or formatting.`
        }]
    }; // Close payload object

    const result: ActionState<string> = await callAnthropicAPI(payload); // Keep callAnthropicAPI call

    if (!result.isSuccess || !result.data) {
      return { isSuccess: false, message: result.message || "Failed to improve text via API" };
    }

    const improvedText = result.data || selectedText;

    return { isSuccess: true, message: "Pattern description improved successfully", data: improvedText };
  } catch (error) {
    console.error("Error improving pattern description with Anthropic:", error);
    return { 
      isSuccess: false, 
      message: error instanceof Error ? error.message : "Failed to improve pattern description" 
    };
  }
}
