/**
 * Prompts for generating concise titles for implementation plans
 */

/**
 * System prompt for generating implementation plan titles
 */
export function generateImplementationPlanTitleSystemPrompt(): string {
  return `You are an AI assistant that generates concise, descriptive titles for software implementation plans based on a task description and relevant files.

Your title must:
- Be maximum 10 words
- Be specific and informative 
- Describe the technical change being implemented
- Avoid phrases like "Implementation Plan for..."
- Be written in title case
- NOT include the file names directly

Respond ONLY with the title itself, no additional context, explanation, or punctuation.`;
}

/**
 * User prompt for generating implementation plan titles
 */
export interface ImplementationPlanTitlePromptParams {
  taskDescription: string;
  relevantFilesSummary: string;
}

export function generateImplementationPlanTitleUserPrompt(params: ImplementationPlanTitlePromptParams): string {
  const { taskDescription, relevantFilesSummary } = params;

  return `Generate a concise, descriptive title (max 10 words) for the following software implementation task:

Task Description: ${taskDescription}

${relevantFilesSummary}

The title should capture the essence of what is being implemented or modified. 
Respond with ONLY the title text.`;
}