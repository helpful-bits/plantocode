"use server";

import { ActionState } from '@/types';
import { promises as fs } from 'fs';
import path from 'path';
import { getAllNonIgnoredFiles } from '@/lib/git-utils';
import { isBinaryFile, BINARY_EXTENSIONS } from '@/lib/file-utils';
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

// Flash model limits
const MAX_INPUT_TOKENS = 1000000; // 1M tokens input limit
const FLASH_MAX_OUTPUT_TOKENS = 16384;
const TOKEN_BUFFER = 20000; // Buffer for XML tags and other overhead

/**
 * Helper function to validate a file path
 */
async function validateFilePathInternal(
  filePath: string, 
  fileContents: Record<string, string>, 
  projectDirectory: string,
  allFiles?: string[]
): Promise<boolean> {
  try {
    // Skip empty paths
    if (!filePath || typeof filePath !== 'string' || filePath.trim() === '') {
      console.warn(`[PathFinder] Skipping empty file path`);
      return false;
    }
    
    // Normalize path to handle different formats
    const normalizedPath = filePath.replace(/\\/g, '/').trim();
    
    // First check if we already have the content in our map
    if (fileContents[normalizedPath]) {
      // Skip binary files by checking the extension
      const ext = path.extname(normalizedPath).toLowerCase();
      if (BINARY_EXTENSIONS.has(ext)) {
        console.debug(`[PathFinder] Skipping binary file by extension: ${normalizedPath}`);
        return false;
      }
      
      // We already have the content, so we can check if it's binary
      const content = fileContents[normalizedPath];
      if (!content) return false;
      
      try {
        const isBinary = await isBinaryFile(Buffer.from(content));
        return !isBinary;
      } catch (err) {
        console.debug(`[PathFinder] Error checking binary content for ${normalizedPath}: ${err}`);
        return false;
      }
    } else {
      // Check if the path exists in our known files list
      if (allFiles && allFiles.length > 0) {
        const fileExists = allFiles.includes(normalizedPath);
        if (!fileExists) {
          console.debug(`[PathFinder] Path does not exist in project files: ${normalizedPath}`);
          return false;
        }
        
        // Skip binary files by checking the extension
        const ext = path.extname(normalizedPath).toLowerCase();
        if (BINARY_EXTENSIONS.has(ext)) {
          console.debug(`[PathFinder] Skipping binary file by extension: ${normalizedPath}`);
          return false;
        }
        
        // Try to read the file to check if it's binary or too large
        try {
          // Resolve the full path correctly
          let fullPath;
          if (path.isAbsolute(normalizedPath)) {
            fullPath = normalizedPath;
          } else {
            fullPath = path.join(projectDirectory, normalizedPath);
          }
          
          // Check file size first
          const stats = await fs.stat(fullPath).catch(error => {
            console.debug(`[PathFinder] File stat error for ${normalizedPath}: ${error.code || error.message}`);
            return null;
          });
          
          // Skip if stats couldn't be retrieved or if the file is too large
          if (!stats) {
            return false;
          }
          
          // Skip files that are too large (>10MB) to avoid memory issues
          if (stats.size > 10 * 1024 * 1024) {
            console.warn(`[PathFinder] Skipping large file (${Math.round(stats.size / 1024 / 1024)}MB): ${normalizedPath}`);
            return false;
          }
          
          // Try to read the file and check if it's binary
          const content = await fs.readFile(fullPath);
          const isBinary = await isBinaryFile(content);
          
          if (isBinary) {
            console.debug(`[PathFinder] Skipping detected binary file: ${normalizedPath}`);
            return false;
          }
          
          return true;
        } catch (readError) {
          // Handle file reading errors (permissions, etc)
          console.debug(`[PathFinder] Could not read file: ${normalizedPath}`, readError);
          return false;
        }
      }
      
      // If no allFiles provided, the path is not valid
      console.debug(`[PathFinder] No file list provided to validate against: ${normalizedPath}`);
      return false;
    }
  } catch (error) {
    // Skip files with any other issues
    console.debug(`[PathFinder] Error processing file: ${filePath}`, error);
    return false;
  }
}

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
    
    // Create a background job for path finding
    try {
      // Create a background job using the centralized helper
      const job = await createBackgroundJob(
        sessionId,
        {
          apiType: 'gemini',
          taskType: 'pathfinder' as TaskType,
          model: options?.modelOverride || pathfinderSettings.model,
          rawInput: taskDescription,
          includeSyntax,
          temperature
        }
      );
      
      // Create an async function to be executed in the background
      const executePathFinder = async () => {
        try {
          // Update job to running with proper timestamp handling
          await updateJobToRunning(job.id, 'gemini');
          
          // Get all non-ignored files in the project
          let allFiles;
          try {
            allFiles = await getAllNonIgnoredFiles(projectDirectory);
            if (!allFiles || allFiles.files.length === 0) {
              await updateJobToFailed(job.id, 'No files found in project directory');
              return { isSuccess: false, message: "No files found in project directory" };
            }
          } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Failed to get project files';
            await updateJobToFailed(job.id, `Error getting project files: ${errorMessage}`);
            return { isSuccess: false, message: `Failed to get project files: ${errorMessage}` };
          }
          
          console.log(`[PathFinder] Found ${allFiles.files.length} files in project`);
          
          // Generate directory tree for context
          let dirTree;
          try {
            dirTree = await generateDirectoryTree(projectDirectory);
          } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Failed to generate directory tree';
            await updateJobToFailed(job.id, `Error generating directory tree: ${errorMessage}`);
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
              await updateJobToFailed(job.id, `The project is too large to analyze at once (${estimatedTokens} estimated tokens). Please try with fewer files.`);
              
              return { 
                isSuccess: false, 
                message: `The project is too large to analyze at once (${estimatedTokens} estimated tokens). Please try a more specific task description or focus on a subdirectory.` 
              };
            }
          } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Failed to estimate tokens';
            await updateJobToFailed(job.id, `Error estimating tokens: ${errorMessage}`);
            return { isSuccess: false, message: `Error estimating tokens: ${errorMessage}` };
          }
          
          // Call Gemini through our client
          let result;
          try {
            result = await geminiClient.sendRequest(prompt, {
              model: options?.modelOverride || pathfinderSettings.model,
              systemPrompt,
              temperature: pathfinderSettings.temperature,
              maxOutputTokens: pathfinderSettings.maxTokens,
              requestType: RequestType.CODE_ANALYSIS,
              projectDirectory,
              taskType: 'pathfinder' as unknown as ApiType
            });
            
            if (!result.isSuccess || !result.data) {
              await updateJobToFailed(job.id, result.message || "Failed to find paths");
              return { isSuccess: false, message: result.message || "Failed to find paths" };
            }
          } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error in Gemini API request';
            await updateJobToFailed(job.id, `Error in Gemini request: ${errorMessage}`);
            return { isSuccess: false, message: `Error in Gemini request: ${errorMessage}` };
          }
          
          // Process the response to get clean paths
          const responseText = result.data;
          
          // Try to extract paths from the response
          let paths: string[] = [];
          
          // First method: split by lines (common format for path listing)
          paths = responseText
            .split('\n')
            .map(line => line.trim())
            .filter(line => line.length > 0)
            .filter(line => !line.includes('node_modules/'))
            .map(line => {
              // Clean up paths - remove numbers or bullets at the start
              return line.replace(/^[\d\.\s-]+/, '').trim();
            });
          
          // Fallback method: try to extract from XML tags if present
          if (paths.length === 0 && responseText.includes('<file')) {
            try {
              paths = await extractFilePathsFromTags(responseText);
            } catch (error) {
              console.warn('[PathFinder] Error extracting paths from tags:', error);
              // Continue with other methods
            }
          }
          
          // Last resort: try to extract potential paths without structure
          if (paths.length === 0) {
            try {
              paths = await extractPotentialFilePaths(responseText);
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
          
          // Validate the paths using our helper function with the actual files list
          try {
            for (const filePath of paths) {
              if (await validateFilePathInternal(filePath, fileContents, projectDirectory, allFiles.files)) {
                validatedPaths.push(filePath);
              }
            }
          } catch (error) {
            console.error('[PathFinder] Error validating paths:', error);
            // Continue with any paths we have validated so far
          }
          
          console.log(`[PathFinder] Found ${validatedPaths.length} relevant files`);
          
          // Filter out the force excluded files
          const finalPaths = validatedPaths.filter(
            filePath => !forceExcludedFiles.includes(filePath)
          );
          
          // Update session includedFiles
          try {
            await sessionRepository.updateSessionFields(sessionId, {
              includedFiles: finalPaths
            });
            console.log(`[PathFinder] Successfully updated session ${sessionId} with ${finalPaths.length} included files`);
          } catch (updateError) {
            console.error('[PathFinder] Failed to update session with included files:', updateError);
            // Continue with job update even if session update fails
            // Don't mark the job as failed, just log the error
          }
          
          // Update the job status to completed with proper timestamp handling
          await updateJobToCompleted(job.id, finalPaths.join('\n'), {
            promptTokens: 0,
            completionTokens: 0,
            totalTokens: 0
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