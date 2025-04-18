"use server";

import { ActionState } from '@/types';
import { generateDirectoryTree } from '@/lib/directory-tree';
import { promises as fs } from 'fs';
import path from 'path';
import { getAllNonIgnoredFiles } from '@/lib/git-utils';
import { isBinaryFile, BINARY_EXTENSIONS } from '@/lib/file-utils';
import { estimateTokens } from '@/lib/token-estimator';
import { GEMINI_FLASH_MODEL } from '@/lib/constants';
import geminiClient from '@/lib/api/gemini-client';

// Flash 2.0 model limits
const MAX_INPUT_TOKENS = 1000000; // 1M tokens input limit
const MAX_OUTPUT_TOKENS = 16384;
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
      maxOutputTokens: MAX_OUTPUT_TOKENS
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
    const fileBatches: { path: string, content: string }[][] = [];
    let currentBatch: { path: string, content: string }[] = [];
    let currentBatchTokens = taskDescriptionTokens + TOKEN_BUFFER;
    
    for (const fileInfo of fileInfos) {
      // If adding this file would exceed the limit, start a new batch
      if (currentBatchTokens + fileInfo.tokens > MAX_INPUT_TOKENS) {
        if (currentBatch.length > 0) {
          console.log(`Completing batch with ${currentBatch.length} files, ${currentBatchTokens} tokens`);
          fileBatches.push(currentBatch);
          currentBatch = [];
          currentBatchTokens = taskDescriptionTokens + TOKEN_BUFFER;
        }
        
        // If a single file is too large for the limit, split it (future enhancement)
        // For now, we'll add it to its own batch and it might get truncated
        if (fileInfo.tokens > MAX_INPUT_TOKENS - taskDescriptionTokens - TOKEN_BUFFER) {
          console.log(`Warning: File ${fileInfo.path} has ${fileInfo.tokens} tokens which may be too large even alone.`);
          fileBatches.push([{ path: fileInfo.path, content: fileInfo.content }]);
          continue;
        }
      }
      
      // Add file to current batch
      currentBatch.push({ path: fileInfo.path, content: fileInfo.content });
      currentBatchTokens += fileInfo.tokens;
    }
    
    // Add the last batch if it has any files
    if (currentBatch.length > 0) {
      console.log(`Adding final batch with ${currentBatch.length} files, ${currentBatchTokens} tokens`);
      fileBatches.push(currentBatch);
    }
    
    console.log(`Split files into ${fileBatches.length} batches to fit token limits`);
    
    let allRelevantPaths: Set<string> = new Set();
    let combinedGuidance = "";
    
    // Process each batch with the AI model
    for (let batchIndex = 0; batchIndex < fileBatches.length; batchIndex++) {
      const batch = fileBatches[batchIndex];
      console.log(`Processing batch ${batchIndex + 1}/${fileBatches.length} with ${batch.length} files`);
      
      // Build a map of file contents for this batch
      const batchFileContents: Record<string, string> = {};
      batch.forEach(file => {
        batchFileContents[file.path] = file.content;
      });
      
      // Create batch-specific prompt
      const batchPrompt = `<?xml version="1.0" encoding="UTF-8"?>
<prompt>
  <role>
    You are an expert software engineer analyzing a codebase to provide guidance on a programming task.
    ${fileBatches.length > 1 ? `This is batch ${batchIndex + 1} of ${fileBatches.length} in the analysis.` : ''}
    
    IMPORTANT: You MUST respond using the XML format specified in <output_format>. 
    Your response MUST contain both <relevant_files> and <guidance> tags.
  </role>

  <task_description>
    ${taskDescription}
  </task_description>

  <relevant_file_contents>
    ${Object.entries(batchFileContents).map(([filePath, content]) => 
      `<file path="${filePath}">
${content}
</file>`).join('\n\n')}
  </relevant_file_contents>

  <requirements>
    1. Find the most relevant files for implementing this task.
    2. Provide general guidance on how to approach the task.
    ${fileBatches.length > 1 ? '3. Focus only on the files provided in this batch, but consider their role in the overall system.' : ''}
  </requirements>

  <output_format>
    <relevant_files>
      List only the file paths, one per line, in plain text format.   
      
      No explanations, bullets, or other formatting.
      Only include files that actually exist based on the file paths provided in the relevant_file_contents.
      IMPORTANT: Perform thorough analysis of the complete data flow related to the task.
      Include ALL relevant files that would need to be examined or modified for the task.
      Be comprehensive and include:
      - ALL files involved in the data flow, from start to finish
      - ALL components in the data pipeline
      - ALL parent components or files that these components extend or inherit from
      - ALL direct and indirect dependencies that might affect the implementation
      - Configuration files that might affect the components
      - Test files for the components if they exist
      - ALWAYS include ALL relevant documentation files (.md, .mdc)
      - Context files needed to understand the overall architecture
                  
      Example:
      actions/path-finder-actions.ts
      lib/gemini-api.ts
      docs/architecture.md
      docs/api-usage.md
      README.md
      .cursor/rules/GENERAL.mdc
      
    </relevant_files>

    <guidance>
      Generate a single concise paragraph that makes the user's task description more concrete by:
      - Clarifying the specific goal of the task in plain, direct language
      - Defining clear, measurable criteria for what success looks like
      - Identifying non-negotiable requirements and strict boundaries
      - Establishing what is in-scope and out-of-scope for this solution
      - Setting priority levels for different aspects of the task
      
      Focus only on making the task itself more concrete and well-defined from a business/user perspective, avoiding any technical implementation details. Write as if you are Dave Ramsey giving clear, detailed instructions to your team - straightforward, decisive, and leaving no room for ambiguity about what needs to be accomplished.
    </guidance>
  </output_format>
</prompt>`;

      console.log(`Batch ${batchIndex + 1} prompt size: ${batchPrompt.length} characters`);
      console.log(`Sending request to Gemini API for batch ${batchIndex + 1}...`);

      // First attempt: call the Gemini API for this batch
      let batchResult = await geminiClient.sendRequest(
        batchPrompt,
        { 
          model: GEMINI_FLASH_MODEL,
          maxOutputTokens: MAX_OUTPUT_TOKENS 
        }
      );

      // If first attempt fails to provide XML response, try with explicit system prompt
      if (batchResult.isSuccess && batchResult.data && 
          (!batchResult.data.includes('<relevant_files>') || !batchResult.data.includes('<guidance>'))) {
        
        console.log(`First attempt for batch ${batchIndex + 1} did not return proper XML format. Trying with explicit system prompt...`);
        
        // Second attempt with explicit system prompt
        batchResult = await geminiClient.sendRequest(
          batchPrompt,
          {
            model: GEMINI_FLASH_MODEL,
            systemPrompt: "You MUST respond with XML format that includes <relevant_files> and <guidance> tags. Follow the output format exactly. CRITICALLY IMPORTANT: Include ALL relevant Markdown (.md and .mdc) documentation files in your <relevant_files> list, as these provide essential context.",
            maxOutputTokens: MAX_OUTPUT_TOKENS
          }
        );
      }

      if (!batchResult.isSuccess || !batchResult.data) {
        console.error(`Error processing batch ${batchIndex + 1}:`, batchResult.message);
        continue; // Try the next batch instead of failing completely
      }

      const batchResponseText = batchResult.data;
      console.log(`Received response for batch ${batchIndex + 1}, length: ${batchResponseText.length} characters`);
      console.log(`Response preview: ${batchResponseText.substring(0, 200)}...`);
      
      // If we still got a git diff or invalid format, try to handle it gracefully
      if (batchResponseText.includes('```') && batchResponseText.includes('---') && 
          batchResponseText.includes('+++') && !batchResponseText.includes('<relevant_files>')) {
        
        console.warn(`Received git diff format instead of XML for batch ${batchIndex + 1}. Attempting to extract file paths from diff...`);
        
        // Extract file paths from the git diff format
        const diffFilePaths = batchResponseText
          .match(/^(\+\+\+|\-\-\-)\s+(a|b)\/([^\n]+)/gm)
          ?.map(line => line.replace(/^(\+\+\+|\-\-\-)\s+(a|b)\//, ''))
          ?.filter((value, index, self) => self.indexOf(value) === index) || [];
        
        console.log(`Extracted ${diffFilePaths.length} paths from diff format`);
        
        // Add these paths to our overall set if we found any
        if (diffFilePaths.length > 0) {
          diffFilePaths.forEach(path => {
            if (path && typeof path === 'string') {
              allRelevantPaths.add(path);
            }
          });
        }
        
        // Check for <file> format in response
        const filePathsFromTags = extractFilePathsFromTags(batchResponseText);
        if (filePathsFromTags.length > 0) {
          console.log(`Extracted ${filePathsFromTags.length} paths from <file> tags`);
          filePathsFromTags.forEach(path => {
            if (path) allRelevantPaths.add(path);
          });
          
          // If we found paths in the <file> format, we can continue with the regular flow
          if (filePathsFromTags.length > 0) {
            console.log(`Successfully extracted paths from <file> tags`);
          }
        }
        
        // Try a direct approach to get guidance
        const directGuidancePrompt = `
Based on the code I've provided, please give me a single concise paragraph that summarizes:
1. The complete data flow related to the task "${taskDescription}"
2. The key components and architectural patterns involved
3. How components interact with each other
4. The best approach for implementation
5. Any critical dependencies to consider

IMPORTANT: DO NOT reference any specific code elements, functions, variables, classes, or line numbers.
Focus only on architectural concepts, patterns, and general approaches.
Provide guidance at a conceptual level without mentioning implementation details.

IMPORTANT: When identifying relevant files, ALWAYS include ALL Markdown (.md and .mdc) documentation files, as these provide essential context even if they're not directly modified.

DO NOT write explanations of what each file does. DO NOT use phrases like "Based on the codebase" or "Here's a plan".
DO NOT repeat the task description. Focus on clear, direct technical guidance without overwhelming detail.`;

        console.log(`Attempting direct guidance prompt to get task guidance...`);
        
        const guidanceResult = await geminiClient.sendRequest(
          directGuidancePrompt,
          { 
            model: GEMINI_FLASH_MODEL,
            maxOutputTokens: 1024 
          }
        );
        
        if (guidanceResult.isSuccess && guidanceResult.data) {
          const directGuidance = guidanceResult.data.trim();
          console.log(`Received direct guidance: ${directGuidance.substring(0, 100)}...`);
          
          if (combinedGuidance) {
            combinedGuidance += "\n\n" + directGuidance;
          } else {
            combinedGuidance = directGuidance;
          }
        }
        
        continue; // Skip the regular XML parsing for this batch
      }
      
      // Extract relevant files from the batch response
      const batchRelevantFilesMatch = batchResponseText.match(/<relevant_files>\s*([\s\S]*?)\s*<\/relevant_files>/i);
      const batchGuidanceMatch = batchResponseText.match(/<guidance>\s*([\s\S]*?)\s*<\/guidance>/i);
      
      // Add more robust parsing approach if standard regex fails
      if (!batchRelevantFilesMatch) {
        console.warn(`Could not find relevant_files section in batch ${batchIndex + 1} response using standard regex`);
        console.log("Response preview:", batchResponseText.substring(0, 300));
        
        // Try alternative regex patterns with different whitespace handling
        const altRelevantFilesMatch = batchResponseText.match(/<\s*relevant_files\s*>([\s\S]*?)<\s*\/\s*relevant_files\s*>/i) ||
                                     batchResponseText.match(/<relevant_files>([\s\S]*?)<\/relevant_files>/i);
        
        if (altRelevantFilesMatch) {
          console.log(`Found relevant_files using alternative regex pattern`);
          processRelevantFilesContent(altRelevantFilesMatch[1].trim(), allRelevantPaths, batchIndex);
        } else {
          // If still no match, try to extract any file paths mentioned in the response
          console.log(`Attempting to extract any potential file paths from response...`);
          const potentialPaths = extractPotentialFilePaths(batchResponseText);
          if (potentialPaths.length > 0) {
            console.log(`Extracted ${potentialPaths.length} potential file paths from response content`);
            potentialPaths.forEach(path => {
              if (path) allRelevantPaths.add(path);
            });
          } else {
            console.warn(`Could not extract any file paths from batch ${batchIndex + 1} response`);
          }
        }
      } else {
        const batchRelevantFilesText = batchRelevantFilesMatch[1].trim();
        console.log(`Found relevant files section with ${batchRelevantFilesText.length} characters`);
        console.log(`Relevant files section preview: ${batchRelevantFilesText.substring(0, 200)}...`);
        
        processRelevantFilesContent(batchRelevantFilesText, allRelevantPaths, batchIndex);
      }
      
      // Process guidance with similar robust approach
      if (!batchGuidanceMatch) {
        console.warn(`Could not find guidance section in batch ${batchIndex + 1} response using standard regex`);
        
        // Try alternative regex for guidance
        const altGuidanceMatch = batchResponseText.match(/<\s*guidance\s*>([\s\S]*?)<\s*\/\s*guidance\s*>/i) ||
                                batchResponseText.match(/<guidance>([\s\S]*?)<\/guidance>/i);
        
        if (altGuidanceMatch) {
          console.log(`Found guidance using alternative regex pattern`);
          const altGuidance = altGuidanceMatch[1].trim();
          
          if (combinedGuidance) {
            combinedGuidance += "\n\n" + altGuidance;
          } else {
            combinedGuidance = altGuidance;
          }
        } else {
          // If no guidance section found, try to extract general content as guidance
          const extractedGuidance = extractGuidanceContent(batchResponseText);
          if (extractedGuidance) {
            console.log(`Extracted potential guidance content from response`);
            if (combinedGuidance) {
              combinedGuidance += "\n\n" + extractedGuidance;
            } else {
              combinedGuidance = extractedGuidance;
            }
          }
        }
      } else {
        const batchGuidance = batchGuidanceMatch[1].trim();
        console.log(`Found guidance section with ${batchGuidance.length} characters`);
        console.log(`Guidance preview: ${batchGuidance.substring(0, 100)}...`);
        
        if (combinedGuidance) {
          combinedGuidance += "\n\n" + batchGuidance;
        } else {
          combinedGuidance = batchGuidance;
        }
      }
    }
    
    // Convert set to array for the final result
    const relevantPaths = Array.from(allRelevantPaths);
    console.log(`Total unique relevant paths identified: ${relevantPaths.length}`);
    
    // If we have multiple batches, we need to synthesize the final guidance
    let enhancedTaskDescription = combinedGuidance;
    
    if (fileBatches.length > 1 && combinedGuidance) {
      console.log("Multiple batches processed, synthesizing final guidance...");
      // Synthesize a unified guidance from the combined batch guidances
      const synthesisPrompt = `
You are analyzing multiple batches of files from a codebase to provide comprehensive guidance on a task. 
Below are insights from analyzing different parts of the codebase:

${combinedGuidance}

Synthesize these insights into a single concise paragraph that covers:
- The complete data flow for the task
- All key components and architectural patterns involved
- How components interact through the entire pipeline
- The most appropriate implementation approach
- Critical dependencies to consider

IMPORTANT: DO NOT reference any specific code elements, functions, variables, classes, or line numbers.
Focus only on architectural concepts, patterns, and general approaches.
Provide guidance at a conceptual level without mentioning implementation details.

Do NOT use introductory or concluding phrases. Focus on clear technical guidance without overwhelming detail.
`;

      console.log(`Synthesis prompt length: ${synthesisPrompt.length} characters`);
      
      const synthesisResult = await geminiClient.sendRequest(
        synthesisPrompt,
        {
          model: GEMINI_FLASH_MODEL,
          maxOutputTokens: MAX_OUTPUT_TOKENS
        }
      );
      
      if (synthesisResult.isSuccess && synthesisResult.data) {
        enhancedTaskDescription = synthesisResult.data.trim();
        console.log(`Final synthesized guidance: ${enhancedTaskDescription.substring(0, 200)}...`);
      } else {
        console.warn("Failed to synthesize final guidance:", synthesisResult.message);
      }
    }
    
    if (relevantPaths.length === 0) {
      return { isSuccess: false, message: "No relevant paths were identified." };
    }
    
    console.log(`Finished processing with ${relevantPaths.length} relevant files and ${enhancedTaskDescription.length} characters of guidance`);
    
    // Clean all relevant paths to ensure no XML tags remain
    const cleanRelevantPaths = relevantPaths.map(path => path.replace(/<file>|<\/file>/g, '').trim());
    
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
