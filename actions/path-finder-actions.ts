"use server";

import { ActionState } from '@/types';
import { generateDirectoryTree } from '@/lib/directory-tree';
import { promises as fs } from 'fs';
import path from 'path'; // Keep path import
import { getAllNonIgnoredFiles } from '@/lib/git-utils';
import { isBinaryFile, BINARY_EXTENSIONS } from '@/lib/file-utils';
import { estimateTokens } from '@/lib/token-estimator';
import { GEMINI_FLASH_MODEL, GEMINI_PRO_PREVIEW_MODEL } from '@/lib/constants';
import geminiClient from '@/lib/api/gemini-client';
import { RequestType } from '@/lib/api/streaming-request-pool';
import { getModelSettingsForProject } from '@/actions/project-settings-actions';

// Flash model limits
const MAX_INPUT_TOKENS = 1000000; // 1M tokens input limit
const FLASH_MAX_OUTPUT_TOKENS = 16384;
const TOKEN_BUFFER = 20000; // Buffer for XML tags and other overhead

interface PathFinderRequestPayload {
  taskDescription: string;
}

// Add this type definition for type safety
interface FileWithContent {
  files: string[];
  isGitRepo: boolean;
}

/**
 * Helper function to validate a file path
 */
async function validateFilePath(
  filePath: string, 
  fileContents: Record<string, string>, 
  projectDirectory: string
): Promise<boolean> {
  try {
    // First check if we already have the content in our map
    if (fileContents[filePath]) {
      // Skip binary files by checking the extension
      const ext = path.extname(filePath).toLowerCase();
      if (BINARY_EXTENSIONS.has(ext)) return false;
      
      // We already have the content, so we can check if it's binary
      const content = fileContents[filePath];
      const isBinary = await isBinaryFile(Buffer.from(content));
      return !isBinary;
    } else {
      // For compatibility with paths that might not be in our dictionary
      // but are valid relative to the project directory
      const fullPath = path.join(projectDirectory, filePath);
      try {
        const stats = await fs.stat(fullPath);
        if (stats.isFile()) {
          // Skip binary files
          const ext = path.extname(filePath).toLowerCase();
          if (BINARY_EXTENSIONS.has(ext)) return false;
          
          try {
            const content = await fs.readFile(fullPath);
            const isBinary = await isBinaryFile(content);
            return !isBinary;
          } catch (error) {
            // Skip files we can't read
            console.warn(`[PathFinder] Could not read file: ${filePath}`, error);
            return false;
          }
        }
      } catch (error) {
        // Skip files that don't exist
        console.warn(`[PathFinder] File doesn't exist: ${filePath}`);
        return false;
      }
    }
    return false;
  } catch (error) {
    // Skip files with any other issues
    console.warn(`[PathFinder] Error processing file: ${filePath}`, error);
    return false;
  }
}

/**
 * Uses Gemini Flash to find the most relevant files for a given task
 */
export async function findRelevantPathsAction(
  projectDirectory: string, 
  taskDescription: string
): Promise<ActionState<{ paths: string[] }>> {
  try {
    if (!projectDirectory) {
      return { isSuccess: false, message: "Project directory is required" };
    }
    
    if (!taskDescription || taskDescription.trim().length < 10) {
      return { isSuccess: false, message: "Please provide a detailed task description" };
    }
    
    console.log(`[PathFinder] Finding relevant paths for task: ${taskDescription}`);
    
    // Get project-specific model settings
    const modelSettings = await getModelSettingsForProject(projectDirectory);
    const pathfinderSettings = modelSettings?.pathfinder || {
      model: GEMINI_FLASH_MODEL,
      maxTokens: FLASH_MAX_OUTPUT_TOKENS,
      temperature: 0.6
    };
    
    // Get all non-ignored files in the project
    const allFiles = await getAllNonIgnoredFiles(projectDirectory);
    if (!allFiles || allFiles.files.length === 0) {
      return { isSuccess: false, message: "No files found in project directory" };
    }
    
    console.log(`[PathFinder] Found ${allFiles.files.length} files in project`);
    
    // Generate directory tree for context
    const dirTree = await generateDirectoryTree(projectDirectory);
    
    // Create a system prompt that instructs the model
    const systemPrompt = `You are a code path finder that helps identify the most relevant files for a given programming task.
Given a project structure and a task description, analyze which files would be most important to understand or modify for the task.
Return ONLY file paths and no other commentary, with one file path per line.
Unless the task specifically mentions tests, favor implementation files over test files.

When analyzing relevance, ensure you include:
1. Direct dependencies and imported modules used by core files
2. Parent files that call or include the main components
3. Documentation files (.md, .mdc) that explain relevant features
4. Configuration files that affect the behavior of relevant components
5. Higher-level components that help understand the architecture

ONLY list file paths that actually exist in this project.
Do not hallucinate or make up file paths.
List one file path per line and focus on files needed to FULLY understand the dataflow and context.`;
    
    // Create a prompt with project structure and task description
    const prompt = `Project Structure:
${dirTree}

Task Description:
${taskDescription}

Please list the most relevant file paths for this task, one per line:`;
    
    // Estimate tokens to ensure we're within limits
    const promptTokens = await estimateTokens(prompt);
    const systemPromptTokens = await estimateTokens(systemPrompt);
    const estimatedTokens = promptTokens + systemPromptTokens;
    if (estimatedTokens > MAX_INPUT_TOKENS - TOKEN_BUFFER) {
      return { 
        isSuccess: false, 
        message: `The project is too large to analyze at once (${estimatedTokens} estimated tokens). Please try a more specific task description or focus on a subdirectory.` 
      };
    }
    
    // Call Gemini Flash through our client
    const result = await geminiClient.sendRequest(prompt, {
      model: pathfinderSettings.model,
      systemPrompt,
      temperature: pathfinderSettings.temperature,
      maxOutputTokens: pathfinderSettings.maxTokens,
      requestType: RequestType.CODE_ANALYSIS,
      projectDirectory,
      taskType: 'pathfinder'
    });
    
    if (!result.isSuccess || !result.data) {
      return { isSuccess: false, message: result.message || "Failed to find paths" };
    }
    
    // Process the response to get clean paths
    const paths = result.data
      .split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 0)
      .filter(line => !line.includes('node_modules/'))
      .map(line => {
        // Clean up paths - remove numbers or bullets at the start
        return line.replace(/^[\d\.\s-]+/, '').trim();
      });
    
    // Validate the paths exist in the project using our helper function
    const validatedPaths = [];
    
    // Since allFiles doesn't have content, we'll use an empty record
    // and let validateFilePath use the filesystem fallback
    const fileContents: Record<string, string> = {};
    
    // Validate the paths using our helper function
    for (const filePath of paths) {
      if (await validateFilePath(filePath, fileContents, projectDirectory)) {
        validatedPaths.push(filePath);
      }
    }
    
    console.log(`[PathFinder] Found ${validatedPaths.length} relevant files`);
    
    return {
      isSuccess: true,
      message: `Found ${validatedPaths.length} relevant paths`,
      data: { paths: validatedPaths }
    };
  } catch (error) {
    console.error('[PathFinder] Error finding relevant paths:', error);
    return { 
      isSuccess: false, 
      message: error instanceof Error ? error.message : "Failed to find relevant paths" 
    };
  }
}

/**
 * Enhanced version of findRelevantPathsAction that also provides task context
 * @param projectDirectory The root directory of the project
 * @param taskDescription The user's task description
 * @param specificFilePaths Optional array of file paths to limit analysis to
 */
export async function findRelevantFilesAction(
  projectDirectory: string,
  taskDescription: string,
  sessionId: string,
  options?: { modelOverride?: string }
): Promise<ActionState<{ relevantPaths: string[], enhancedTaskDescription: string }>> {
  try {
    // First step: Find relevant paths
    const pathFinderResult = await findAndValidateRelevantPaths(
      projectDirectory,
      taskDescription,
      options
    );

    if (!pathFinderResult.isSuccess || !pathFinderResult.data) {
      return { 
        isSuccess: false, 
        message: pathFinderResult.message || "Failed to find relevant paths" 
      };
    }

    // Second step: Generate guidance using the validated paths
    const guidanceResult = await generateGuidanceForPaths(
      projectDirectory,
      taskDescription,
      pathFinderResult.data.paths
    );

    if (!guidanceResult.isSuccess || !guidanceResult.data) {
      return {
        isSuccess: true, // Still consider it a success even if guidance fails
        message: `Found ${pathFinderResult.data.paths.length} relevant paths, but ${guidanceResult.message}`,
        data: {
          relevantPaths: pathFinderResult.data.paths,
          enhancedTaskDescription: ""
        }
      };
    }

    return {
      isSuccess: true,
      message: `Found ${pathFinderResult.data.paths.length} relevant file paths with task guidance.`,
      data: {
        relevantPaths: pathFinderResult.data.paths,
        enhancedTaskDescription: guidanceResult.data.guidance
      }
    };
  } catch (error) {
    console.error('Error in findRelevantFilesAction:', error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    return { isSuccess: false, message: `Error finding relevant files: ${errorMessage}` };
  }
}

/**
 * Step 1: Find and validate the most relevant paths for a given task
 */
async function findAndValidateRelevantPaths(
  projectDirectory: string,
  taskDescription: string,
  options?: { modelOverride?: string }
): Promise<ActionState<{ paths: string[] }>> {
  try {
    if (!projectDirectory) {
      return { isSuccess: false, message: "Project directory is required" };
    }
    
    if (!taskDescription || taskDescription.trim().length < 10) {
      return { isSuccess: false, message: "Please provide a detailed task description" };
    }
    
    // Get project-specific model settings
    const modelSettings = await getModelSettingsForProject(projectDirectory);
    const pathfinderSettings = modelSettings?.pathfinder || {
      model: GEMINI_FLASH_MODEL,
      maxTokens: FLASH_MAX_OUTPUT_TOKENS,
      temperature: 0.6
    };
    
    // Use model override if specified
    const modelToUse = options?.modelOverride || pathfinderSettings.model;
    
    console.log(`[PathFinder] Finding relevant paths for task: ${taskDescription}`);
    
    // NEW APPROACH: Use readDirectoryAction instead of directly calling getAllNonIgnoredFiles
    // This provides better error handling and fallback mechanisms
    const { readDirectoryAction } = await import('@/actions/read-directory-actions');
    const directoryResult = await readDirectoryAction(projectDirectory);
    
    if (!directoryResult.isSuccess || !directoryResult.data) {
      return { isSuccess: false, message: directoryResult.message || "Failed to read project directory" };
    }
    
    // Extract the file paths from the directory result
    const fileContents = directoryResult.data;
    const allFilesPaths = Object.keys(fileContents);
    
    if (!allFilesPaths || allFilesPaths.length === 0) {
      return { isSuccess: false, message: "No files found in project directory" };
    }
    
    console.log(`[PathFinder] Found ${allFilesPaths.length} files in project`);
    
    // Generate directory tree for context
    const dirTree = await generateDirectoryTree(projectDirectory);
    
    // Create a system prompt that instructs the model
    const systemPrompt = `You are a code path finder that helps identify the most relevant files for a given programming task.
Given a project structure and a task description, analyze which files would be most important to understand or modify for the task.
Return ONLY file paths and no other commentary, with one file path per line.
Unless the task specifically mentions tests, favor implementation files over test files.

When analyzing relevance, ensure you include:
1. Direct dependencies and imported modules used by core files
2. Parent files that call or include the main components
3. Documentation files (.md, .mdc) that explain relevant features
4. Configuration files that affect the behavior of relevant components
5. Higher-level components that help understand the architecture

ONLY list file paths that actually exist in this project.
Do not hallucinate or make up file paths.
List one file path per line and focus on files needed to FULLY understand the dataflow and context.`;
    
    // Create a prompt with project structure and task description
    const prompt = `Project Structure:
${dirTree}

Task Description:
${taskDescription}

Please list the most relevant file paths for this task, one per line:`;
    
    // Estimate tokens to ensure we're within limits
    const promptTokens = await estimateTokens(prompt);
    const systemPromptTokens = await estimateTokens(systemPrompt);
    const estimatedTokens = promptTokens + systemPromptTokens;
    if (estimatedTokens > MAX_INPUT_TOKENS - TOKEN_BUFFER) {
      return { 
        isSuccess: false, 
        message: `The project is too large to analyze at once (${estimatedTokens} estimated tokens). Please try a more specific task description or focus on a subdirectory.` 
      };
    }
    
    // Call Gemini Flash through our client
    const result = await geminiClient.sendRequest(prompt, {
      model: modelToUse,
      systemPrompt,
      temperature: pathfinderSettings.temperature,
      maxOutputTokens: pathfinderSettings.maxTokens,
      requestType: RequestType.CODE_ANALYSIS,
      projectDirectory,
      taskType: 'pathfinder'
    });
    
    if (!result.isSuccess || !result.data) {
      return { isSuccess: false, message: result.message || "Failed to find paths" };
    }
    
    // Process the response to get clean paths
    const paths = result.data
      .split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 0)
      .filter(line => !line.includes('node_modules/'))
      .map(line => {
        // Clean up paths - remove numbers or bullets at the start
        return line.replace(/^[\d\.\s-]+/, '').trim();
      });
    
    // Validate the paths exist in the project
    const validatedPaths = [];
    for (const filePath of paths) {
      if (await validateFilePath(filePath, fileContents, projectDirectory)) {
        validatedPaths.push(filePath);
      }
    }
    
    console.log(`[PathFinder] Found ${validatedPaths.length} relevant files`);
    
    return {
      isSuccess: true,
      message: `Found ${validatedPaths.length} relevant paths`,
      data: { paths: validatedPaths }
    };
  } catch (error) {
    console.error('[PathFinder] Error finding relevant paths:', error);
    return { 
      isSuccess: false, 
      message: error instanceof Error ? error.message : "Failed to find relevant paths" 
    };
  }
}

/**
 * Step 2: Generate guidance for specific paths that were found in step 1
 */
async function generateGuidanceForPaths(
  projectDirectory: string,
  taskDescription: string,
  relevantPaths: string[]
): Promise<ActionState<{ guidance: string }>> {
  try {
    if (!projectDirectory) {
      return { isSuccess: false, message: "Project directory is required" };
    }
    
    if (!relevantPaths || relevantPaths.length === 0) {
      return { isSuccess: false, message: "No relevant paths provided" };
    }
    
    // Get project-specific model settings
    const modelSettings = await getModelSettingsForProject(projectDirectory);
    const guidanceSettings = modelSettings?.guidance_generation || {
      model: GEMINI_PRO_PREVIEW_MODEL,
      maxTokens: 16384,
      temperature: 0.7
    };
    
    console.log(`[PathFinder] Generating guidance for ${relevantPaths.length} paths`);
    
    // Limit to a reasonable number of paths to avoid context overflow
    const limitedPaths = relevantPaths.slice(0, 15);
    
    // We'll build up file contents to include in our prompt
    const fileInfos: { path: string; content: string | null }[] = [];
    
    // Get contents of each relevant file
    for (const filePath of limitedPaths) {
      try {
        const fullPath = path.join(projectDirectory, filePath);
        const content = await fs.readFile(fullPath, 'utf8');
        
        // Skip binary files and very large files
        if (content.length > 50000) {
          fileInfos.push({ path: filePath, content: `[File too large: ${Math.round(content.length / 1024)}KB]` });
        } else {
          // Fix the async handling here
          const isBin = await isBinaryFile(Buffer.from(content));
          if (isBin) {
            fileInfos.push({ path: filePath, content: `[Binary file: ${path.extname(filePath)}]` });
          } else {
            fileInfos.push({ path: filePath, content });
          }
        }
      } catch (error) {
        console.warn(`[PathFinder] Could not read file: ${filePath}`, error);
        fileInfos.push({ path: filePath, content: null });
      }
    }
    
    // Build up the system prompt
    const systemPrompt = `You are an expert coding assistant that helps developers understand code and improve their tasks.
Given a task description and relevant files from a project, analyze the code to provide clear, practical guidance.

Your response MUST include:
1. A concise summary of what these files do and how they work together
2. Focused analysis of the code patterns, architecture, and data flow
3. Specific advice for implementing the described task
4. Details about any gotchas, edge cases, or important considerations

Format your response in markdown. Include relevant code snippets or examples when they help illustrate a point.
Be concise but comprehensive. Focus on helping the developer implement their task efficiently with a solid understanding of the codebase.`;
    
    // Build the prompt with task description and file contents
    let prompt = `Task Description: ${taskDescription}\n\n`;
    prompt += `Here are the most relevant files for this task:\n\n`;
    
    for (const fileInfo of fileInfos) {
      if (fileInfo.content === null) {
        prompt += `File: ${fileInfo.path}\n[Could not read file]\n\n`;
      } else if (fileInfo.content.startsWith('[')) {
        prompt += `File: ${fileInfo.path}\n${fileInfo.content}\n\n`;
      } else {
        prompt += `File: ${fileInfo.path}\n\`\`\`\n${fileInfo.content}\n\`\`\`\n\n`;
      }
    }
    
    prompt += `Based on these files and the task description, please provide guidance for implementing the task efficiently.`;
    
    // Estimate tokens to ensure we're within limits
    const promptTokens = await estimateTokens(prompt);
    const systemPromptTokens = await estimateTokens(systemPrompt);
    const estimatedTokens = promptTokens + systemPromptTokens;
    const tokenLimit = 1000000; // 1M token limit for context window
    
    if (estimatedTokens > tokenLimit) {
      // If we're over the token limit, truncate the files
      console.warn(`[PathFinder] Prompt too large (${estimatedTokens} tokens), truncating files`);
      return {
        isSuccess: false,
        message: `The combined file contents exceed the token limit. Try selecting fewer files or focusing on smaller files.`
      };
    }
    
    // Call Gemini Pro through our client
    const result = await geminiClient.sendRequest(prompt, {
      model: guidanceSettings.model,
      systemPrompt,
      temperature: guidanceSettings.temperature,
      maxOutputTokens: guidanceSettings.maxTokens,
      requestType: RequestType.CODE_ANALYSIS,
      projectDirectory,
      taskType: 'guidance_generation'
    });
    
    if (!result.isSuccess || !result.data) {
      return { isSuccess: false, message: result.message || "Failed to generate guidance" };
    }
    
    // Extract guidance content from the response
    const guidance = extractGuidanceContent(result.data);
    
    if (guidance) {
      return {
        isSuccess: true,
        message: `Generated guidance successfully`,
        data: { guidance }
      };
    } else {
      return {
        isSuccess: false,
        message: "No guidance content found in the response"
      };
    }
  } catch (error) {
    console.error('Error in generateGuidanceForPaths:', error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    return { isSuccess: false, message: `Error generating guidance: ${errorMessage}` };
  }
}

/**
 * Extract file paths from <file> tags format
 */
function extractFilePathsFromTags(responseText: string): string[] {
  // Collect all paths from different formats
  const allPaths: string[] = [];
  
  // This pattern looks for <file>path/to/file.ext</file> format
  const fileTagPattern = /<file>(.*?)<\/file>/g;
  const matches = [...responseText.matchAll(fileTagPattern)];
  
  if (matches && matches.length > 0) {
    const taggedPaths = matches
      .map(match => match[1].trim())
      .filter(path => path && path.length > 0);
    
    allPaths.push(...taggedPaths);
  }
  
  // Also check for possible path list without tags
  const potentialPaths = responseText
    .split('\n')
    .map(line => line.trim())
    .filter(line => line.startsWith('<file>') && line.endsWith('</file>'))
    .map(line => line.replace(/<file>|<\/file>/g, '').trim());
  
  if (potentialPaths.length > 0) {
    allPaths.push(...potentialPaths);
  }
  
  // Return unique paths
  return [...new Set(allPaths)];
}

/**
 * Extract potential file paths from any part of the response
 */
function extractPotentialFilePaths(responseText: string): string[] {
  // This pattern looks for common file patterns in the response
  const filePatterns = [
    // Look for file paths with extensions
    /\b[\w-]+\/[\w\/-]+\.(ts|js|tsx|jsx|md|mdc|swift|rs|py|json|yaml|yml)\b/g,
    // Look for paths that might be mentioned
    /\b(server|apple|lib|actions|components|app)\/[\w\/-]+\b/g,
    // Look for <file> tag format 
    /<file>(.*?)<\/file>/g
  ];
  
  const allPaths = new Set<string>();
  
  // Try all patterns
  for (const pattern of filePatterns) {
    const matches = responseText.match(pattern);
    if (matches) {
      matches.forEach(match => {
        // If it's a <file> tag, extract the contents
        if (match.startsWith('<file>') && match.endsWith('</file>')) {
          const path = match.replace(/<file>|<\/file>/g, '').trim();
          if (path) allPaths.add(path);
        } else {
          allPaths.add(match);
        }
      });
    }
  }
  
  // Also try to extract paths from markdown-style code blocks
  const codeBlocks = responseText.match(/```[\s\S]*?```/g);
  if (codeBlocks) {
    for (const block of codeBlocks) {
      // Look for file paths inside code blocks
      for (const pattern of filePatterns) {
        const matches = block.match(pattern);
        if (matches) {
          matches.forEach(match => {
            // If it's a <file> tag, extract the contents
            if (match.startsWith('<file>') && match.endsWith('</file>')) {
              const path = match.replace(/<file>|<\/file>/g, '').trim();
              if (path) allPaths.add(path);
            } else {
              allPaths.add(match);
            }
          });
        }
      }
    }
  }
  
  return Array.from(allPaths);
}

/**
 * Extract guidance content from the general response if no guidance section is found
 */
function extractGuidanceContent(responseText: string): string | null {
  // If we have code blocks or diff blocks, remove them
  const cleanedText = responseText
    .replace(/```[\s\S]*?```/g, '')
    .replace(/\+\+\+[\s\S]*?---/g, '');
  
  // Look for paragraphs of text that might contain guidance
  const paragraphs = cleanedText
    .split('\n\n')
    .map(p => p.trim())
    .filter(p => p.length > 100 && !p.includes('<'));
  
  if (paragraphs.length > 0) {
    // Return the longest paragraph as it's most likely to be substantive guidance
    return paragraphs.sort((a, b) => b.length - a.length)[0];
  }
  
  return null;
}
