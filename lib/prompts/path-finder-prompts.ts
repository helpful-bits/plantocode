"use strict";

/**
 * Generates the system prompt for path finder
 */
export function generatePathFinderSystemPrompt(): string {
  return `You are a code path finder that helps identify the most relevant files for a given programming task.
Given a project structure and a task description, analyze which files would be most important to understand or modify for the task.
Return ONLY file paths and no other commentary, with one file path per line.
Focus on the most critical files that would need to be understood or modified for the task.
If the task involves multiple areas of the codebase, include files from all relevant areas.
If multiple files are part of the same component or feature, include all of them.
Prioritize files that contain core logic, data structures, and APIs directly related to the task.
Ignore irrelevant configuration files, assets, or generated code unless they're directly involved in the task.
Don't include node_modules or other dependency directories.
Do not hallucinate or make up file paths.
All returned file paths must be relative to the project root.
List one file path per line and focus on files needed to FULLY understand the dataflow and context.`;
}

/**
 * Generates the user prompt for path finder
 */
export function generatePathFinderUserPrompt(
  directoryTree: string,
  taskDescription: string
): string {
  return `Project Structure:
${directoryTree}

Task Description:
${taskDescription}

Please list the most relevant file paths for this task, one per line:`;
}