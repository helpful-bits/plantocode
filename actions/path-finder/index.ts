"use server";

import { ActionState } from '@/types';
import { promises as fs } from 'fs';
import path from 'path';
import { getAllNonIgnoredFiles } from '@/lib/git-utils';
import { isBinaryFile, BINARY_EXTENSIONS, validateFilePath } from '@/lib/file-utils';
import { estimateTokens } from '@/lib/token-estimator';
import { GEMINI_FLASH_MODEL } from '@/lib/constants';
import geminiClient from '@/lib/api/clients/gemini';
import { RequestType } from '@/lib/api/streaming-request-pool-types';
import { getModelSettingsForProject } from '@/actions/project-settings-actions';
import { backgroundJobRepository, sessionRepository } from '@/lib/db/repositories';
import { generateDirectoryTree } from '@/lib/directory-tree';
import { ApiType, TaskType } from '@/types/session-types';
import { handleActionError } from '@/lib/action-utils';
import { createBackgroundJob, updateJobToRunning, updateJobToCompleted, updateJobToFailed } from '@/lib/jobs/job-helpers';
import { generatePathFinderSystemPrompt, generatePathFinderUserPrompt } from '@/lib/prompts/path-finder-prompts';
import { normalizePathForComparison, makePathRelative, parseFilePathsFromAIResponse } from '@/lib/path-utils';

// Flash model limits
const MAX_INPUT_TOKENS = 1000000; // 1M tokens input limit
const FLASH_MAX_OUTPUT_TOKENS = 16384;
const TOKEN_BUFFER = 20000; // Buffer for XML tags and other overhead


export async function findRelevantFilesAction(
  sessionId: string,
  taskDescription: string,
  includedFiles: string[] = [],
  forceExcludedFiles: string[] = [],
  options?: { 
    modelOverride?: string,
    projectDirectory?: string,
    includeFileContents?: boolean // Flag to indicate whether to include file contents
  }
): Promise<ActionState<{ jobId: string }>> {
  try {
    // Add strict session ID validation
    if (!sessionId || typeof sessionId !== 'string' || !sessionId.trim()) {
      return { 
        isSuccess: false, 
        message: "Invalid or missing session ID for file finding."
      };
    }

    // Fetch the session to get the project directory if not provided
    let projectDirectory = options?.projectDirectory;
    if (!projectDirectory) {
      const session = await sessionRepository.getSession(sessionId);
      if (!session) {
        return { 
          isSuccess: false, 
          message: `Session ${sessionId} not found.` 
        };
      }
      projectDirectory = session.projectDirectory;
    }

    if (!projectDirectory) {
      return { 
        isSuccess: false, 
        message: "Project directory is required for finding relevant files." 
      };
    }
    
    if (!taskDescription || taskDescription.trim().length < 10) {
      return { 
        isSuccess: false, 
        message: "Task description is required and must be at least 10 characters." 
      };
    }

    // Get path finder settings - either from project or defaults
    const pathfinderSettings = {
      model: GEMINI_FLASH_MODEL,
      temperature: 0.2,
      maxTokens: FLASH_MAX_OUTPUT_TOKENS
    };

    try {
      const modelSettings = await getModelSettingsForProject(projectDirectory);
      if (modelSettings && modelSettings.pathfinder) {
        if (modelSettings.pathfinder.model) {
          pathfinderSettings.model = modelSettings.pathfinder.model;
        }
        
        if (modelSettings.pathfinder.temperature !== undefined) {
          pathfinderSettings.temperature = modelSettings.pathfinder.temperature;
        }
        
        if (modelSettings.pathfinder.maxTokens) {
          pathfinderSettings.maxTokens = modelSettings.pathfinder.maxTokens;
        }
      }
    } catch (err) {
      console.warn("Could not load project settings for path finder:", err);
      // Continue with defaults
    }

    const temperature = pathfinderSettings.temperature;

    // Ensure maxTokens is a valid number
    const includeSyntax = pathfinderSettings.maxTokens !== undefined && pathfinderSettings.maxTokens > 0;
    
    try {
      // Create the job payload first
      const payload = {
        sessionId,
        taskDescription,
        projectDirectory,
        systemPrompt: generatePathFinderSystemPrompt(),
        modelOverride: options?.modelOverride || pathfinderSettings.model,
        temperature,
        maxOutputTokens: pathfinderSettings.maxTokens
      };

      // Create a background job for tracking this operation with worker-specific details
      const job = await createBackgroundJob(
        sessionId,
        {
          apiType: 'gemini',
          taskType: 'pathfinder' as TaskType,
          model: options?.modelOverride || pathfinderSettings.model,
          rawInput: taskDescription,
          includeSyntax,
          temperature,
          metadata: {
            includeFileContents: options?.includeFileContents || false
          },
          // Include worker-specific details directly in createBackgroundJob
          jobTypeForWorker: 'PATH_FINDER',
          jobPayloadForWorker: payload,
          jobPriorityForWorker: 2 // Priority 2 (medium-high)
        }
      );

      // Add debugging to track the job creation
      console.log(`[DEBUG] Created PathFinder job: ${job.id}, status: ${job.status}, visible: ${job.visible}, cleared: ${job.cleared}`);
      console.log(`[DEBUG] Job projectDirectory: ${job.projectDirectory}, taskType: ${job.taskType}`);
      console.log(`[DEBUG] Job metadata: ${JSON.stringify(job.metadata, null, 2)}`);

      try {
        // Force job to remain visible
        await backgroundJobRepository.updateBackgroundJobClearedStatus(job.id, false);
        console.log(`[DEBUG] Explicitly set job ${job.id} cleared status to false`);
      } catch (error) {
        console.error(`[DEBUG] Error setting job visibility: ${error}`);
      }

      // Return immediately with the job ID
      return {
        isSuccess: true,
        message: "Path finder job queued",
        data: { jobId: job.id }
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`[PathFinder] Error queuing path finder job: ${errorMessage}`);
      return { 
        isSuccess: false,
        message: `Error queuing path finder job: ${errorMessage}`
      };
    }
  } catch (error) {
    return handleActionError(error, "findRelevantFilesAction");
  }
} 