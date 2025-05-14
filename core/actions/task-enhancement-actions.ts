"use server";

import { ActionState } from "@core/types";
import { geminiClient } from '@core/lib/api'; // Import from centralized API module
import { GEMINI_PRO_PREVIEW_MODEL } from '@core/lib/constants';
import { generateDirectoryTree } from '@core/lib/directory-tree';
import { getModelSettingsForProject } from '@core/actions/project-settings-actions';
import {
  generateImplementationPlanSystemPrompt,
  generateImplementationPlanUserPrompt
} from '@core/lib/prompts/implementation-plan-prompts';

const TASK_ENHANCER_MODEL_ID = GEMINI_PRO_PREVIEW_MODEL; // Use Pro model

// Private helper function to prepare the task enhancement prompt
async function _prepareTaskEnhancementPrompt({
  originalDescription, 
  relevantFiles,
  fileContents,
  projectDirectory
}: {
  originalDescription: string;
  relevantFiles: string[];
  fileContents: Record<string, string>;
  projectDirectory: string;
}): Promise<ActionState<{systemPrompt: string; userPromptContent: string}>> {
  if (!originalDescription.trim()) {
    return { isSuccess: false, message: "Original task description cannot be empty." };
  }

  if (relevantFiles.length === 0 || Object.keys(fileContents).length === 0) {
    return { isSuccess: false, message: "No relevant files or file contents provided." };
  }

  try {
    // Generate project structure tree
    const projectStructure = await generateDirectoryTree(projectDirectory);
    
    // Get the system prompt
    const systemPrompt = generateImplementationPlanSystemPrompt();
    
    // Get the user prompt
    const userPromptContent = generateImplementationPlanUserPrompt({
      originalDescription,
      projectStructure,
      relevantFiles,
      fileContents
    });

    return {
      isSuccess: true,
      message: "Successfully prepared task enhancement prompt.",
      data: { systemPrompt, userPromptContent }
    };
  } catch (error: unknown) {
    console.error("Error preparing task enhancement prompt:", error);
    return {
      isSuccess: false,
      message: error instanceof Error ? error.message : "Failed to prepare task enhancement prompt",
    };
  }
}

// Generate just the prompt template without API call
export async function generateTaskPromptTemplateAction({
  originalDescription, 
  relevantFiles,
  fileContents,
  projectDirectory
}: {
  originalDescription: string;
  relevantFiles: string[];
  fileContents: Record<string, string>;
  projectDirectory: string;
}): Promise<ActionState<string>> {
  // Use the helper function to prepare the prompts
  const promptResult = await _prepareTaskEnhancementPrompt({
    originalDescription,
    relevantFiles,
    fileContents,
    projectDirectory
  });

  // If the helper returned an error, return it directly
  if (!promptResult.isSuccess || !promptResult.data) {
    return promptResult as ActionState<any>;
  }

  // Combine the prompts
  const { systemPrompt, userPromptContent } = promptResult.data;
  const fullPrompt = `${systemPrompt}\n\n${userPromptContent}`;

  return {
    isSuccess: true,
    message: "Successfully generated task prompt template.",
    data: fullPrompt
  };
}

export async function enhanceTaskDescriptionAction({
  originalDescription,
  relevantFiles,
  fileContents,
  projectDirectory
}: {
  originalDescription: string;
  relevantFiles: string[];
  fileContents: Record<string, string>;
  projectDirectory: string;
}): Promise<ActionState<string>> {
  // Use the helper function to prepare the prompts
  const promptResult = await _prepareTaskEnhancementPrompt({
    originalDescription,
    relevantFiles,
    fileContents,
    projectDirectory
  });

  // If the helper returned an error, return it directly
  if (!promptResult.isSuccess || !promptResult.data) {
    return promptResult as ActionState<any>;
  }

  const { systemPrompt, userPromptContent } = promptResult.data;

  try {
    // Get model settings for the project
    const projectSettings = await getModelSettingsForProject(projectDirectory);
    
    // Get task enhancement settings or use defaults
    const enhancementSettings = projectSettings?.task_enhancement || {
      model: TASK_ENHANCER_MODEL_ID,
      maxTokens: 16384,
      temperature: 0.9
    };

    // Call the Gemini API
    const result = await geminiClient.sendRequest(
      userPromptContent,
      {
        model: enhancementSettings.model,
        systemPrompt: systemPrompt,
        maxOutputTokens: enhancementSettings.maxTokens,
        temperature: enhancementSettings.temperature,
        taskType: 'task_enhancement',
        apiType: 'gemini',
        projectDirectory: projectDirectory
      }
    );

    if (!result.isSuccess) {
      console.error("Gemini API call failed for Task Enhancement:", result.message);
      return { isSuccess: false, message: result.message || "Failed to enhance task description via AI" };
    }

    // Handle background job response
    if (result.data && typeof result.data === 'object' && 'isBackgroundJob' in result.data) {
      return {
        isSuccess: true,
        message: "Task enhancement sent to background job processor.",
        data: `Processing in background job: ${result.data.jobId}`
      };
    }

    // Handle string response
    if (result.data && typeof result.data === 'string') {
      return {
        isSuccess: true,
        message: "Successfully enhanced task description.",
        data: result.data.trim()
      };
    }

    // Fallback for missing data
    return {
      isSuccess: false,
      message: "Failed to enhance task description - no data returned"
    };
  } catch (error: unknown) {
    console.error("Error enhancing task description:", error);
    return {
      isSuccess: false,
      message: error instanceof Error ? error.message : "Failed to enhance task description",
    };
  }
} 