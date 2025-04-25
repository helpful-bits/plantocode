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
