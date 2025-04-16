"use server";

import { getDiffPrompt } from "@/prompts/diff-prompt";

export async function getFormatInstructions(): Promise<string> {
  return getDiffPrompt();
}
