"use server";

import { ActionState } from "@/types";
import geminiClient from '@/lib/api/gemini-client';
import { GEMINI_PRO_PREVIEW_MODEL } from '@/lib/constants'; // Use Pro model for better analysis

const TASK_ENHANCER_MODEL_ID = GEMINI_PRO_PREVIEW_MODEL; // Use Pro model

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
    const systemPrompt = `You are an expert software engineer tasked with providing general direction for completing a programming task based on codebase analysis.

Your role:
1. Review the codebase to understand its structure and architecture
2. Provide general guidance on how to approach the task
3. Highlight the key areas of the code that are most relevant

The guidance should include:
- A high-level overview of the relevant parts of the system
- General approach suggestions for implementing the requested changes
- Brief mentions of key files or components that will be important
- Any important design patterns or architectural considerations

IMPORTANT STYLE INSTRUCTIONS:
- Do NOT include introductory sentences like "I've reviewed the code" or "Here's a plan"
- Start immediately with the substantive content without any preamble
- Do NOT repeat or rephrase the original task description
- Do NOT include concluding statements or "good luck" messages
- Do NOT write in first person (avoid "I", "me", "my")

Keep your response concise and focused on general direction rather than detailed implementation specifics.
Avoid providing overly technical details or exhaustive file lists.
Aim for clarity and brevity - give just enough context to help the developer get started.`;

    // Prepare file content for the prompt context, with specific highlighting of the most relevant files
    const codeContext = relevantFiles
      .map(filePath => {
        const content = fileContents[filePath];
        return content ? `RELEVANT FILE: ${filePath}\n\`\`\`\n${content}\n\`\`\`` : null;
      })
      .filter(Boolean)
      .join("\n\n");
    
    // Count total files and highlight how many are being processed
    const totalFileCount = Object.keys(fileContents).length;
    const relevantFileCount = relevantFiles.length;
    
    const userPromptContent = `Original Task Description:
\`\`\`
${originalDescription}
\`\`\`

You have access to ${totalFileCount} code files in this project, with ${relevantFileCount} files highlighted as most relevant to this task:

${codeContext}

Provide general guidance and direction for approaching this task. Focus on giving a helpful overview rather than specific implementation details.`;

    // Call the Gemini API
    const result = await geminiClient.sendRequest(
      // No system prompt needed for this model/task
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