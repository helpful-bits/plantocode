"use client";

import React, { createContext, useContext, useEffect, useState, useCallback, useRef, ReactNode } from 'react';
import { BackgroundJob, JobStatus, ApiType, TaskType, JOB_STATUSES } from '@core/types/session-types';
import { getActiveJobsAction, clearJobHistoryAction, cancelBackgroundJobAction } from '@core/actions/background-job-actions';
import streamingRequestPool from "../api/streaming-request-pool";
import { safeFetch } from '@core/lib/utils';

// Polling interval (ms)
// Background jobs are polled every 1.5 seconds to provide more responsive updates in the UI
const POLLING_INTERVAL = 1500;

// Add a debug flag to control the additional logging
// This can be enabled via localStorage.setItem('DEBUG_BACKGROUND_JOBS', 'true') in browser console
const DEBUG_POLLING = typeof window !== 'undefined' && 
  (localStorage.getItem('DEBUG_BACKGROUND_JOBS') === 'true' || false);

// Enhanced job equality check - optimized for performance with better streaming detection
function areJobsEqual(jobA: BackgroundJob, jobB: BackgroundJob): boolean {
  // Fast path 1: Reference equality (same object)
  if (jobA === jobB) return true;

  // Basic validation - both jobs must exist and have the same ID
  if (!jobA || !jobB) return false;
  if (jobA.id !== jobB.id) return false;

  // Fast path 2: Check status first - if different, jobs are definitely not equal
  if (jobA.status !== jobB.status) {
    if (DEBUG_POLLING) {
      console.debug(`[BackgroundJobs] Jobs differ for ${jobA.id}: status changed from ${jobA.status} to ${jobB.status}`);
    }
    return false;
  }

  // Fast path 3: Check updatedAt timestamp - if unchanged, do quick status-based check
  if (jobA.updatedAt === jobB.updatedAt) {
    // For terminal jobs with identical updatedAt, assume content is stable
    if (JOB_STATUSES.TERMINAL.includes(jobA.status)) {
      if (DEBUG_POLLING) {
        console.debug(`[BackgroundJobs] Fast equality check for terminal job ${jobA.id} with matching updatedAt`);
      }
      return true;
    }

    // For non-running/non-streaming jobs, updatedAt is usually sufficient
    if (jobA.status !== 'running') {
      if (DEBUG_POLLING) {
        console.debug(`[BackgroundJobs] Fast equality check for non-running job ${jobA.id} with matching updatedAt`);
      }
      return true;
    }
  }

  // For running jobs, especially streaming ones, check streaming indicators
  if (jobA.status === 'running') {
    // Check streaming indicators directly
    const jobAIsStreaming = jobA.metadata?.isStreaming === true;
    const jobBIsStreaming = jobB.metadata?.isStreaming === true;

    // If streaming status changed, jobs are different
    if (jobAIsStreaming !== jobBIsStreaming) {
      if (DEBUG_POLLING) {
        console.debug(`[BackgroundJobs] Streaming status changed for job ${jobA.id}`);
      }
      return false;
    }

    // For streaming jobs, check crucial streaming indicators
    if (jobAIsStreaming && jobBIsStreaming) {
      // Check streaming progress indicators
      const streamTimeA = jobA.metadata?.lastStreamUpdateTime;
      const streamTimeB = jobB.metadata?.lastStreamUpdateTime;
      const charsA = jobA.charsReceived;
      const charsB = jobB.charsReceived;
      const tokensA = jobA.tokensReceived;
      const tokensB = jobB.tokensReceived;

      // Enhanced check for streaming metrics including responseLength for better UI updates
      const responseLengthA = jobA.metadata?.responseLength;
      const responseLengthB = jobB.metadata?.responseLength;
      const streamProgressA = jobA.metadata?.streamProgress;
      const streamProgressB = jobB.metadata?.streamProgress;
      const estimatedTotalLengthA = jobA.metadata?.estimatedTotalLength;
      const estimatedTotalLengthB = jobB.metadata?.estimatedTotalLength;

      // If any streaming metric changed, jobs are different - this triggers UI updates
      if (
        streamTimeA !== streamTimeB ||
        charsA !== charsB ||
        tokensA !== tokensB ||
        responseLengthA !== responseLengthB ||
        streamProgressA !== streamProgressB ||
        estimatedTotalLengthA !== estimatedTotalLengthB
      ) {
        if (DEBUG_POLLING) {
          console.debug(`[BackgroundJobs] Streaming metrics changed for job ${jobA.id}:`, {
            timeChange: streamTimeA !== streamTimeB ? `${streamTimeA} → ${streamTimeB}` : 'unchanged',
            charsChange: charsA !== charsB ? `${charsA} → ${charsB}` : 'unchanged',
            tokensChange: tokensA !== tokensB ? `${tokensA} → ${tokensB}` : 'unchanged',
            responseLengthChange: responseLengthA !== responseLengthB ? `${responseLengthA} → ${responseLengthB}` : 'unchanged'
          });
        }
        return false;
      }

      // Enhanced response content comparison for streaming jobs
      if (typeof jobA.response === 'string' && typeof jobB.response === 'string') {
        // Length comparison is faster than content comparison
        if (jobA.response.length !== jobB.response.length) {
          if (DEBUG_POLLING) {
            console.debug(`[BackgroundJobs] Response length changed for job ${jobA.id}: ${jobA.response.length} → ${jobB.response.length}`);
          }
          return false;
        }

        // For relatively short responses, compare content directly
        // This catches character changes even when length is identical
        if (jobA.response.length < 5000 && jobA.response !== jobB.response) {
          if (DEBUG_POLLING) {
            console.debug(`[BackgroundJobs] Response content changed for streaming job ${jobA.id} despite same length`);
          }
          return false;
        }
      }
    }
  }

  // Helper functions for efficient comparisons
  const safeStringCompare = (a: string | null | undefined, b: string | null | undefined): boolean => {
    // Fast path: reference equality
    if (a === b) return true;

    // Handle null/undefined
    if (a == null && b == null) return true;
    if (a == null || b == null) return false;

    // Compare lengths first, then content
    return a.length === b.length && a === b;
  };

  // Efficient status message comparison
  if (!safeStringCompare(jobA.statusMessage, jobB.statusMessage)) {
    if (DEBUG_POLLING) {
      console.debug(`[BackgroundJobs] Status message changed for job ${jobA.id}`);
    }
    return false;
  }

  // For all jobs, always check output file path - this is crucial for implementation plans
  if (!safeStringCompare(jobA.outputFilePath, jobB.outputFilePath)) {
    if (DEBUG_POLLING) {
      console.debug(`[BackgroundJobs] Output file path changed for job ${jobA.id}: ${jobA.outputFilePath} → ${jobB.outputFilePath}`);
    }
    return false;
  }

  // For failed/canceled jobs, check error message
  if (jobA.status === 'failed' || jobA.status === 'canceled') {
    if (!safeStringCompare(jobA.errorMessage, jobB.errorMessage)) {
      if (DEBUG_POLLING) {
        console.debug(`[BackgroundJobs] Error message changed for job ${jobA.id}`);
      }
      return false;
    }
  }

  // Task-specific checks
  // For path finder jobs, check pathCount in metadata
  if (jobA.taskType === 'pathfinder' && jobA.status === 'completed') {
    if (jobA.metadata?.pathCount !== jobB.metadata?.pathCount) {
      if (DEBUG_POLLING) {
        console.debug(`[BackgroundJobs] Path count changed for job ${jobA.id}`);
      }
      return false;
    }
  }

  // Check if metadata has changed in a way that affects the UI
  if (hasMetadataChanged(jobA, jobB)) {
    if (DEBUG_POLLING) {
      console.debug(`[BackgroundJobs] Metadata changed for job ${jobA.id}`);
    }
    return false;
  }

  // Response content comparison for all job types
  // This needs to be comprehensive to catch all display changes
  if (!safeStringCompare(jobA.response, jobB.response)) {
    if (DEBUG_POLLING) {
      console.debug(`[BackgroundJobs] Response content changed for job ${jobA.id}`);

      // Additional debugging: detect file reference vs content changes
      const aHasFileRef = jobA.response?.includes('Content stored in file:') || jobA.response?.includes('available in file:');
      const bHasFileRef = jobB.response?.includes('Content stored in file:') || jobB.response?.includes('available in file:');

      if (aHasFileRef !== bHasFileRef) {
        console.debug(`[BackgroundJobs] File reference changed in response: ${aHasFileRef} → ${bHasFileRef}`);
      }
    }
    return false;
  }

  // For debugging, log that jobs are considered equal
  if (DEBUG_POLLING) {
    console.debug(`[BackgroundJobs] Jobs considered equal for ${jobA.id}`);
  }

  // All checks passed, jobs are equal
  return true;
}

// Helper function to check if metadata has changed in a way that affects UI
function hasMetadataChanged(jobA: BackgroundJob, jobB: BackgroundJob): boolean {
  // Fast path 1: Reference equality check
  if (jobA.metadata === jobB.metadata) return false;

  // Fast path 2: If neither job has metadata, they're equal in this respect
  if (!jobA.metadata && !jobB.metadata) return false;

  // Fast path 3: If one has metadata and the other doesn't, they definitely differ
  if (!jobA.metadata || !jobB.metadata) return true;

  // Check for regexPatterns in completed jobs (especially for regex generation tasks)
  if (jobA.status === 'completed') {
    // Check if regexPatterns exists in only one of the jobs
    const hasRegexPatternsA = 'regexPatterns' in jobA.metadata;
    const hasRegexPatternsB = 'regexPatterns' in jobB.metadata;

    if (hasRegexPatternsA !== hasRegexPatternsB) {
      if (DEBUG_POLLING) {
        console.debug(`[BackgroundJobs] Metadata differs: regexPatterns presence mismatch for job ${jobA.id}`);
      }
      return true;
    }

    // If both have regexPatterns, compare the references
    if (hasRegexPatternsA && hasRegexPatternsB && jobA.metadata.regexPatterns !== jobB.metadata.regexPatterns) {
      if (DEBUG_POLLING) {
        console.debug(`[BackgroundJobs] Metadata differs: regexPatterns changed for job ${jobA.id}`);
      }
      return true;
    }
  }

  // For pathfinder jobs, check pathData and pathCount first
  if (jobA.taskType === 'pathfinder') {
    // For completed path finder jobs, check pathCount
    if (jobA.status === 'completed') {
      if (jobA.metadata.pathCount !== jobB.metadata.pathCount) {
        if (DEBUG_POLLING) {
          console.debug(`[BackgroundJobs] Path finder job metadata differs: pathCount ${jobA.metadata.pathCount} !== ${jobB.metadata.pathCount}`);
        }
        return true;
      }

      // If pathData is present in only one, they differ
      const hasPathDataA = 'pathData' in jobA.metadata;
      const hasPathDataB = 'pathData' in jobB.metadata;

      if (hasPathDataA !== hasPathDataB) {
        if (DEBUG_POLLING) {
          console.debug(`[BackgroundJobs] Path finder job metadata differs: pathData presence mismatch`);
        }
        return true;
      }

      // If both have pathData, compare the structures (but not deeply, just check if they're equal references)
      if (hasPathDataA && hasPathDataB && jobA.metadata.pathData !== jobB.metadata.pathData) {
        if (DEBUG_POLLING) {
          console.debug(`[BackgroundJobs] Path finder job metadata differs: pathData reference changes`);
        }
        return true;
      }
    }
  }

  // For streaming jobs, check streaming indicators first
  if (jobA.status === 'running') {
    // Check isStreaming flag
    const jobAIsStreaming = jobA.metadata.isStreaming === true;
    const jobBIsStreaming = jobB.metadata.isStreaming === true;

    if (jobAIsStreaming !== jobBIsStreaming) {
      if (DEBUG_POLLING) {
        console.debug(`[BackgroundJobs] Streaming status differs in metadata`);
      }
      return true;
    }

    // For active streaming jobs, check critical streaming indicators
    if (jobAIsStreaming) {
      // Check stream update timestamp
      if (jobA.metadata.lastStreamUpdateTime !== jobB.metadata.lastStreamUpdateTime) {
        if (DEBUG_POLLING) {
          console.debug(`[BackgroundJobs] Stream update time differs: ${jobA.metadata.lastStreamUpdateTime} !== ${jobB.metadata.lastStreamUpdateTime}`);
        }
        return true;
      }

      // Check streamProgress for implementation plan and streaming jobs
      if (jobA.metadata.streamProgress !== jobB.metadata.streamProgress) {
        if (DEBUG_POLLING) {
          console.debug(`[BackgroundJobs] Stream progress differs: ${jobA.metadata.streamProgress} !== ${jobB.metadata.streamProgress}`);
        }
        return true;
      }

      // Check response length tracking
      if (jobA.metadata.responseLength !== jobB.metadata.responseLength) {
        if (DEBUG_POLLING) {
          console.debug(`[BackgroundJobs] Response length differs in metadata: ${jobA.metadata.responseLength} !== ${jobB.metadata.responseLength}`);
        }
        return true;
      }

      // Check estimated total length
      if (jobA.metadata.estimatedTotalLength !== jobB.metadata.estimatedTotalLength) {
        if (DEBUG_POLLING) {
          console.debug(`[BackgroundJobs] Estimated total length differs: ${jobA.metadata.estimatedTotalLength} !== ${jobB.metadata.estimatedTotalLength}`);
        }
        return true;
      }
    }
  }

  // Define fields that are important for UI updates, in priority order
  const importantFields = [
    // Most important fields for UI display
    'targetField',          // Determines which form field gets updated
    'progress',             // Progress indicators
    'pathCount',            // Number of paths found (for path finder)

    // UI display modifiers
    'responseFormat',       // How response is formatted (e.g. JSON, markdown)
    'contentType',          // Content type for response display

    // Performance metrics
    'tokensReceived',       // Token counts shown in UI
    'tokensSent',           // Token counts shown in UI
    'charsReceived',        // Character counts for display
    'modelUsed'             // Model name to display
  ];

  // Check each important field efficiently with early returns
  for (const field of importantFields) {
    const valueA = jobA.metadata[field];
    const valueB = jobB.metadata[field];

    // Only compare fields that exist in at least one object
    if (valueA !== undefined || valueB !== undefined) {
      // If values differ, metadata has changed
      if (valueA !== valueB) {
        if (DEBUG_POLLING) {
          console.debug(`[BackgroundJobs] Metadata differs for ${field}: ${valueA} !== ${valueB}`);
        }
        return true;
      }
    }
  }

  // All checks passed, metadata is considered unchanged for UI purposes
  return false;
}

// Deep equality check for arrays of jobs with optimizations
function areJobArraysEqual(arrA: BackgroundJob[], arrB: BackgroundJob[]): boolean {
  // Compare lengths first for a quick check
  if (arrA.length !== arrB.length) {
    if (DEBUG_POLLING) {
      console.debug(`[BackgroundJobs] Job arrays differ in length: ${arrA.length} vs ${arrB.length}`);
    }
    return false;
  }

  // Empty arrays are equal
  if (arrA.length === 0) return true;

  // Fast path: Direct reference equality check
  if (arrA === arrB) return true;

  // For very small arrays (1-2 items), a linear search is faster than Map creation
  if (arrA.length <= 2) {
    // Check if all jobs match by ID and content
    for (const jobA of arrA) {
      const jobB = arrB.find(job => job.id === jobA.id);

      if (!jobB || !areJobsEqual(jobA, jobB)) {
        if (DEBUG_POLLING) {
          console.debug(`[BackgroundJobs] Small array mismatch for job ${jobA.id}`);
        }
        return false;
      }
    }
    return true;
  }

  // Create maps of jobs by ID for efficient lookup and comparison
  const jobsMapA = new Map(arrA.map(job => [job.id, job]));
  const jobsMapB = new Map(arrB.map(job => [job.id, job]));

  // Check for job IDs differences (missing in either array)
  if (jobsMapA.size !== jobsMapB.size) return false;

  // First check if the set of IDs is the same (without recursion)
  const jobIdsA = new Set(jobsMapA.keys());
  const jobIdsB = new Set(jobsMapB.keys());

  // Quick check if sets have different sizes
  if (jobIdsA.size !== jobIdsB.size) return false;

  // Check if all IDs in A exist in B
  for (const jobId of jobIdsA) {
    if (!jobIdsB.has(jobId)) {
      if (DEBUG_POLLING) {
        console.debug(`[BackgroundJobs] Job ${jobId} exists in array A but not in array B`);
      }
      return false;
    }
  }

  // At this point, both arrays have the same job IDs
  // Look for active jobs first - they're most likely to change during polling
  const activeJobs = arrA.filter(job => JOB_STATUSES.ACTIVE.includes(job.status));

  // If there are active jobs, check them first for early exit
  for (const jobA of activeJobs) {
    const jobB = jobsMapB.get(jobA.id);
    // We know jobB exists because we checked the IDs above
    if (!areJobsEqual(jobA, jobB!)) {
      if (DEBUG_POLLING) {
        console.debug(`[BackgroundJobs] Active job differs: ${jobA.id}`);
      }
      return false;
    }
  }

  // Then check the remaining jobs (completed/failed/canceled)
  const terminalJobs = arrA.filter(job => !JOB_STATUSES.ACTIVE.includes(job.status));

  for (const jobA of terminalJobs) {
    const jobB = jobsMapB.get(jobA.id);
    // We know jobB exists because we checked the IDs above
    if (!areJobsEqual(jobA, jobB!)) {
      if (DEBUG_POLLING) {
        console.debug(`[BackgroundJobs] Terminal job differs: ${jobA.id}`);
      }
      return false;
    }
  }

  // All jobs are equal
  return true;
}

// Use constants from session-types.ts instead of hardcoded values
// This ensures consistency across the application
const NON_TERMINAL_STATUSES = JOB_STATUSES.ACTIVE;

type BackgroundJobsContextType = {
  jobs: BackgroundJob[];
  activeJobs: BackgroundJob[];
  isLoading: boolean;
  error: Error | null;
  cancelJob: (jobId: string) => Promise<void>;
  clearHistory: (daysToKeep?: number) => Promise<void>;
  refreshJobs: () => Promise<void>;
};

const BackgroundJobsContext = createContext<BackgroundJobsContextType>({
  jobs: [],
  activeJobs: [],
  isLoading: false,
  error: null,
  cancelJob: async () => {},
  clearHistory: async (daysToKeep?: number) => {},
  refreshJobs: async () => {}
});

export function BackgroundJobsProvider({ children }: { children: ReactNode }) {
  // State
  const [jobs, setJobs] = useState<BackgroundJob[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [activeJobs, setActiveJobs] = useState<BackgroundJob[]>([]);
  const [pollingEnabled, setPollingEnabled] = useState(true);
  const [lastFetchTime, setLastFetchTime] = useState(0);
  const [initialLoad, setInitialLoad] = useState(true);
  
  // Refs to track values without triggering effect reruns
  const activeJobsCountRef = useRef(0);
  const lastFetchTimeRef = useRef(0);
  const isFetchingRef = useRef(false);
  const consecutiveErrorsRef = useRef(0);
  
  // Update refs when state changes
  useEffect(() => {
    activeJobsCountRef.current = activeJobs.length;
  }, [activeJobs]);
  
  useEffect(() => {
    lastFetchTimeRef.current = lastFetchTime;
  }, [lastFetchTime]);
  
  // Fetch jobs from the API
  const fetchJobs = useCallback(async () => {
    // Track the fetch start time for performance monitoring
    const fetchAttemptTime = new Date().toISOString();
    
    // Prevent multiple concurrent fetches
    if (isFetchingRef.current) {
      if (DEBUG_POLLING) {
        console.debug(`[BackgroundJobs] [${fetchAttemptTime}] Skipping fetch - already in progress`);
      }
      return null;
    }
    
    // Set the fetching flag before any async operations
    isFetchingRef.current = true;
    
    try {
      // Clear previous error state when starting a new fetch
      setError(null);
      
      // Only show loading state on initial load, not during polling
      // This prevents UI flicker during background updates
      if (initialLoad) {
        setIsLoading(true);
      }
      
      if (DEBUG_POLLING) {
        console.debug(`[BackgroundJobs] [${fetchAttemptTime}] Fetching jobs: initialLoad=${initialLoad}`);
      }
      
      // Performance tracking - measure fetch duration
      const fetchStartTime = performance.now();
      
      // Use server action directly instead of API route
      const result = await getActiveJobsAction();
      
      // Calculate fetch duration for monitoring
      const fetchDuration = performance.now() - fetchStartTime;
      
      if (DEBUG_POLLING) {
        console.debug(
          `[BackgroundJobs] [${fetchAttemptTime}] Fetch completed in ${Math.round(fetchDuration)}ms with ${
            result.isSuccess ? 'success' : 'failure'
          }${!result.isSuccess ? `: ${result.message}` : ''}`
        );
      }
      
      // Record the fetch time for tracking
      const fetchTimeMs = Date.now();
      setLastFetchTime(fetchTimeMs);
      
      // If request failed, throw an error to be caught below
      if (!result.isSuccess) {
        throw new Error(result.message || "Failed to fetch jobs");
      }
      
      // Reset consecutive errors on success
      consecutiveErrorsRef.current = 0;
      
      // Get jobs from the action result
      const jobsData = result.data || [];

      // Enhanced logging with job status breakdown for monitoring
      if (DEBUG_POLLING && jobsData.length > 0) {
        // Log job details for debugging
        console.debug(`[BackgroundJobs] [${fetchAttemptTime}] Retrieved ${jobsData.length} jobs, including:`,
          jobsData.map(job => ({
            id: job.id,
            status: job.status,
            taskType: job.taskType,
            updatedAt: new Date(job.updatedAt || 0).toISOString()
          }))
        );

        // Count jobs by status for easier monitoring
        const statusCounts = jobsData.reduce((counts, job) => {
          counts[job.status] = (counts[job.status] || 0) + 1;
          return counts;
        }, {} as Record<string, number>);

        console.debug(`[BackgroundJobs] Jobs by status:`, statusCounts);
      }
      
      // Update jobs using functional update pattern to avoid dependency on current jobs state
      // Log job types for debugging
      console.log('[BackgroundJobs] Job types found:', jobsData.map(job => ({
        id: job.id,
        type: job.taskType,
        status: job.status,
        updatedAt: new Date(job.updatedAt || 0).toISOString().substring(0, 19)
      })));

      setJobs(prevJobs => {
        // Only update if jobs have changed to avoid unnecessary re-renders
        if (!areJobArraysEqual(prevJobs, jobsData)) {
          if (DEBUG_POLLING) {
            console.debug(`[BackgroundJobs] [${fetchAttemptTime}] Jobs array updated with ${jobsData.length} jobs`);
          }
          return jobsData;
        }

        if (DEBUG_POLLING) {
          console.debug(`[BackgroundJobs] [${fetchAttemptTime}] No changes in jobs array detected`);
        }
        return prevJobs;
      });
      
      // Update active jobs using functional update pattern
      setActiveJobs(prevActiveJobs => {
        // Filter for active jobs only - these have non-terminal statuses
        const activeJobsList = jobsData.filter(job => 
          NON_TERMINAL_STATUSES.includes(job.status)
        );
        
        // Only update active jobs if they've changed
        if (!areJobArraysEqual(prevActiveJobs, activeJobsList)) {
          if (DEBUG_POLLING) {
            console.debug(`[BackgroundJobs] [${fetchAttemptTime}] Active jobs updated with ${activeJobsList.length} jobs`);
          }
          return activeJobsList;
        }
        
        if (DEBUG_POLLING) {
          console.debug(`[BackgroundJobs] [${fetchAttemptTime}] No changes in active jobs detected`);
        }
        return prevActiveJobs;
      });
      
      return jobsData;
    } catch (err) {
      // Increment consecutive errors counter for monitoring
      consecutiveErrorsRef.current += 1;
      
      // Log the error with additional context
      console.error(`[BackgroundJobs] [${fetchAttemptTime}] Error fetching jobs (attempt #${consecutiveErrorsRef.current}):`, err);
      
      // Update error state for UI display
      setError(err instanceof Error ? err : new Error(String(err)));
      
      // Don't reset existing jobs state on error to prevent UI flicker
      // The next successful fetch will update the state
      return null;
    } finally {
      // ALWAYS reset the fetching flag to allow future fetches
      isFetchingRef.current = false;
      
      // Only update loading and initialLoad state if this was the initial load
      if (initialLoad) {
        setIsLoading(false);
        setInitialLoad(false);
        
        if (DEBUG_POLLING) {
          console.debug(`[BackgroundJobs] [${fetchAttemptTime}] Initial load completed`);
        }
      }
    }
  }, [initialLoad]);
  
  // Manual refresh function for jobs - force a refresh with enhanced error handling
  const refreshJobs = useCallback(async (): Promise<void> => {
    const refreshStartTime = new Date().toISOString();
    
    // Skip if already fetching to prevent overlapping requests
    if (isFetchingRef.current) {
      if (DEBUG_POLLING) {
        console.debug(`[BackgroundJobs] [${refreshStartTime}] Skipping manual refresh - fetch already in progress`);
      }
      return;
    }
    
    if (DEBUG_POLLING) {
      console.debug(`[BackgroundJobs] [${refreshStartTime}] Starting manual refresh`);
    }
    
    // Set fetching flag to prevent concurrent operations
    isFetchingRef.current = true;
    
    try {
      // Reset error state for fresh start
      setError(null);
      // Show loading indicator for manual refresh
      setIsLoading(true);
      
      // Performance tracking
      const fetchStartTime = performance.now();
      
      // Use server action directly
      const result = await getActiveJobsAction();
      
      // Calculate fetch duration
      const fetchDuration = performance.now() - fetchStartTime;
      
      if (DEBUG_POLLING) {
        console.debug(
          `[BackgroundJobs] [${refreshStartTime}] Manual refresh completed in ${Math.round(fetchDuration)}ms with ${
            result.isSuccess ? 'success' : 'failure'
          }${!result.isSuccess ? `: ${result.message}` : ''}`
        );
      }
      
      // Record the fetch time
      const fetchTimeMs = Date.now();
      setLastFetchTime(fetchTimeMs);
      
      if (!result.isSuccess) {
        throw new Error(result.message || "Failed to fetch jobs");
      }
      
      // Get jobs from the action result
      const jobsData = result.data || [];
      
      if (DEBUG_POLLING) {
        console.debug(`[BackgroundJobs] [${refreshStartTime}] Retrieved ${jobsData.length} jobs via manual refresh`); 
      }
      
      // Update jobs using functional update pattern
      setJobs(prevJobs => {
        // Only update if jobs have changed
        if (!areJobArraysEqual(prevJobs, jobsData)) {
          if (DEBUG_POLLING) {
            console.debug(`[BackgroundJobs] [${refreshStartTime}] Updating jobs state with ${jobsData.length} jobs`);
          }
          return jobsData;
        }
        
        if (DEBUG_POLLING) {
          console.debug(`[BackgroundJobs] [${refreshStartTime}] No changes in jobs array detected during manual refresh`);
        }
        return prevJobs;
      });
      
      // Update active jobs using functional update pattern
      setActiveJobs(prevActiveJobs => {
        // Filter for active jobs only - these have non-terminal statuses
        const activeJobsList = jobsData.filter(job => 
          NON_TERMINAL_STATUSES.includes(job.status)
        );
        
        // Only update active jobs if they've changed
        if (!areJobArraysEqual(prevActiveJobs, activeJobsList)) {
          if (DEBUG_POLLING) {
            console.debug(`[BackgroundJobs] [${refreshStartTime}] Updating active jobs with ${activeJobsList.length} jobs`);
          }
          return activeJobsList;
        }
        
        if (DEBUG_POLLING) {
          console.debug(`[BackgroundJobs] [${refreshStartTime}] No changes in active jobs detected during manual refresh`);
        }
        return prevActiveJobs;
      });
    } catch (err) {
      console.error(`[BackgroundJobs] [${refreshStartTime}] Error during manual refresh:`, err);
      
      // Set error state but preserve existing job data
      setError(err instanceof Error ? err : new Error(String(err)));
      
      // Optionally: you could add retry logic here for manual refreshes
    } finally {
      // Always reset UI state
      setIsLoading(false);
      
      // CRITICAL: Reset fetching flag to allow future operations
      isFetchingRef.current = false;
      
      if (DEBUG_POLLING) {
        console.debug(`[BackgroundJobs] [${refreshStartTime}] Manual refresh operation completed`);
      }
    }
  }, []); // No dependencies needed for this function
  
  // Set up polling - enhanced for robustness
  useEffect(() => {
    if (!pollingEnabled) {
      if (DEBUG_POLLING) {
        console.debug(`[BackgroundJobs] Polling disabled, skipping polling setup`);
      }
      return;
    }
    
    // Track consecutive poll failures for exponential backoff
    const failedPollsRef = { count: 0 };
    // Track if component is mounted to avoid state updates after unmount
    const isMountedRef = { current: true };
    // Track interval ID for cleanup
    let intervalId: NodeJS.Timeout | null = null;

    // Create a function inside the effect for polling logic
    const executePoll = async () => {
      // Skip if a fetch is already in progress
      if (isFetchingRef.current) {
        if (DEBUG_POLLING) {
          console.debug(`[BackgroundJobs] Skipping poll - fetch already in progress`);
        }
        return;
      }
      
      // Exit early if component unmounted
      if (!isMountedRef.current) {
        if (DEBUG_POLLING) {
          console.debug(`[BackgroundJobs] Component unmounted, skipping poll`);
        }
        return;
      }
      
      const pollStartTime = new Date().toISOString();
      if (DEBUG_POLLING) {
        console.debug(`[BackgroundJobs] [${pollStartTime}] Starting poll cycle`);
      }
      
      // Set fetching flag to prevent concurrent polls
      isFetchingRef.current = true;
      
      try {
        // Use server action directly instead of API route
        const result = await getActiveJobsAction();
        
        // Record the fetch time
        const fetchTimeMs = Date.now();
        
        // Only update state if still mounted
        if (isMountedRef.current) {
          setLastFetchTime(fetchTimeMs);
          
          if (!result.isSuccess) {
            throw new Error(result.message || "Failed to fetch jobs");
          }
          
          // Reset failed polls counter on success
          failedPollsRef.count = 0;
          
          // Get jobs from the action result
          const jobsData = result.data || [];
          
          if (DEBUG_POLLING) {
            console.debug(`[BackgroundJobs] [${pollStartTime}] Poll success: found ${jobsData.length} jobs`);
          }
          
          // Update jobs using functional update pattern
          setJobs(prevJobs => {
            // Only update if jobs have changed
            if (!areJobArraysEqual(prevJobs, jobsData)) {
              if (DEBUG_POLLING) {
                console.debug(`[BackgroundJobs] [${pollStartTime}] Updating jobs state with ${jobsData.length} jobs`);
              }
              return jobsData;
            }
            return prevJobs;
          });
          
          // Update active jobs using functional update pattern
          setActiveJobs(prevActiveJobs => {
            // Filter for active jobs only - these have non-terminal statuses
            const activeJobsList = jobsData.filter(job => 
              NON_TERMINAL_STATUSES.includes(job.status)
            );
            
            // Only update active jobs if they've changed
            if (!areJobArraysEqual(prevActiveJobs, activeJobsList)) {
              if (DEBUG_POLLING) {
                console.debug(`[BackgroundJobs] [${pollStartTime}] Updating active jobs with ${activeJobsList.length} jobs`);
              }
              return activeJobsList;
            }
            return prevActiveJobs;
          });
        }
      } catch (err) {
        // Only update state if still mounted
        if (isMountedRef.current) {
          // Increment failure counter for exponential backoff
          failedPollsRef.count += 1;
          
          const backoffMultiplier = Math.min(failedPollsRef.count, 5); // Cap at 5x backoff
          
          console.error(`[BackgroundJobs] [${pollStartTime}] Error in polling fetch (failure #${failedPollsRef.count}):`, err);
          console.debug(`[BackgroundJobs] [${pollStartTime}] Next poll will use backoff multiplier: ${backoffMultiplier}x`);
          
          // Set error state but preserve existing jobs data
          setError(err instanceof Error ? err : new Error(String(err)));
          
          // If we have persistent failures, adjust polling interval temporarily
          if (failedPollsRef.count > 2 && intervalId) {
            // Clear current interval and set a new one with backoff
            clearInterval(intervalId);
            
            const backoffInterval = POLLING_INTERVAL * backoffMultiplier;
            
            if (DEBUG_POLLING) {
              console.debug(`[BackgroundJobs] [${pollStartTime}] Setting temporary backoff interval: ${backoffInterval}ms`);
            }
            
            // Set a one-time timeout to try again with backoff
            setTimeout(() => {
              // After backoff, restore normal polling interval
              if (isMountedRef.current) {
                if (DEBUG_POLLING) {
                  console.debug(`[BackgroundJobs] [${pollStartTime}] Restoring normal polling interval after backoff`);
                }
                
                // Only update if still mounted
                if (intervalId) clearInterval(intervalId);
                intervalId = setInterval(executePoll, POLLING_INTERVAL);
                
                // Execute once immediately after backoff
                executePoll();
              }
            }, backoffInterval);
          }
        }
      } finally {
        // Reset fetching flag to allow future polls
        // This is critical to ensure polling doesn't get permanently blocked
        isFetchingRef.current = false;
        
        if (DEBUG_POLLING) {
          console.debug(`[BackgroundJobs] [${pollStartTime}] Poll cycle completed`);
        }
      }
    };
    
    // Fetch jobs initially
    executePoll();
    
    // Set up polling interval
    intervalId = setInterval(executePoll, POLLING_INTERVAL);
    
    if (DEBUG_POLLING) {
      console.debug(`[BackgroundJobs] Polling started with interval: ${POLLING_INTERVAL}ms`);
    }
    
    // Clean up on unmount
    return () => {
      isMountedRef.current = false;
      if (intervalId) clearInterval(intervalId);
      
      if (DEBUG_POLLING) {
        console.debug(`[BackgroundJobs] Polling cleanup: intervals cleared, component marked unmounted`);
      }
    };
  }, [pollingEnabled]); // Only depend on pollingEnabled
  
  // Cancel a job
  const cancelJob = useCallback(async (jobId: string): Promise<void> => {
    try {
      // Cancel the request in the streaming pool if active
      streamingRequestPool.cancelRequest(jobId, "User canceled");
      
      // Call the server action to update job status
      const result = await cancelBackgroundJobAction(jobId);
      
      if (!result.isSuccess) {
        throw new Error(result.message || "Failed to cancel job");
      }
      
      // Update local state optimistically for better UI responsiveness
      setJobs(prev => prev.map(job => 
        job.id === jobId 
          ? { 
              ...job, 
              status: 'canceled' as JobStatus, 
              statusMessage: 'Canceled by user',
              endTime: job.endTime || Date.now(),
              updatedAt: Date.now()
            } 
          : job
      ));
      
      // Remove from active jobs
      setActiveJobs(prev => prev.filter(job => job.id !== jobId));
      
      // Refresh jobs to get the updated state
      await refreshJobs();
    } catch (err) {
      console.error('[BackgroundJobs] Error canceling job:', err);
      // Refresh to get current state if error occurred
      await refreshJobs();
      throw err;
    }
  }, [refreshJobs]);
  
  // Clear job history
  // daysToKeep parameter controls job retention:
  // - When -1: Delete ALL completed/failed/canceled jobs
  // - When undefined or 0: Only deletes very old jobs (90+ days) - this is the default behavior
  // - When > 0: Clears jobs older than the specified number of days from view
  const clearHistory = useCallback(async (daysToKeep?: number): Promise<void> => {
    try {
      const result = await clearJobHistoryAction(daysToKeep);

      if (!result.isSuccess) {
        throw new Error(result.message || "Failed to clear job history");
      }

      // With our new approach, we don't want to clear the local state completely,
      // since we might be keeping many of the jobs. Instead, let refreshJobs
      // fetch the current state after the clear operation.

      // Refresh jobs to ensure we have current state
      await refreshJobs();
    } catch (err) {
      console.error('[BackgroundJobs] Error clearing job history:', err);
      // Refresh to get current state if error occurred
      await refreshJobs();
      throw err;
    }
  }, [refreshJobs]);
  
  // Provide context values to children
  return (
    <BackgroundJobsContext.Provider
      value={{
        jobs,
        activeJobs,
        isLoading,
        error,
        cancelJob,
        clearHistory,
        refreshJobs
      }}
    >
      {children}
    </BackgroundJobsContext.Provider>
  );
}

export function useBackgroundJobs() {
  return useContext(BackgroundJobsContext);
}

export function useBackgroundJob(jobId: string | null) {
  const { jobs, isLoading, error } = useBackgroundJobs();

  const job = jobId ? jobs.find(j => j.id === jobId) || null : null;

  // Create a derived object with properly mapped properties
  const result = {
    job,
    isLoading,
    error,
    // Add derived properties for convenience
    status: job?.status || null,
    response: job?.response || null,
    errorMessage: job?.errorMessage || null,
    metadata: job?.metadata || null  // Expose metadata directly for convenience
  };

  return result;
}

export function useActiveJobsByType(type: string) {
  const { activeJobs } = useBackgroundJobs();
  return activeJobs.filter(job => job.taskType === type);
}