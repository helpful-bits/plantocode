"use server";

import { OutputFormat } from "@/types";
import { getDiffPrompt } from "@/prompts/diff-prompt";
import { getRefactoringPrompt } from "@/prompts/refactoring-prompt";

export async function getFormatInstructions(format: OutputFormat, customFormat: string = ""): Promise<string> {
  if (format === "diff") {
    return getDiffPrompt();
  } 
  
  if (format === "refactoring") {
    return getRefactoringPrompt();
  }
  
  return customFormat;
} 