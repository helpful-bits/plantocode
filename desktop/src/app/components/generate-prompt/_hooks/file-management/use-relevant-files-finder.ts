"use client";

import { useState, useCallback, useEffect, useMemo, useRef } from "react";

import { findRelevantFilesAction } from "@/actions";
import { useBackgroundJob } from "@/contexts/_hooks/use-background-job";
import { useAsyncAction } from "@/hooks";
import { JOB_STATUSES, type JobStatus } from "@/types/session-types";
import {
  normalizePath,
  parseFilePathsFromAIResponse,
} from "@/utils/path-utils";

interface UseRelevantFilesFinderProps {
  activeSessionId: string | null;
  projectDirectory: string | null;
  taskDescription: string;
  includedPaths: string[];
  searchSelectedFilesOnly: boolean;
  onComplete?: (paths: string[]) => void;
  timeout?: number; // Optional timeout in milliseconds
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
  onComplete,
  timeout = 300000, // Default 5 minute timeout
}: UseRelevantFilesFinderProps) {
  // State
  const [findingFilesJobId, setFindingFilesJobId] = useState<string | null>(
    null
  );
  
  // Single ref to track if a job is being created
  const isRequestInProgressRef = useRef<boolean>(false);
  
  // Add timeout ref for job monitoring
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Monitor the background job status
  const findingFilesJobResult = useBackgroundJob(findingFilesJobId) as {
    status: string;
    job?: {
      metadata?: {
        pathData?: string;
      };
      response?: string;
      errorMessage?: string;
    };
    error?: Error;
  } | null;

  // Async action hook to execute the find relevant files action
  const findRelevantFilesAsync = useAsyncAction(async () => {
    // Validate inputs
    if (!activeSessionId || typeof activeSessionId !== "string") {
      throw new Error(
        "No active session or invalid session ID. Please create a new session."
      );
    }

    // Make sure projectDirectory is not null before using it
    if (!projectDirectory) {
      throw new Error(
        "Project directory is required for finding relevant files"
      );
    }

    // Determine which files to search in
    const filesToSearch = searchSelectedFilesOnly ? includedPaths : null; // null means all files in the project

    // Finding relevant files

    const normalizedProjectDir = await normalizePath(projectDirectory);

    const result: { isSuccess: boolean; message?: string; data?: { jobId: string } | { relevantPaths: string[] } } = await findRelevantFilesAction({
      sessionId: activeSessionId,
      taskDescription,
      options: {
        projectDirectory: normalizedProjectDir,
        includedFiles: filesToSearch ? filesToSearch : [],
        forceExcludedFiles: [],
        includeFileContents: true, // Always include file contents for better accuracy
      },
    });

    if (!result.isSuccess) {
      throw new Error(
        result.message || "Failed to start relevant file search."
      );
    }

    if (result.data) {
      if ("jobId" in result.data) {
        // Set the job ID to track completion
        setFindingFilesJobId(result.data.jobId);
        
        // Set timeout to prevent infinite waiting
        if (timeout > 0) {
          // Clear any existing timeout
          if (timeoutRef.current) {
            clearTimeout(timeoutRef.current);
          }
          
          // Set new timeout
          timeoutRef.current = setTimeout(() => {
            setFindingFilesJobId(null);
          }, timeout);
        }

        // Return job ID to indicate async job started
        return { jobStarted: true, jobId: result.data.jobId };
      } else if ("relevantPaths" in result.data) {
        // Handle immediate response (unlikely with the current implementation)
        const paths = (result.data as { relevantPaths: string[] })
          .relevantPaths;

        return { jobStarted: false, pathsFound: paths };
      }
    }

    throw new Error("Unexpected response from findRelevantFilesAction");
  });

  // Clean up timeout when component unmounts or when job completes
  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  // Job completion handler with improved response handling
  useEffect(() => {
    const effectBody = async () => {
      // Skip if no job is running or no result available
      if (!findingFilesJobId || !findingFilesJobResult) {
        return;
      }

      // Process job update

      const { status } = findingFilesJobResult;
      const job = findingFilesJobResult.job;

      // When job completes successfully, extract paths and call the onComplete callback
      if (status === "completed" && job && onComplete) {
        try {
          // Clear timeout if job completes
          if (timeoutRef.current) {
            clearTimeout(timeoutRef.current);
            timeoutRef.current = null;
          }
          
          // Extract paths from job result, prioritizing structured data over text parsing
          const paths = await extractPathsFromJobResult({
            metadata: job?.metadata,
            response: job?.response
          }, projectDirectory);
          
          if (paths.length > 0) {
            // Call the onComplete callback with the parsed paths
            onComplete(paths);
          }
        } catch (_error) {
          // Error processing job response
        }
      } else if (status === "failed" && job?.errorMessage) {
        // Clear timeout if job fails
        if (timeoutRef.current) {
          clearTimeout(timeoutRef.current);
          timeoutRef.current = null;
        }
      }

      // Once job is in any terminal state, clear the job ID
      if (JOB_STATUSES.TERMINAL.includes(status as JobStatus)) {
        setFindingFilesJobId(null);
      }
    };

    void effectBody();
  }, [findingFilesJobId, findingFilesJobResult, onComplete, projectDirectory]);

  // Helper function to extract paths from job result
  async function extractPathsFromJobResult(job: { metadata?: { pathData?: string } | undefined, response?: string | undefined }, projectDir: string | null): Promise<string[]> {
    let paths: string[] = [];

    // Method 1: Extract from structured metadata (preferred)
    if (job.metadata?.pathData) {
      try {
        const pathData = job.metadata?.pathData ? JSON.parse(job.metadata.pathData) as { paths?: string[] } : {};
        if (pathData && 'paths' in pathData && Array.isArray(pathData.paths)) {
          paths = pathData.paths;
          return paths;
        }
      } catch (_jsonError) {
        // Continue to fallback methods
      }
    }

    // Method 2: Parse from JSON response
    if (job.response) {
      try {
        const jsonResponse = job.response ? JSON.parse(job.response) as { paths?: string[] } : {};
        if (jsonResponse && 'paths' in jsonResponse && Array.isArray(jsonResponse.paths)) {
          paths = jsonResponse.paths;
          return paths;
        }
      } catch (_jsonError) {
        // Not JSON, continue to fallback methods
      }
    }

    // Method 3: Use specialized path parser
    if (job.response && projectDir) {
      try {
        const parsedPaths = await parseFilePathsFromAIResponse(
          job.response,
          projectDir
        );
        if (parsedPaths.length > 0) {
          return parsedPaths;
        }
      } catch (_parseError) {
        // Error parsing paths from response
      }
    }

    // Method 4: Last resort - split by newlines
    if (job.response) {
      const splitPaths = job.response.split("\n")
        .filter(Boolean)
        .map((line: string) => line.trim())
        .filter((line: string) => line.includes(".") && !line.includes(" "));
      
      if (splitPaths.length > 0) {
        return splitPaths;
      }
    }

    return [];
  }

  // Function to execute the find operation
  const executeFindRelevantFiles = useCallback(async (): Promise<void> => {
    // If no task description or job already running or request in progress, exit
    if (
      !taskDescription.trim() ||
      findingFilesJobId ||
      isRequestInProgressRef.current
    ) {
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
    const isFindingFiles =
      findRelevantFilesAsync.isLoading ||
      findingFilesJobId !== null ||
      isRequestInProgressRef.current;

    return {
      isFindingFiles,
      findingFilesJobId,
      error: findRelevantFilesAsync.error,
      findingFilesJobResult,
      executeFindRelevantFiles,
    };
  }, [
    findRelevantFilesAsync.isLoading,
    findingFilesJobId,
    findRelevantFilesAsync.error,
    findingFilesJobResult,
    executeFindRelevantFiles,
  ]);
}