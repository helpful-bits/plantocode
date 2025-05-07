import { JobProcessor, JobProcessResult } from '../job-processor-interface';
import { PathFinderPayload } from '../job-types';
import { updateJobToRunning, updateJobToCompleted, updateJobToFailed } from '../job-helpers';
import { generateDirectoryTree } from '@/lib/directory-tree';
import { sessionRepository } from '@/lib/db/repositories';
import { generatePathFinderSystemPrompt, generatePathFinderUserPrompt } from '@/lib/prompts/path-finder-prompts';
import geminiClient from '@/lib/api/clients/gemini';
import { normalizePathForComparison } from '@/lib/path-utils';

/**
 * Path Finder Processor
 * 
 * Processes jobs that find relevant paths for a task based on the task description
 */
export class PathFinderProcessor implements JobProcessor<PathFinderPayload> {
  async process(payload: PathFinderPayload): Promise<JobProcessResult> {
    const { 
      backgroundJobId, 
      sessionId, 
      projectDirectory,
      taskDescription,
      modelOverride,
      // Use systemPromptOverride if available in the payload
      systemPromptOverride = payload.systemPromptOverride,
      temperature,
      maxOutputTokens
    } = payload;

    try {
      // Update job status to running
      await updateJobToRunning(backgroundJobId, 'gemini', 'Analyzing project to find relevant paths');

      // Generate directory tree
      if (!projectDirectory) {
        throw new Error("Missing project directory in payload");
      }
      const projectStructure = await generateDirectoryTree(projectDirectory);
      
      // Generate prompts
      const systemPrompt = systemPromptOverride || generatePathFinderSystemPrompt();
      const userPrompt = generatePathFinderUserPrompt(projectStructure, taskDescription);

      // Make request to Gemini API
      const result = await geminiClient.sendRequest(userPrompt, {
        model: modelOverride,
        systemPrompt,
        temperature,
        maxOutputTokens
      });

      if (!result.isSuccess) {
        await updateJobToFailed(
          backgroundJobId, 
          result.message || "Failed to find relevant paths"
        );
        
        return {
          success: false,
          message: result.message || "Failed to find relevant paths",
          error: result.error
        };
      }

      // Parse the response to extract paths
      const response = result.data as string;
      const paths = this.extractPaths(response, projectDirectory);
      
      if (paths.length === 0) {
        const errorMessage = "No valid paths were found in the response";
        await updateJobToFailed(backgroundJobId, errorMessage);
        
        return {
          success: false,
          message: errorMessage,
          error: new Error(errorMessage)
        };
      }

      // Update the session with the found paths
      try {
        // Fetch the current session to merge paths
        const session = await sessionRepository.getSession(sessionId);
        if (session) {
          // If session exists, merge new paths with existing ones
          // Get existing included files and normalize them for consistent comparison
          const existingIncludedPaths = (session.includedFiles || [])
            .map(p => normalizePathForComparison(p));
          
          // Normalize the newly extracted paths
          const newPathsNormalized = paths.map(p => normalizePathForComparison(p));
          
          // Merge existing paths with the new paths
          const mergedPathsSet = new Set([...existingIncludedPaths, ...newPathsNormalized]);
          const mergedIncludedFiles = Array.from(mergedPathsSet);
          
          console.log(`[PathFinderProcessor] Merging ${existingIncludedPaths.length} existing paths with ${paths.length} new paths (${mergedIncludedFiles.length} total after deduplication)`);
          
          // Update session with merged paths
          await sessionRepository.updateIncludedFiles(sessionId, mergedIncludedFiles);
        } else {
          console.error(`[PathFinderProcessor] Session ${sessionId} not found for path merging`);
          // If session doesn't exist (unlikely), just continue
        }
      } catch (sessionError) {
        console.error(`[PathFinderProcessor] Error updating session:`, sessionError);
        // We continue even if session update fails - the job itself can still succeed
      }

      // Update job to completed with the paths in the response
      await updateJobToCompleted(
        backgroundJobId,
        response,
        {
          tokensSent: result.metadata?.tokensSent || 0,
          tokensReceived: result.metadata?.tokensReceived || 0,
          totalTokens: result.metadata?.totalTokens || 0,
          modelUsed: result.metadata?.modelUsed || modelOverride,
          maxOutputTokens
        }
      );

      return {
        success: true,
        message: `Successfully found ${paths.length} relevant paths`,
        data: {
          paths,
          rawResponse: response
        }
      };
    } catch (error) {
      // If any error occurs, mark the job as failed
      const errorMessage = error instanceof Error ? 
        error.message : 
        "Unknown error during path finding";
      
      try {
        await updateJobToFailed(backgroundJobId, errorMessage);
      } catch (updateError) {
        console.error("[PathFinderProcessor] Error updating job status:", updateError);
      }

      return {
        success: false,
        message: errorMessage,
        error: error instanceof Error ? error : new Error(errorMessage)
      };
    }
  }

  /**
   * Extract paths from the LLM response
   * This handles various formats the LLM might use to return paths
   */
  private extractPaths(response: string, projectDirectory?: string): string[] {
    let paths: string[] = [];
    
    // First try to extract simple newline-separated paths (primary expected format)
    const lines = response.split('\n').map(line => line.trim()).filter(line => line.length > 0);
    if (lines.length > 0) {
      // Filter lines that look like valid paths and don't start with markdown list markers or comments
      const linePaths = lines.filter(line => 
        !line.startsWith('#') && 
        !line.startsWith('//') && 
        !line.startsWith('/*') && 
        !line.startsWith('*') &&
        !line.startsWith('-') &&
        !line.startsWith('+') &&
        !line.startsWith('<') &&
        !line.match(/^\d+\./) &&  // Numbered list items
        (line.includes('/') || line.includes('.')) && 
        !line.includes('?') && 
        !line.includes('#') &&
        !line.includes('*')
      ).map(line => line.trim());
      
      if (linePaths.length > 0) {
        paths = [...paths, ...linePaths];
      }
    }
    
    // If we didn't find any paths using the primary method, try fallbacks
    if (paths.length === 0) {
      // Look for paths in a markdown code block with JSON format
      const jsonMatches = response.split('\n').join(' ').match(/```(?:json)?\s*(\[\s*"[^"]+(?:",\s*"[^"]+)*"\s*\])/);
      if (jsonMatches && jsonMatches[1]) {
        try {
          const jsonPaths = JSON.parse(jsonMatches[1]);
          if (Array.isArray(jsonPaths) && jsonPaths.every(p => typeof p === 'string')) {
            paths = [...paths, ...jsonPaths];
          }
        } catch (e) {
          console.warn("[PathFinderProcessor] Failed to parse JSON paths:", e);
          // Continue with other extraction methods
        }
      }
      
      // Look for markdown list items if we still have no paths
      if (paths.length === 0) {
        const listItemsRegex = /[-*+]\s+`([^`]+)`|[-*+]\s+([^\s].*?)(?:\s*\n|$)/gm;
        let match;
        while ((match = listItemsRegex.exec(response)) !== null) {
          const path = match[1] || match[2];
          if (path && !paths.includes(path)) {
            paths.push(path.trim());
          }
        }
      }
      
      // Also extract paths between backticks if we still have no paths
      if (paths.length === 0) {
        const backtickRegex = /`([^`\n]+)`/g;
        let match;
        while ((match = backtickRegex.exec(response)) !== null) {
          const path = match[1];
          if (path && !paths.includes(path)) {
            paths.push(path.trim());
          }
        }
      }
    }
    
    // Deduplicate and filter out non-path items (like explanations)
    return paths
      .filter(Boolean)
      .filter(path => {
        // Basic path validation - should contain at least one / or . character
        // and not contain certain invalid characters 
        return (path.includes('/') || path.includes('.')) && 
               !path.includes('?') && 
               !path.includes('#') &&
               !path.includes('*');
      });
  }
}

// Export the job type this processor handles
export const PROCESSOR_TYPE = 'PATH_FINDER';