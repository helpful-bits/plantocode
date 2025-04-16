"use server";

import { ActionState } from '@/types';
import { callGeminiAPI } from '@/lib/gemini'; // Assuming a generic Gemini API client exists or can be adapted
import { estimateTokens } from '@/lib/token-estimator'; // For estimating input size

const PATH_FINDER_MODEL_ID = "gemini-2.0-flash"; // MUST STAY LIKE THIS, DO *NOT* CHANGE!
const MAX_TOKENS_FOR_PATH_FINDER = 1_000_000; // Example token limit

interface PathFinderRequestPayload {
  taskDescription: string;
  codebaseStructure: string;
  // Consider adding file contents map if needed for higher accuracy, but start without it
}

export async function findRelevantFilesAction({
  taskDescription,
  codebaseStructure,
}: PathFinderRequestPayload): Promise<ActionState<{ relevantPaths: string[] }>> {
  if (!taskDescription || !taskDescription.trim()) {
    return { isSuccess: false, message: "Task description cannot be empty." };
  }
  if (!codebaseStructure || !codebaseStructure.trim()) {
    return { isSuccess: false, message: "Codebase structure is required." };
  }

  try {
    // Construct the prompt for the Path Finder model
    const systemPrompt = `You are an expert software engineer tasked with identifying relevant files for a given task within a codebase.
Analyze the provided Task Description and Codebase Structure.
Identify ALL relevant files including code, dependencies, documentation, and configuration files.
Prioritize accuracy and relevance based on the task. Include necessary files, but avoid excessive unrelated files.
VERIFY that all file paths actually exist based on the provided Codebase Structure.
Output ONLY a plain text list of file paths, one per line.
Ensure all paths are relative to the repository root as represented in the structure.
Be COMPREHENSIVE - include many relevant paths. Favor inclusion over exclusion.`;

    const userPromptContent = `Task Description:
${taskDescription}

Codebase Structure:
\`\`\`
${codebaseStructure}
\`\`\`

Based on the Task Description and Codebase Structure, list all relevant file paths, one per line. Only list paths that appear in the Codebase Structure.`;

    const promptForEstimation = systemPrompt + userPromptContent;
    const estimatedTokens = await estimateTokens(promptForEstimation);

    console.log(`[PathFinder] Estimated tokens: ${estimatedTokens}`);

    if (estimatedTokens > MAX_TOKENS_FOR_PATH_FINDER) {
      // --- Splitting Logic Placeholder ---
      // TODO: Implement intelligent splitting based on codebase structure.
      // This might involve:
      // 1. Asking the LLM (or using heuristics) how to divide the codebase structure based on the task.
      // 2. Making parallel calls to findRelevantFilesAction for each chunk.
      // 3. Combining the results (ensuring path uniqueness).
      console.warn(`[PathFinder] Input exceeds token limit (${estimatedTokens} > ${MAX_TOKENS_FOR_PATH_FINDER}). Splitting logic not yet implemented.`);
      return {
        isSuccess: false,
        message: `Input context is too large (${estimatedTokens} tokens). Codebase splitting is not yet implemented. Please reduce the scope or select fewer files manually.`,
        data: { relevantPaths: [] }
      };
      // --- End Placeholder ---
    }

    // Call the Gemini API (adapt callGeminiAPI or create a new one for Flash)
    const result = await callGeminiAPI(systemPrompt, userPromptContent, PATH_FINDER_MODEL_ID);

    if (!result.isSuccess || !result.data) {
      console.error("Gemini API call failed for Path Finder:", result.message);
      return { isSuccess: false, message: result.message || "Failed to find relevant files via AI" };
    }

    const rawPaths = result.data.trim();
    const relevantPaths = rawPaths
      .split('\n')
      .map(p => p.trim())
      .filter(p => p && !p.startsWith('#')); // Filter empty lines and comments

    return {
      isSuccess: true,
      message: `Found ${relevantPaths.length} relevant files.`,
      data: { relevantPaths }
    };

  } catch (error) {
    console.error("Error finding relevant files:", error);
    return {
      isSuccess: false,
      message: error instanceof Error ? error.message : "Failed to find relevant files",
    };
  }
}
