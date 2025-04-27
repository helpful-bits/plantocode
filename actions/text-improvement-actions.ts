"use server";

import { ActionState } from "@/types";
import claudeClient from "@/lib/api/claude-client";
 
export async function improveSelectedTextAction(
  selectedText: string,
  projectDirectory?: string,
  sessionId?: string
): Promise<ActionState<string>> {
  try {
    if (!selectedText || !selectedText.trim()) {
      return { isSuccess: false, message: "No text selected for improvement." };
    }
    
    // Use the Claude client to improve the text with project settings
    return claudeClient.improveText(
      selectedText, 
      sessionId,
      { preserveFormatting: true },
      projectDirectory
    );
  } catch (error) {
    console.error("Error improving text with Claude:", error);
    return {
      isSuccess: false,
      message: error instanceof Error ? error.message : "Failed to improve text",
    };
  }
}
