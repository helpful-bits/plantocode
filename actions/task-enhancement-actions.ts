"use server";

import { ActionState } from "@/types";
import geminiClient from '@/lib/api/gemini-client';
import { GEMINI_PRO_PREVIEW_MODEL } from '@/lib/constants'; 
import { generateDirectoryTree } from '@/lib/directory-tree';
import { getModelSettingsForProject } from '@/actions/project-settings-actions';
import { 
  generateImplementationPlanSystemPrompt,
  generateImplementationPlanUserPrompt
} from '@/lib/prompts/implementation-plan-prompts';

const TASK_ENHANCER_MODEL_ID = GEMINI_PRO_PREVIEW_MODEL; // Use Pro model

// New function to generate just the prompt template without API call
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

    // Combine the prompts
    const fullPrompt = `${systemPrompt}\n\n${userPromptContent}`;

    return {
      isSuccess: true,
      message: "Successfully generated task prompt template.",
      data: fullPrompt
    };
  } catch (error: unknown) {
    console.error("Error generating task prompt template:", error);
    return {
      isSuccess: false,
      message: error instanceof Error ? error.message : "Failed to generate task prompt template",
    };
  }
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
  if (!originalDescription.trim()) {
    return { isSuccess: false, message: "Original task description cannot be empty." };
  }

  if (relevantFiles.length === 0 || Object.keys(fileContents).length === 0) {
    return { isSuccess: false, message: "No relevant files or file contents provided." };
  }

  try {
    // Get model settings for the project
    const projectSettings = await getModelSettingsForProject(projectDirectory);
    
    // Get task enhancement settings or use defaults
    const enhancementSettings = projectSettings?.task_enhancement || {
      model: TASK_ENHANCER_MODEL_ID,
      maxTokens: 16384,
      temperature: 0.9
    };
    
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