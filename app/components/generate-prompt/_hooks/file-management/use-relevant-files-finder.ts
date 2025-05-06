"use client";

import { useState, useCallback, useEffect, useMemo, useRef } from "react";
import { findRelevantFilesAction } from "@/actions/path-finder/index";
import { useBackgroundJob } from "@/lib/contexts/background-jobs-context";
import { useAsyncAction } from "../use-async-state";
import { normalizePath } from "@/lib/path-utils";
import { JOB_STATUSES, JobStatus } from "@/types/session-types";

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

  // Job completion handler
  useEffect(() => {
    // Skip if no job is running or no result available
    if (!findingFilesJobId || !findingFilesJobResult) {
      return;
    }
    
    const { status } = findingFilesJobResult;
    
    // We no longer dispatch the event here - the consumer (useFileManagementState)
    // will use the findingFilesJobResult directly to react to completed jobs
    
    // Once job is in any terminal state, clear the job ID
    if (JOB_STATUSES.TERMINAL.includes(status as JobStatus)) {
      setFindingFilesJobId(null);
    }
  }, [findingFilesJobId, findingFilesJobResult]);

  
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