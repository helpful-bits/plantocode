"use server";

import { ActionState } from "@/types";
import claudeClient from "@/lib/api/claude-client";
 
export async function improveSelectedTextAction(selectedText: string): Promise<ActionState<string>> {
  try {
    if (!selectedText || !selectedText.trim()) {
      return { isSuccess: false, message: "No text selected for improvement." };
    }
    
    // Use the new Claude client to improve the text
    return claudeClient.improveText(selectedText, {
      preserveFormatting: true,
      max_tokens: 1024
    });
  } catch (error) {
    console.error("Error improving text with Claude:", error);
    return {
      isSuccess: false,
      message: error instanceof Error ? error.message : "Failed to improve text",
    };
  }
}
 
export async function improvePatternDescriptionAction(selectedText: string): Promise<ActionState<string>> {
  try {
    if (!selectedText || !selectedText.trim()) {
      return { isSuccess: false, message: "No pattern description provided for improvement." };
    }

    const payload = {
        messages: [{
          role: "user",
          content: `Please improve the following text description to make it clearer and more precise for generating file path and content regular expressions. Focus on clarifying file types, content keywords, folder structures, exclusions, and overall intent. Preserve the original language and general meaning.

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

    const result: ActionState<string> = await claudeClient.improveText(selectedText, {
      preserveFormatting: true,
      max_tokens: 1024
    }); // Keep callClaudeAPI call
    if (!result.isSuccess || !result.data) {
        return { isSuccess: false, message: result.message || "Failed to improve text via API" };
    }
    return result;
  } catch (error) {
    console.error("Error improving pattern description with Claude:", error);
    return {
      isSuccess: false,
      message: error instanceof Error ? error.message : "Failed to improve pattern description",
    };
  }
}
