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

// Flash model limits
const MAX_INPUT_TOKENS = 1000000; // 1M tokens input limit
const FLASH_MAX_OUTPUT_TOKENS = 16384;
const TOKEN_BUFFER = 20000; // Buffer for XML tags and other overhead

interface PathFinderRequestPayload {
  taskDescription: string;
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
      model: GEMINI_FLASH_MODEL,
      systemPrompt,
      temperature: 0.6, // Lower temperature for more deterministic results
      maxOutputTokens: FLASH_MAX_OUTPUT_TOKENS,
      requestType: RequestType.CODE_ANALYSIS
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
      try {
        const fullPath = path.join(projectDirectory, filePath);
        const stats = await fs.stat(fullPath);
        if (stats.isFile()) {
          // Skip binary files
          const ext = path.extname(filePath).toLowerCase();
          if (BINARY_EXTENSIONS.has(ext)) continue;
          
          try {
            const content = await fs.readFile(fullPath);
            const isBinary = await isBinaryFile(content);
            if (!isBinary) {
              validatedPaths.push(filePath);
            }
          } catch (error) {
            // Skip files we can't read
            console.warn(`[PathFinder] Could not read file: ${filePath}`, error);
          }
        }
      } catch (error) {
        // Skip files that don't exist
        console.warn(`[PathFinder] File doesn't exist: ${filePath}`);
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
  specificFilePaths?: string[]
): Promise<ActionState<{ relevantPaths: string[], enhancedTaskDescription: string }>> {
  try {
    // First step: Find relevant paths
    const pathFinderResult = await findAndValidateRelevantPaths(
      projectDirectory,
      taskDescription,
      specificFilePaths
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
  specificFilePaths?: string[]
): Promise<ActionState<{ paths: string[] }>> {
  // Validate inputs
  if (!taskDescription || !taskDescription.trim()) {
    return { isSuccess: false, message: "Task description cannot be empty." };
  }

  if (!projectDirectory || !projectDirectory.trim()) {
    return { isSuccess: false, message: "Project directory cannot be empty." };
  }

  try {
    // Get files to analyze
    let allFilePaths: string[];
    if (specificFilePaths && specificFilePaths.length > 0) {
      // If specific files are provided, use those
      allFilePaths = specificFilePaths;
      console.log(`Using ${allFilePaths.length} provided specific files for analysis`);
    } else {
      // Otherwise get all non-ignored files
      const result = await getAllNonIgnoredFiles(projectDirectory);
      allFilePaths = result.files;
      console.log(`Found ${allFilePaths.length} files in the project directory.`);
    }
    
    if (!allFilePaths || allFilePaths.length === 0) {
      return { isSuccess: false, message: "No files to analyze." };
    }
    
    // Generate directory tree for context
    const dirTree = await generateDirectoryTree(projectDirectory);
    
    // Create a system prompt that instructs the model to find paths
    const systemPrompt = `You are a code path finder that helps identify the most relevant files for a given programming task.
Given a project structure and a task description, analyze which files would be most important to understand or modify for the task.
Return ONLY file paths and no other commentary, with one file path per line.
Ignore node_modules, build directories, and binary files unless they are directly relevant to the task.
Unless the task specifically mentions tests, favor implementation files over test files.

When analyzing relevance, ensure you include:
1. Direct dependencies and imported modules used by core files
2. Parent files that call or include the main components
3. Documentation files (.md, .mdx) that explain relevant features
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
      model: GEMINI_FLASH_MODEL,
      systemPrompt,
      temperature: 0.5, // Lower temperature for more deterministic results
      maxOutputTokens: FLASH_MAX_OUTPUT_TOKENS,
      requestType: RequestType.CODE_ANALYSIS
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
      try {
        const fullPath = path.join(projectDirectory, filePath);
        const stats = await fs.stat(fullPath);
        if (stats.isFile()) {
          // Skip binary files
          const ext = path.extname(filePath).toLowerCase();
          if (BINARY_EXTENSIONS.has(ext)) continue;
          
          try {
            const content = await fs.readFile(fullPath);
            const isBinary = await isBinaryFile(content);
            if (!isBinary) {
              validatedPaths.push(filePath);
            }
          } catch (error) {
            // Skip files we can't read
            console.warn(`[PathFinder] Could not read file: ${filePath}`, error);
          }
        }
      } catch (error) {
        // Skip files that don't exist
        console.warn(`[PathFinder] File doesn't exist: ${filePath}`);
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
  if (!relevantPaths || relevantPaths.length === 0) {
    return { isSuccess: false, message: "No relevant paths provided for guidance generation." };
  }

  try {
    console.log(`Generating guidance for ${relevantPaths.length} relevant paths`);

    // Read content of all relevant files
    const fileInfos: { path: string, content: string, tokens: number }[] = [];
    const MAX_FILE_SIZE = 100 * 1024; // 100KB max per file to prevent token overflow
    let totalFiles = 0;
    let totalSkippedBinaryFiles = 0;
    let totalSkippedLargeFiles = 0;
    let totalErrorFiles = 0;
    
    // Calculate token count for task description
    const taskDescriptionTokens = await estimateTokens(taskDescription);
    console.log(`Task description token count: ${taskDescriptionTokens}`);
    
    // Process all files and gather token counts
    for (const filePath of relevantPaths) {
      // Skip binary files by extension
      const ext = path.extname(filePath).toLowerCase();
      if (BINARY_EXTENSIONS.has(ext)) {
        totalSkippedBinaryFiles++;
        continue;
      }
      
      try {
        const fullPath = path.join(projectDirectory, filePath);
        const stats = await fs.stat(fullPath);
        
        // Skip files that are too large
        if (stats.size > MAX_FILE_SIZE) {
          console.log(`Skipping large file: ${filePath} (${stats.size} bytes)`);
          totalSkippedLargeFiles++;
          continue;
        }
        
        const buffer = await fs.readFile(fullPath);
        
        // Skip binary files based on content analysis
        if (await isBinaryFile(buffer)) {
          console.log(`Skipping detected binary file: ${filePath}`);
          totalSkippedBinaryFiles++;
          continue;
        }
        
        // Add the file content
        const content = buffer.toString('utf8');
        const tokens = await estimateTokens(content);
        
        fileInfos.push({
          path: filePath,
          content,
          tokens
        });
        
        totalFiles++;
      } catch (err) {
        console.log(`Error reading file ${filePath}:`, err);
        totalErrorFiles++;
        // Continue with other files if one fails
      }
    }
    
    console.log(`Processed ${totalFiles} files. Binary: ${totalSkippedBinaryFiles}, Too Large: ${totalSkippedLargeFiles}, Errors: ${totalErrorFiles}`);
    console.log(`Total files collected: ${fileInfos.length}`);
    
    // Sort files by number of tokens (smallest first) - helps with bin packing
    fileInfos.sort((a, b) => a.tokens - b.tokens);
    
    // Create batches of files that fit within token limits
    const batches: Array<{ files: Array<{ path: string, content: string }>, tokenCount: number }> = [];
    let currentBatch: { files: Array<{ path: string, content: string }>, tokenCount: number } = { files: [], tokenCount: 0 };
    
    // Starting token overhead: system prompt + task description + extra formatting overhead
    const SYSTEM_PROMPT_TOKENS = 600; // Approximate tokens for system prompt
    let currentBatchTokens = SYSTEM_PROMPT_TOKENS + taskDescriptionTokens;
    const MAX_BATCH_TOKENS = MAX_INPUT_TOKENS - 10000; // Allow buffer for JSON overhead
    
    for (const fileInfo of fileInfos) {
      // If this file would push the batch over limit, finalize the current batch and start a new one
      if (currentBatchTokens + fileInfo.tokens > MAX_BATCH_TOKENS) {
        if (currentBatch.files.length > 0) {
          batches.push(currentBatch);
          
          // Start a new batch with the task description as overhead
          currentBatchTokens = SYSTEM_PROMPT_TOKENS + taskDescriptionTokens;
          currentBatch = { files: [], tokenCount: currentBatchTokens };
        }
      }
      
      // Add file to current batch
      currentBatch.files.push({
        path: fileInfo.path,
        content: fileInfo.content
      });
      
      currentBatchTokens += fileInfo.tokens;
      currentBatch.tokenCount = currentBatchTokens;
    }
    
    // Add the last batch if it has files
    if (currentBatch.files.length > 0) {
      batches.push(currentBatch);
    }
    
    console.log(`Split into ${batches.length} batches for guidance generation`);

    // System prompt template for guidance analysis
    const systemPrompt = `You are a senior principal architect and expert software engineer tasked with providing exceptional, production-quality implementation guidance.
Given code files and a task description, you must provide concrete, executable instructions that enable a developer to implement the solution with minimal uncertainty.

Your guidance MUST include:
1. CONCRETE technical specifications with explicit API signatures, type definitions, and return values
2. EXECUTABLE step-by-step implementation instructions with specific file paths and line numbers where possible
3. ACTUAL CODE SNIPPETS showing critical implementation details (not pseudocode)
4. EXACT imports and dependencies needed with version numbers
5. CRITICAL edge cases with explicit handling code
6. SPECIFIC performance considerations with measurable targets

Follow this structured format in your response:
<guidance>
## Task Analysis
[PRECISE understanding of the task requirements and identified technical challenges]

## Core Implementation Plan
[NUMBERED step-by-step plan with EXPLICIT file locations, code snippets, and imports]

## Technical Specifications
[CONCRETE API specs, type definitions, data models, validation rules, and expected behavior]

## Code Samples
[ACTUAL functioning code snippets that demonstrate key implementation points, with comments explaining the important logic]

## Integration Points
[SPECIFIC files and functions that need to be modified to integrate this solution, with exact import statements]

## Error Handling & Edge Cases
[COMPLETE error handling code and edge case solutions with explicit catch blocks]

## Testing Strategy
[EXACT test scenarios with expected inputs and outputs, including both happy and error paths]

## Context-Specific Considerations
[SPECIFIC architectural patterns used in THIS codebase, and how the solution aligns with the existing patterns]

Only reference files you've been provided in the input. Do not hallucinate file paths.
</guidance>

Your guidance should be extremely precise, leaving no room for ambiguity. Focus on production-ready implementation details that will ensure successful execution on the first attempt, with proper error handling, performance considerations, and architecture alignment. Analyze existing patterns in the codebase and ensure your solution is compatible with them. Provide specific code examples for all complex or critical sections, and make sure your solution can be directly implemented without requiring additional clarification.`;

    // Process each batch and collect results
    let enhancedTaskDescription = '';
    let batchIndex = 0;
    for (const batch of batches) {
      batchIndex++;
      console.log(`Processing guidance batch ${batchIndex}/${batches.length} with ${batch.files.length} files and ${batch.tokenCount} tokens`);
      
      let fullPrompt = `Task Description: ${taskDescription}\n\n`;
      
      // Add clear instructions directly in the user prompt
      fullPrompt += `CRITICAL INSTRUCTIONS:
1. ONLY include file paths from the list below - do not reference any files not shown here
2. Analyze the provided files to generate guidance for completing the task
3. Format your response as requested below

Files to analyze:\n`;
      
      // Create a list of file paths for reference
      fullPrompt += "\nAvailable files:\n";
      const availableFiles = batch.files.map(file => file.path);
      for (const filePath of availableFiles) {
        fullPrompt += `- ${filePath}\n`;
      }
      
      // Now include full file contents
      fullPrompt += "\nFile contents:\n";
      for (const file of batch.files) {
        fullPrompt += `\nFile: ${file.path}\n${'='.repeat(file.path.length + 6)}\n${file.content}\n\n`;
      }
      
      fullPrompt += "\nRESPONSE FORMAT: Provide guidance for this task using the following format:\n";
      fullPrompt += "<guidance>\n[Your analysis explaining how these files relate to the task and providing insights for implementation]\n</guidance>";
      
      try {
        // Call Gemini API with CODE_ANALYSIS request type
        const result = await geminiClient.sendRequest(fullPrompt, {
          model: GEMINI_PRO_PREVIEW_MODEL,
          temperature: 0.9, // Higher temperature for more creative responses
          maxOutputTokens: 8000,
          requestType: RequestType.CODE_ANALYSIS
        });
        
        if (result.isSuccess && result.data) {
          // Try to extract guidance content
          const guidance = extractGuidanceContent(result.data);
          if (guidance) {
            // Add batch number if we have multiple batches
            if (batches.length > 1) {
              enhancedTaskDescription += `\n\n== Analysis Batch ${batchIndex} ==\n${guidance}`;
            } else {
              enhancedTaskDescription += guidance;
            }
          } else {
            console.log(`No guidance content found in batch ${batchIndex} response`);
            
            // Try to extract as much useful content as possible
            const lines = result.data.split('\n').filter(line => 
              !line.includes('<relevant_files>') && 
              !line.includes('</relevant_files>') && 
              line.trim().length > 0 &&
              !line.match(/^file_path_\d+$/) // Filter out placeholder lines
            );
            
            if (lines.length > 0) {
              if (batches.length > 1) {
                enhancedTaskDescription += `\n\n== Analysis Batch ${batchIndex} ==\n${lines.join('\n')}`;
              } else {
                enhancedTaskDescription += lines.join('\n');
              }
            }
          }
        } else {
          console.error(`Error processing guidance batch ${batchIndex}:`, result.message);
        }
      } catch (error) {
        console.error(`Error calling Gemini API for guidance batch ${batchIndex}:`, error);
      }
    }
    
    if (enhancedTaskDescription.length === 0) {
      return { isSuccess: false, message: "No guidance could be generated." };
    }
    
    console.log(`Generated ${enhancedTaskDescription.length} characters of guidance`);
    
    return {
      isSuccess: true,
      message: `Generated guidance successfully`,
      data: { guidance: enhancedTaskDescription }
    };
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
