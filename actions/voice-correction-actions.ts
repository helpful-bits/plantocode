"use server";

import claudeClient from "@/lib/api/claude-client";
import { ActionState } from "@/types";

export async function correctTaskDescriptionAction(rawText: string): Promise<ActionState<string>> {
  try {
    if (!rawText || !rawText.trim()) {
      return { isSuccess: false, message: "No text provided for correction." };
    }
    
    // Use the new Claude client for text correction
    return claudeClient.correctTaskDescription(rawText);
  } catch (error) {
    console.error("Error correcting text with Claude:", error);
    return {
      isSuccess: false,
      message: "Failed to correct text",
    };
  }
}
