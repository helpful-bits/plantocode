"use server";

import { ActionState } from '@/types';
import { generateDirectoryTree } from '@/lib/directory-tree';
import { promises as fs } from 'fs';
import path from 'path'; // Keep path import
import { getAllNonIgnoredFiles } from '@/lib/git-utils';
import { isBinaryFile, BINARY_EXTENSIONS } from '@/lib/file-utils';
import { estimateTokens } from '@/lib/token-estimator';
import { GEMINI_FLASH_MODEL } from '@/lib/constants';
import geminiClient from '@/lib/api/gemini-client';
import { RequestType } from '@/lib/api/streaming-request-pool';

// Flash 2.0 model limits
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
    if (!allFiles || allFiles.length === 0) {
      return { isSuccess: false, message: "No files found in project directory" };
    }
    
    console.log(`[PathFinder] Found ${allFiles.length} files in project`);
    
    // Generate directory tree for context
    const dirTree = await generateDirectoryTree(projectDirectory);
    
    // Create a system prompt that instructs the model
    const systemPrompt = `You are a code path finder that helps identify the most relevant files for a given programming task.
Given a project structure and a task description, analyze which files would be most important to understand or modify for the task.
Return ONLY file paths and no other commentary, with one file path per line.
Ignore node_modules, build directories, and binary files unless they are directly relevant to the task.
Unless the task specifically mentions tests, favor implementation files over test files.`;
    
    // Create a prompt with project structure and task description
    const prompt = `Project Structure:
${dirTree}

Task Description:
${taskDescription}

Please list the most relevant file paths for this task, one per line:`;
    
    // Estimate tokens to ensure we're within limits
    const estimatedTokens = estimateTokens(prompt) + estimateTokens(systemPrompt);
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
      maxOutputTokens: FLASH_MAX_OUTPUT_TOKENS
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
 * @param selectedFilesToAnalyze Optional array of file paths to limit analysis to
 */
export async function findRelevantFilesAction(
  projectDirectory: string,
  taskDescription: string,
  specificFilePaths?: string[]
): Promise<ActionState<{ relevantPaths: string[], enhancedTaskDescription: string }>> {
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
    
    // Read file contents, skipping binary files
    const fileInfos: { path: string, content: string, tokens: number }[] = [];
    const MAX_FILE_SIZE = 100 * 1024; // 100KB max per file to prevent token overflow
    let totalFiles = 0;
    let totalSkippedBinaryFiles = 0;
    let totalSkippedLargeFiles = 0;
    let totalErrorFiles = 0;
    
    if (!fileInfos) { // Initialize fileInfos if it's null or undefined
      // fileInfos = []; // Uncomment if initialization is needed
      // console.log("Initialized fileInfos array."); // Debugging log
    }
    
    // Calculate token count for task description
    const taskDescriptionTokens = await estimateTokens(taskDescription);
    console.log(`Task description token count: ${taskDescriptionTokens}`);
    
    // Process all files and gather token counts
    for (const filePath of allFilePaths) {
      // Skip binary files by extension
      const ext = path.extname(filePath).toLowerCase();
      if (BINARY_EXTENSIONS.has(ext)) {
        totalSkippedBinaryFiles++;
        continue;
      }
      
      // Log any markdown files found
      if (ext === '.md' || ext === '.mdc') {
        console.log(`Found markdown file: ${filePath}`);
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
    
    console.log(`Split into ${batches.length} batches for analysis`);
    
    // Process each batch in parallel with API calls to identify relevant files
    const allRelevantPaths = new Set<string>();
    let enhancedTaskDescription = '';
    
    // System prompt template for relevance analysis
    const systemPrompt = `You are a skilled software engineering assistant that helps identify relevant code snippets and provide helpful context.
Given a codebase and task description, your goal is to:
1. Identify which files are relevant to the task
2. Provide helpful context that would assist the developer in completing this task
3. Clearly markup your file references with <file></file> tags

Follow this format in your response:
<relevant_files>
file_path_1
file_path_2
...
</relevant_files>

<guidance>
Your helpful context and explanation of how these files relate to the task.
Focus on architectural insights, patterns, and non-obvious relationships.
Only reference files you've seen. Do not hallucinate file paths.
</guidance>

Be thorough but concise. Focus on providing insights a developer might miss from a quick scan of the codebase.`;

    // Process each batch and collect results
    let batchIndex = 0;
    for (const batch of batches) {
      batchIndex++;
      console.log(`Processing batch ${batchIndex}/${batches.length} with ${batch.files.length} files and ${batch.tokenCount} tokens`);
      
      let fullPrompt = `Task Description: ${taskDescription}\n\nFiles to analyze:\n`;
      
      for (const file of batch.files) {
        fullPrompt += `\nFile: ${file.path}\n${'='.repeat(file.path.length + 6)}\n${file.content}\n\n`;
      }
      
      fullPrompt += "\nBased on the task and code provided, identify the most relevant files and provide guidance.";
      
      try {
        // Call Gemini API with CODE_ANALYSIS request type
        const result = await geminiClient.sendRequest(fullPrompt, {
          model: GEMINI_FLASH_MODEL,
          systemPrompt: systemPrompt,
          temperature: 0.7, // Lower temperature for more deterministic results
          maxOutputTokens: 8000,
          requestType: RequestType.CODE_ANALYSIS // Specify request type
        });
        
        if (result.isSuccess && result.data) {
          // Process the response to extract relevant paths
          processRelevantFilesContent(result.data, allRelevantPaths, batchIndex);
          
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
          console.error(`Error processing batch ${batchIndex}:`, result.message);
        }
      } catch (error) {
        console.error(`Error calling Gemini API for batch ${batchIndex}:`, error);
      }
    }
    
    // Convert set to array for the final result
    const relevantPaths = Array.from(allRelevantPaths);
    console.log(`Total unique relevant paths identified: ${relevantPaths.length}`);
    
    if (relevantPaths.length === 0) {
      return { isSuccess: false, message: "No relevant paths were identified." };
    }
    
    console.log(`Finished processing with ${relevantPaths.length} relevant files and ${enhancedTaskDescription.length} characters of guidance`);
    
    // Clean all relevant paths to ensure no XML tags remain
    const cleanRelevantPaths = relevantPaths.map(p => p.replace(/<file>|<\/file>/g, '').trim()); // Rename variable for clarity
    
    return {
      isSuccess: true,
      message: `Found ${cleanRelevantPaths.length} relevant file paths with task guidance.`,
      data: { 
        relevantPaths: cleanRelevantPaths,
        enhancedTaskDescription
      }
    };
  } catch (error) {
    console.error('Error in findRelevantFilesAction:', error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    return { isSuccess: false, message: `Error finding relevant files: ${errorMessage}` };
  }
}

/**
 * Process the content of the relevant_files section
 */
function processRelevantFilesContent(
  content: string, 
  allRelevantPaths: Set<string>, 
  batchIndex: number
): void {
  // Check if the response contains XML-formatted file paths
  if (content.includes('<file path=')) {
    console.log('Detected XML-formatted file paths in response');
    
    // Extract paths from XML format (<file path="actions/gemini-actions.ts"/>)
    const xmlPathMatches = [...content.matchAll(/<file\s+path=["']([^"']+)["']\s*\/?>/g)];
    const xmlPaths = xmlPathMatches.map(match => match[1].trim());
    
    console.log(`Extracted ${xmlPaths.length} paths from XML format`);
    
    // Add these paths to our overall set
    xmlPaths.forEach(path => {
      if (path) allRelevantPaths.add(path);
    });
  } else {
    // Original processing for plain text paths (one per line)
    let batchRelevantPaths = content
      .split('\n')
      .map((line: string) => line.trim())
      .filter((line: string) => line.length > 0)
      .map((line: string) => line.replace(/^[*-]\s+/, '')) // Remove bullet points if any
      .map((line: string) => line.split(/\s+#/)[0].trim()); // Remove any comments
    
    // Also check for and remove <file> tags if present in individual lines
    batchRelevantPaths = batchRelevantPaths.map((line: string) => {
      if (line.startsWith('<file>') && line.endsWith('</file>')) {
        return line.replace(/<file>|<\/file>/g, '').trim();
      }
      return line;
    });
    
    console.log(`Extracted ${batchRelevantPaths.length} relevant paths from batch ${batchIndex + 1}`);

    // Look for documentation files section
    const docSectionIdx = content.indexOf('# Documentation Files:');
    if (docSectionIdx !== -1) {
      console.log('Found Documentation Files section in response');
      // Extract documentation files section
      const docSection = content.substring(docSectionIdx).split('\n').slice(1);
      const docFiles = docSection
        .map(line => line.trim())
        .filter(line => line.length > 0 && !line.startsWith('#'))
        .map(line => {
          // Also check for and remove <file> tags in documentation files
          if (line.startsWith('<file>') && line.endsWith('</file>')) {
            return line.replace(/<file>|<\/file>/g, '').trim();
          }
          return line;
        });
      
      console.log(`Found ${docFiles.length} documentation files: ${docFiles.join(', ')}`);
      // Add documentation files to the relevant paths
      docFiles.forEach(path => {
        if (path && path.length > 0) allRelevantPaths.add(path);
      });
    }

    // Also check for <file> tags in the whole content
    const fileTagMatches = extractFilePathsFromTags(content);
    if (fileTagMatches.length > 0) {
      console.log(`Found ${fileTagMatches.length} paths in <file> tags`);
      fileTagMatches.forEach(path => {
        if (path) allRelevantPaths.add(path);
      });
    }

    // Log any markdown files that were found in the response
    const markdownFiles = batchRelevantPaths.filter(p => 
      p && !p.startsWith('#') && (p.endsWith('.md') || p.endsWith('.mdc')));
    if (markdownFiles.length > 0) {
      console.log(`Found ${markdownFiles.length} markdown files in response: ${markdownFiles.join(', ')}`);
    } else {
      console.log('No markdown files found in this batch response');
    }
    
    // Add these paths to our overall set
    batchRelevantPaths
      .filter(p => p && p.length > 0 && !p.startsWith('#'))
      .forEach(path => allRelevantPaths.add(path));
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
