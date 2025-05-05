"use client";

import { useState, useCallback, useEffect, useMemo } from "react";
import { findRelevantFilesAction } from "@/actions/path-finder/index";
import { useBackgroundJob } from "@/lib/contexts/background-jobs-context";
import { useAsyncAction } from "../use-async-state";
import { normalizePath } from "@/lib/path-utils";

interface UseRelevantFilesFinderProps {
  activeSessionId: string | null;
  projectDirectory: string | null;
  taskDescription: string;
  includedPaths: string[];
  searchSelectedFilesOnly: boolean;
}

/**
 * Hook to manage the "Find Relevant Files" async operation
 */
export function useRelevantFilesFinder({
  activeSessionId,
  projectDirectory,
  taskDescription,
  includedPaths,
  searchSelectedFilesOnly
}: UseRelevantFilesFinderProps) {
  // State
  const [findingFilesJobId, setFindingFilesJobId] = useState<string | null>(null);
  
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
    
    console.log(`[RelevantFilesFinder] Finding relevant files: ${searchSelectedFilesOnly ? `${includedPaths.length} selected files` : 'all files'}`);
    
    const result = await findRelevantFilesAction(
      activeSessionId,
      taskDescription,
      filesToSearch ? filesToSearch : [],
      [],
      {
        projectDirectory: normalizePath(projectDirectory)
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

  // Clear job ID when task completes or fails
  useEffect(() => {
    if (findingFilesJobId && findingFilesJobResult) {
      const { status } = findingFilesJobResult;
      
      if (status === 'completed' || status === 'failed' || status === 'canceled') {
        console.log(`[RelevantFilesFinder] Job ${findingFilesJobId} ${status}, clearing job ID`);
        // Clear in the next tick to avoid state update during render
        setTimeout(() => setFindingFilesJobId(null), 0);
      }
    }
  }, [findingFilesJobId, findingFilesJobResult]);

  // Function to execute the find operation - stabilized with useCallback
  const executeFindRelevantFiles = useCallback(async () => {
    if (!taskDescription.trim()) {
      throw new Error("Task description is required for finding relevant files");
    }
    
    if (findRelevantFilesAsync.isLoading) {
      throw new Error("Already finding relevant files. Please wait for the current operation to complete.");
    }
    
    return await findRelevantFilesAsync.execute();
  }, [taskDescription, findRelevantFilesAsync]);

  // Memoize the returned object to ensure stability
  return useMemo(() => ({
    isFindingFiles: findRelevantFilesAsync.isLoading,
    findingFilesJobId,
    error: findRelevantFilesAsync.error,
    findingFilesJobResult,
    executeFindRelevantFiles
  }), [
    findRelevantFilesAsync.isLoading,
    findingFilesJobId,
    findRelevantFilesAsync.error,
    findingFilesJobResult,
    executeFindRelevantFiles
  ]);
}