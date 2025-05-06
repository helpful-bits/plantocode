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
import { normalizePathForComparison } from '@/lib/path-utils';

// Flash model limits
const MAX_INPUT_TOKENS = 1000000; // 1M tokens input limit
const FLASH_MAX_OUTPUT_TOKENS = 16384;
const TOKEN_BUFFER = 20000; // Buffer for XML tags and other overhead

/**
 * Extract file paths from a response containing XML tags
 */
async function extractFilePathsFromTags(responseText: string): Promise<string[]> {
  const paths: string[] = [];
  
  // Match <file path="..."> or <file>path</file> patterns
  const filePathRegex = /<file(?:\s+path="([^"]+)"|[^>]*)>(?:([^<]+)<\/file>)?/g;
  let match;
  
  while ((match = filePathRegex.exec(responseText)) !== null) {
    const attributePath = match[1]; // path from attribute
    const contentPath = match[2]; // path from content
    
    if (attributePath) {
      paths.push(attributePath.trim());
    } else if (contentPath) {
      paths.push(contentPath.trim());
    }
  }
  
  return paths;
}

/**
 * Extract file paths without relying on XML tags
 */
async function extractPotentialFilePaths(responseText: string): Promise<string[]> {
  const paths: string[] = [];
  
  // Split by newlines and process each line
  const lines = responseText.split('\n');
  
  // Common file extensions to help identify legitimate paths
  const commonExtensions = new Set([
    '.js', '.jsx', '.ts', '.tsx', '.py', '.java', '.c', '.cpp', '.h', '.hpp',
    '.go', '.rb', '.php', '.html', '.css', '.scss', '.json', '.xml', '.yaml', 
    '.yml', '.md', '.txt', '.sh', '.bat', '.ps1', '.sql', '.graphql', '.prisma',
    '.vue', '.svelte', '.dart', '.kt', '.swift', '.m', '.rs', '.toml'
  ]);
  
  // Regex to identify invalid path characters
  const invalidPathChars = /[<>:"|?*\x00-\x1F]/;
  
  // Regex to detect line formatting that's likely not a file path
  const nonPathLineFormats = /^(note|remember|important|tip|hint|warning|error|caution|attention|info):/i;
  
  // Regex to match common code file pattern: [dir/]file.ext
  const filePathPattern = /^(?:(?:\.{1,2}\/)?[\w-]+\/)*[\w-]+\.\w+$/;
  
  for (const line of lines) {
    const trimmedLine = line.trim();
    
    // Skip empty lines, lines that look like XML tags, or commented lines
    if (!trimmedLine || 
        trimmedLine.startsWith('<') || 
        trimmedLine.startsWith('#') ||
        trimmedLine.startsWith('//') ||
        trimmedLine.startsWith('/*') ||
        trimmedLine.startsWith('*')) {
      continue;
    }
    
    // Skip lines that are likely prose or instructions
    if (nonPathLineFormats.test(trimmedLine)) {
      continue;
    }
    
    // Remove numbering/bullets at the start of lines (common in LLM responses)
    const cleanedLine = trimmedLine.replace(/^[\d\.\s-]+/, '').trim();
    
    // Skip if it's empty after cleaning
    if (!cleanedLine) continue;
    
    // Skip lines that look like they're just regular text (too many spaces, parentheses, etc.)
    if (cleanedLine.split(' ').length > 2) continue;
    
    // Skip if it's too short to be a valid path
    if (cleanedLine.length < 4) continue;
    
    // Skip lines that don't look like file paths (no extension or directory separator)
    if (!cleanedLine.includes('.') && !cleanedLine.includes('/')) continue;
    
    // Require at least one path separator to avoid single filenames
    if (!cleanedLine.includes('/') && !cleanedLine.includes('\\')) continue;
    
    // Check for common file extensions
    const hasValidExtension = Array.from(commonExtensions).some(ext => 
      cleanedLine.toLowerCase().endsWith(ext)
    );
    
    // Skip if no valid extension found and it doesn't look like a directory path
    if (!hasValidExtension && !cleanedLine.endsWith('/')) continue;
    
    // Skip paths with invalid characters
    if (invalidPathChars.test(cleanedLine)) continue;
    
    // Skip extremely long paths (likely not valid)
    if (cleanedLine.length > 255) continue;
    
    // Skip if the line contains HTML/Markdown formatting
    if (cleanedLine.includes('</') || cleanedLine.includes('](')) continue;
    
    // Skip likely descriptive text that happens to contain periods and slashes
    if (cleanedLine.includes(':') && !cleanedLine.includes(':/')) continue;
    
    // Apply stricter regex pattern for common file path format
    if (!filePathPattern.test(cleanedLine) && 
        !cleanedLine.startsWith('/') && 
        !cleanedLine.startsWith('./') &&
        !cleanedLine.startsWith('../')) {
      continue;
    }
    
    // Check if it has a minimum number of path segments for typical codebase paths
    const pathSegments = cleanedLine.split('/').filter(Boolean);
    if (pathSegments.length < 2 && !cleanedLine.startsWith('./')) continue;
    
    // Add to our potential paths
    paths.push(cleanedLine);
  }
  
  return paths;
}

export async function findRelevantFilesAction(
  sessionId: string,
  taskDescription: string,
  includedFiles: string[] = [],
  forceExcludedFiles: string[] = [],
  options?: { 
    modelOverride?: string,
    projectDirectory?: string
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
    
    // Get all the data ready first, before creating the background job
    try {
      // Get all non-ignored files in the project
      let allFiles;
      try {
        allFiles = await getAllNonIgnoredFiles(projectDirectory);
        if (!allFiles || allFiles.files.length === 0) {
          return { isSuccess: false, message: "No files found in project directory" };
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Failed to get project files';
        return { isSuccess: false, message: `Failed to get project files: ${errorMessage}` };
      }
      
      console.log(`[PathFinder] Found ${allFiles.files.length} files in project`);
      
      // Generate directory tree for context
      let dirTree;
      try {
        dirTree = await generateDirectoryTree(projectDirectory);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Failed to generate directory tree';
        return { isSuccess: false, message: `Failed to generate directory tree: ${errorMessage}` };
      }
      
      // Use the centralized prompts
      const systemPrompt = generatePathFinderSystemPrompt();
      
      // Create a prompt with project structure and task description
      const prompt = generatePathFinderUserPrompt(dirTree, taskDescription);
      
      // Estimate tokens to ensure we're within limits
      let estimatedTokens;
      try {
        const promptTokens = await estimateTokens(prompt);
        const systemPromptTokens = await estimateTokens(systemPrompt);
        estimatedTokens = promptTokens + systemPromptTokens;
        
        if (estimatedTokens > MAX_INPUT_TOKENS - TOKEN_BUFFER) {
          return { 
            isSuccess: false, 
            message: `The project is too large to analyze at once (${estimatedTokens} estimated tokens). Please try a more specific task description or focus on a subdirectory.` 
          };
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Failed to estimate tokens';
        return { isSuccess: false, message: `Error estimating tokens: ${errorMessage}` };
      }
      
      // Now create a single background job with all the prepared data
      const job = await createBackgroundJob(
        sessionId,
        {
          apiType: 'gemini',
          taskType: 'pathfinder' as TaskType,
          model: options?.modelOverride || pathfinderSettings.model,
          rawInput: prompt,
          includeSyntax,
          temperature,
          metadata: {
            systemPrompt: systemPrompt,
            maxOutputTokens: pathfinderSettings.maxTokens,
            estimatedInputTokens: estimatedTokens || 0
          }
        }
      );
      
      // Create an async function to be executed in the background
      const executePathFinder = async () => {
        try {
          // Update the job status to running
          await updateJobToRunning(job.id, 'gemini');
          
          // We need to make the actual API call here as part of the background job processing
          // This is the key change - using the geminiClient to make the API request
          console.log(`[PathFinder] Making API request for job ${job.id}`);
          
          // Use the standard request function (non-streaming for path finder)
          const apiResult = await geminiClient.sendRequest(prompt, {
            sessionId,
            requestId: job.id, // Use job ID as request ID for tracing
            model: options?.modelOverride || pathfinderSettings.model,
            systemPrompt,
            temperature,
            maxOutputTokens: pathfinderSettings.maxTokens,
            includeSyntax,
            taskType: 'pathfinder',
            apiType: 'gemini',
            metadata: {
              systemPrompt,
              maxOutputTokens: pathfinderSettings.maxTokens,
              estimatedInputTokens: estimatedTokens || 0
            }
          });
          
          // Check if the API call was successful
          if (!apiResult.isSuccess) {
            console.error(`[PathFinder] API error for job ${job.id}: ${apiResult.message}`);
            await updateJobToFailed(job.id, `API Error: ${apiResult.message}`);
            return { isSuccess: false, message: apiResult.message };
          }
          
          // Make sure we have a response - handle the TypeScript undefined case
          const responseData = apiResult.data || '';
          
          // Update the job with the API response
          await updateJobToCompleted(job.id, responseData, {
            tokensSent: estimatedTokens || 0,
            tokensReceived: apiResult.metadata?.tokensReceived || Math.ceil(responseData.length / 3.5),
            totalTokens: (estimatedTokens || 0) + (apiResult.metadata?.tokensReceived || Math.ceil(responseData.length / 3.5)),
            modelUsed: options?.modelOverride || pathfinderSettings.model
          });
          
          // Create result object from API response
          const result = {
            isSuccess: true,
            data: responseData,
            metadata: apiResult.metadata || {}
          };
          
          // Process the response to get clean paths (we know responseData is a string from above)
          
          // Try to extract paths from the response
          let paths: string[] = [];
          
          // First method: split by lines (common format for path listing)
          paths = responseData
            .split('\n')
            .map((line: string) => line.trim())
            .filter((line: string) => line.length > 0)
            .filter((line: string) => !line.includes('node_modules/'))
            .map((line: string) => {
              // Clean up paths - remove numbers or bullets at the start
              return line.replace(/^[\d\.\s-]+/, '').trim();
            })
            // Normalize paths for consistent comparison
            .map((line: string) => normalizePathForComparison(line));
          
          // Fallback method: try to extract from XML tags if present
          if (paths.length === 0 && responseData.includes('<file')) {
            try {
              const extractedPaths = await extractFilePathsFromTags(responseData);
              // Normalize extracted paths
              paths = extractedPaths.map(p => normalizePathForComparison(p));
            } catch (error) {
              console.warn('[PathFinder] Error extracting paths from tags:', error);
              // Continue with other methods
            }
          }
          
          // Last resort: try to extract potential paths without structure
          if (paths.length === 0) {
            try {
              const potentialPaths = await extractPotentialFilePaths(responseData);
              // Normalize extracted paths
              paths = potentialPaths.map(p => normalizePathForComparison(p));
            } catch (error) {
              console.warn('[PathFinder] Error extracting potential paths:', error);
              // If we still have no paths, fail gracefully
              if (paths.length === 0) {
                await updateJobToFailed(job.id, "Failed to extract valid file paths from response");
                return { isSuccess: false, message: "Failed to extract valid file paths from response" };
              }
            }
          }
          
          // Validate the paths exist in the project using our helper function
          const validatedPaths = [];
          
          // Since allFiles doesn't have content, we'll use an empty record
          // and let validateFilePath use the filesystem fallback
          const fileContents: Record<string, string> = {};
          
          // Ensure all files in the list are also normalized for consistent comparison
          const normalizedAllFilesList = allFiles.files.map(p => normalizePathForComparison(p));
          
          // Validate the paths using our helper function with the normalized files list
          try {
            for (const filePath of paths) {
              if (await validateFilePath(filePath, fileContents, projectDirectory, normalizedAllFilesList)) {
                validatedPaths.push(filePath);
              }
            }
          } catch (error) {
            console.error('[PathFinder] Error validating paths:', error);
            // Continue with any paths we have validated so far
          }
          
          console.log(`[PathFinder] Found ${validatedPaths.length} relevant files`);
          
          // Filter out the force excluded files - normalize the excluded files for consistent comparison
          const normalizedExcludedFiles = forceExcludedFiles.map(p => normalizePathForComparison(p));
          const finalPaths = validatedPaths.filter(
            filePath => !normalizedExcludedFiles.includes(filePath)
          );
          
          // Get current session to merge with existing includedFiles
          try {
            // Fetch the current session to get existing includedFiles
            const currentSession = await sessionRepository.getSession(sessionId);
            if (!currentSession) {
              console.error(`[PathFinder] Session ${sessionId} not found for path merging`);
              // We'll continue and just use the new paths
            } else {
              // Get existing included files and normalize them for consistent comparison
              const existingIncludedPaths = (currentSession.includedFiles || [])
                .map(p => normalizePathForComparison(p));
              
              // Merge existing paths with the new paths
              const mergedPathsSet = new Set([...existingIncludedPaths, ...finalPaths]);
              const mergedIncludedFiles = Array.from(mergedPathsSet);
              
              console.log(`[PathFinder] Merging ${existingIncludedPaths.length} existing paths with ${finalPaths.length} new paths (${mergedIncludedFiles.length} total after deduplication)`);
              
              // Update session with merged paths
              await sessionRepository.updateSessionFields(sessionId, {
                includedFiles: mergedIncludedFiles
              });
              console.log(`[PathFinder] Successfully updated session ${sessionId} with ${mergedIncludedFiles.length} merged included files`);
            }
          } catch (updateError) {
            console.error('[PathFinder] Failed to update session with included files:', updateError);
            // Continue with job update even if session update fails
            // Don't mark the job as failed, just log the error
          }
          
          // Update the job status to completed with proper timestamp handling
          // Extract token counts from the result if available
          const promptTokens = result.metadata?.promptTokens || result.metadata?.tokensInput || estimatedTokens || 0;
          const completionTokens = result.metadata?.completionTokens || result.metadata?.tokensOutput || finalPaths.length * 5 || 0;
          
          await updateJobToCompleted(job.id, finalPaths.join('\n'), {
            tokensSent: promptTokens,
            tokensReceived: completionTokens,
            totalTokens: promptTokens + completionTokens
          });
          
          return {
            isSuccess: true,
            message: `Found ${finalPaths.length} relevant paths`,
            data: { paths: finalPaths }
          };
        } catch (error) {
          console.error('[PathFinder] Error finding relevant paths:', error);
          
          // Ensure we always update the job status to failed in case of any unhandled errors
          const errorMessage = error instanceof Error ? error.message : 'Unknown error during path finding';
          try {
            await updateJobToFailed(job.id, errorMessage);
          } catch (jobUpdateError) {
            console.error('[PathFinder] Failed to update job status to failed:', jobUpdateError);
            // At this point, we can't do much more than log the error
          }
          
          return { 
            isSuccess: false, 
            message: error instanceof Error ? error.message : "Failed to find relevant paths" 
          };
        }
      };
      
      // Schedule the function to run asynchronously
      setTimeout(executePathFinder, 0);
      
      // Return immediately with the job ID
      return {
        isSuccess: true,
        message: "Path finder job started",
        data: { jobId: job.id }
      };
    } catch (error) {
      return handleActionError(error, "findRelevantFilesAction");
    }
  } catch (error) {
    return handleActionError(error, "findRelevantFilesAction");
  }
} 