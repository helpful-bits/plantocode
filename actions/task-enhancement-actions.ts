"use server";

import { ActionState } from "@/types";
import { callGeminiAPI } from '@/lib/gemini-api';

const TASK_ENHANCER_MODEL_ID = 'gemini-2.0-flash';

export async function enhanceTaskDescriptionAction({
  originalDescription, // Keep originalDescription parameter
  relevantFiles,
  fileContents
}: {
  originalDescription: string;
  relevantFiles: string[];
  fileContents: Record<string, string>;
}): Promise<ActionState<string>> {
  if (!originalDescription.trim()) {
    return { isSuccess: false, message: "Original task description cannot be empty." };
  }

  if (relevantFiles.length === 0 || Object.keys(fileContents).length === 0) {
    return { isSuccess: false, message: "No relevant files or file contents provided." };
  }

  try {
    // Construct the prompt for task enhancement using code analysis
    const systemPrompt = `You are an expert software engineer and technical writer that helps clarify and enhance task descriptions based on code analysis.
Analyze the provided Task Description and the relevant code files that have been selected.
Enhance and improve the task description by adding specific details, clarifying ambiguities, and making it more technically precise.
Use your insights from the code to add missing context and details that would make the task clearer.
Format your response as a concise, well-structured paragraph or bullet points.
Focus ONLY on enhancing the task description - do not include implementation details or solutions.
Do not repeat information already in the original description unless you're clarifying it.
Be specific and reference relevant parts of the code when useful.`;

    // Prepare file content for the prompt context
    const codeContext = relevantFiles
      .map(filePath => {
        const content = fileContents[filePath];
        return content ? `File: ${filePath}\n\`\`\`\n${content}\n\`\`\`` : null;
      })
      .filter(Boolean)
      .join("\n\n");

    const userPromptContent = `Original Task Description:
\`\`\`
${originalDescription}
\`\`\`

Relevant Code Files:
${codeContext}

Based on the original task description and the code files, provide an enhanced, more specific task description.`;

    // Call the Gemini API
    const result = await callGeminiAPI(
      systemPrompt,
      userPromptContent,
      TASK_ENHANCER_MODEL_ID,
      { maxOutputTokens: 1024 }
    );

    if (!result.isSuccess || !result.data) {
      console.error("Gemini API call failed for Task Enhancement:", result.message);
      return { isSuccess: false, message: result.message || "Failed to enhance task description via AI" };
    }

    return {
      isSuccess: true,
      message: "Successfully enhanced task description.",
      data: result.data.trim()
    };
  } catch (error: unknown) {
    console.error("Error enhancing task description:", error);
    return {
      isSuccess: false,
      message: error instanceof Error ? error.message : "Failed to enhance task description",
    };
  }
} 