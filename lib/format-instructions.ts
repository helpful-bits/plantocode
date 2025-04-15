"use server";
 
import { OutputFormat } from "@/types";
import { getDiffPrompt } from "@/prompts/diff-prompt";
import { getRefactoringPrompt } from "@/prompts/refactoring-prompt";
import { getPathFinderPrompt } from "@/prompts/path-finder-prompt";

export async function getFormatInstructions(format: OutputFormat, customFormat: string = ""): Promise<string> {
  if (format === "diff") {
    return getDiffPrompt();
  } 
  
  if (format === "refactoring") {
    return getRefactoringPrompt();
  }
  
  if (format === "path-finder") {
    return getPathFinderPrompt();
  }

  return customFormat || "Please process the task described below using the provided files.";
}
