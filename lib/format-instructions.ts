"use server";
 
// Removed OutputFormat import and other prompt imports
import { getDiffPrompt } from "@/prompts/diff-prompt";

export async function getFormatInstructions(): Promise<string> {
  // Always return the diff prompt as format selection is removed
  return getDiffPrompt();
}
