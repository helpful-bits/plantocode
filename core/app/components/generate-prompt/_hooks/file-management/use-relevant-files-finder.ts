"use client";

import { useState, useCallback, useEffect, useMemo, useRef } from "react";
import { findRelevantFilesAction } from "@core/actions/path-finder/index";
import { useBackgroundJob } from "@core/lib/contexts/background-jobs-context";
import { useAsyncAction } from "../use-async-state";
import { normalizePath, parseFilePathsFromAIResponse } from "@core/lib/path-utils";
import { JOB_STATUSES, JobStatus } from "@core/types/session-types";

interface UseRelevantFilesFinderProps {
  activeSessionId: string | null;
  projectDirectory: string | null;
  taskDescription: string;
  includedPaths: string[];
  searchSelectedFilesOnly: boolean;
  onComplete?: (paths: string[]) => void;
}

/**
 * Hook to manage the "Find Relevant Files" async operation
 */
export function useRelevantFilesFinder({
  activeSessionId,
  projectDirectory,
  taskDescription,
  includedPaths,
  searchSelectedFilesOnly,
  onComplete
}: UseRelevantFilesFinderProps) {
  // State
  const [findingFilesJobId, setFindingFilesJobId] = useState<string | null>(null);
  
  // Single ref to track if a job is being created
  const isRequestInProgressRef = useRef<boolean>(false);
  
  // Monitor the background job status
  const findingFilesJobResult = useBackgroundJob(findingFilesJobId);
  
  // Async action hook to execute the find relevant files action
  const findRelevantFilesAsync = useAsyncAction(async () => {
    // Validate inputs
    if (!activeSessionId) {
      throw new Error("No active session. Please create a session before finding relevant files.");
    }
    
    // Validate that activeSessionId is a string
    if (typeof activeSessionId !== 'string') {
      console.error(`[RelevantFilesFinder] Invalid activeSessionId type: ${typeof activeSessionId}, value:`, activeSessionId);
      throw new Error("Invalid session ID format. Please create a new session.");
    }

    // Make sure projectDirectory is not null before using it
    if (!projectDirectory) {
      throw new Error("Project directory is required for finding relevant files");
    }
    
    // Determine which files to search in
    const filesToSearch = searchSelectedFilesOnly
      ? includedPaths
      : null; // null means all files in the project
    
    console.log(`[RelevantFilesFinder] Finding relevant files: ${searchSelectedFilesOnly ? `${includedPaths.length} selected files` : 'all files'}, including file contents`);
    
    const result = await findRelevantFilesAction(
      activeSessionId,
      taskDescription,
      filesToSearch ? filesToSearch : [],
      [],
      {
        projectDirectory: normalizePath(projectDirectory),
        includeFileContents: true // Always include file contents for better accuracy
      }
    );
    
    if (!result.isSuccess) {
      throw new Error(result.message || "Failed to start relevant file search.");
    }
    
    if (result.data) {
      if ('jobId' in result.data) {
        // Set the job ID to track completion
        setFindingFilesJobId(result.data.jobId);
        
        // Return job ID to indicate async job started
        return { jobStarted: true, jobId: result.data.jobId };
      } else if ('relevantPaths' in result.data) {
        // Handle immediate response (unlikely with the current implementation)
        const paths = (result.data as { relevantPaths: string[] }).relevantPaths;
        
        return { jobStarted: false, pathsFound: paths };
      }
    }
    
    throw new Error("Unexpected response from findRelevantFilesAction");
  });

  // Job completion handler with improved response handling
  useEffect(() => {
    // Skip if no job is running or no result available
    if (!findingFilesJobId || !findingFilesJobResult) {
      return;
    }

    console.log(`[RelevantFilesFinder] Job update: ${findingFilesJobId}`, {
      job: findingFilesJobResult.job,
      status: findingFilesJobResult.status,
      response: findingFilesJobResult.response ?
        `Response length: ${typeof findingFilesJobResult.response === 'string' ? findingFilesJobResult.response.length : 'non-string'}` :
        'No response'
    });

    const { status } = findingFilesJobResult;
    const job = findingFilesJobResult.job;

    // When job completes successfully, extract paths and call the onComplete callback
    if (status === 'completed' && job && onComplete) {
      try {
        // First try to extract paths from the structured metadata (preferred)
        let paths: string[] = [];

        // Check if we have structured path data in the metadata
        if (job.metadata?.pathData) {
          try {
            // Parse the structured path data from the PathFinderProcessor
            const pathData = JSON.parse(job.metadata.pathData);
            if (Array.isArray(pathData.paths)) {
              paths = pathData.paths;
              console.log(`[RelevantFilesFinder] Successfully extracted ${paths.length} paths from metadata`);
            }
          } catch (parseError) {
            console.warn('[RelevantFilesFinder] Could not parse pathData from metadata:', parseError);
            // Continue to fallback methods
          }
        }

        // Fallback 1: If no paths found in metadata, try parsing from response text
        if (paths.length === 0 && job.response) {
          try {
            // First try to see if the response itself is parseable as JSON
            try {
              const jsonResponse = JSON.parse(job.response);
              if (Array.isArray(jsonResponse.paths)) {
                paths = jsonResponse.paths;
                console.log(`[RelevantFilesFinder] Extracted ${paths.length} paths from JSON response`);
              }
            } catch (jsonError) {
              // Not JSON, try parsing as newline-delimited list or using the central utility
              const parsedPaths = parseFilePathsFromAIResponse(job.response, projectDirectory || undefined);
              if (parsedPaths.length > 0) {
                paths = parsedPaths;
                console.log(`[RelevantFilesFinder] Extracted ${paths.length} paths by parsing response text`);
              } else {
                // Last resort: try splitting by newlines
                const splitPaths = job.response.split('\n').filter(Boolean);
                if (splitPaths.length > 0) {
                  paths = splitPaths;
                  console.log(`[RelevantFilesFinder] Extracted ${paths.length} paths by splitting response text`);
                }
              }
            }
          } catch (responseError) {
            console.error('[RelevantFilesFinder] Error parsing response:', responseError);
          }
        }

        // Final validation: Make sure we don't have empty paths
        paths = paths.filter(path => path && path.trim() !== '');

        if (paths.length > 0) {
          console.log(`[RelevantFilesFinder] Found ${paths.length} paths to process`);
          console.log(`[RelevantFilesFinder] Paths sample:`, paths.slice(0, 5), paths.length > 5 ? `...and ${paths.length - 5} more` : '');

          // Call the onComplete callback with the parsed paths
          // This prevents the PathFinder processor from directly updating the session
          // which was causing database issues that deleted background jobs
          onComplete(paths);
        } else {
          console.warn('[RelevantFilesFinder] No valid paths found in job response');
        }
      } catch (error) {
        console.error('[RelevantFilesFinder] Error processing job response:', error);
      }
    } else if (status === 'failed' && job?.errorMessage) {
      console.error(`[RelevantFilesFinder] Job failed: ${job.errorMessage}`);
    }

    // Once job is in any terminal state, clear the job ID
    if (JOB_STATUSES.TERMINAL.includes(status as JobStatus)) {
      console.log(`[RelevantFilesFinder] Job completed with status: ${status}, clearing job ID`);
      setFindingFilesJobId(null);
    }
  }, [findingFilesJobId, findingFilesJobResult, onComplete, projectDirectory]);

  
  // Function to execute the find operation
  const executeFindRelevantFiles = useCallback(async () => {
    // If no task description or job already running or request in progress, exit
    if (!taskDescription.trim() || findingFilesJobId || isRequestInProgressRef.current) {
      return;
    }
    
    // Mark request as in progress
    isRequestInProgressRef.current = true;
    
    try {
      // Execute the async operation
      await findRelevantFilesAsync.execute();
    } finally {
      // Always clean up
      isRequestInProgressRef.current = false;
    }
  }, [taskDescription, findRelevantFilesAsync, findingFilesJobId]);

  // Return with all required properties
  return useMemo(() => {
    // Single boolean to indicate if finding files process is active
    const isFindingFiles = findRelevantFilesAsync.isLoading || findingFilesJobId !== null || isRequestInProgressRef.current;
    
    return {
      isFindingFiles,
      findingFilesJobId,
      error: findRelevantFilesAsync.error,
      findingFilesJobResult,
      executeFindRelevantFiles
    };
  }, [
    findRelevantFilesAsync.isLoading,
    findingFilesJobId,
    findRelevantFilesAsync.error,
    findingFilesJobResult,
    executeFindRelevantFiles
  ]);
}