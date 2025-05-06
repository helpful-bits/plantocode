"use client";

import React, { createContext, useContext, useEffect, useState, useCallback, useRef, ReactNode } from 'react';
import { BackgroundJob, JobStatus, ApiType, TaskType, JOB_STATUSES } from '@/types/session-types';
import { getActiveJobsAction, clearJobHistoryAction, cancelBackgroundJobAction } from '@/actions/background-job-actions';
import streamingRequestPool from "../api/streaming-request-pool";
import { safeFetch } from '@/lib/utils';

// Polling interval (ms)
// Background jobs are polled every 1.5 seconds to provide more responsive updates in the UI
const POLLING_INTERVAL = 1500;

// Add a debug flag to control the additional logging
// This can be enabled via localStorage.setItem('DEBUG_BACKGROUND_JOBS', 'true') in browser console
const DEBUG_POLLING = typeof window !== 'undefined' && 
  (localStorage.getItem('DEBUG_BACKGROUND_JOBS') === 'true' || false);

// Deep equality check function for comparing jobs
function areJobsEqual(jobA: BackgroundJob, jobB: BackgroundJob): boolean {
  // Basic validation - both jobs must exist and have the same ID
  if (!jobA || !jobB) return false;
  if (jobA.id !== jobB.id) return false;
  
  // Helper function to safely compare string fields (handling null/undefined values safely)
  const safeStringCompare = (a: string | null | undefined, b: string | null | undefined): boolean => {
    // Convert null/undefined to empty strings for comparison
    const safeA = a === null || a === undefined ? '' : String(a);
    const safeB = b === null || b === undefined ? '' : String(b);
    return safeA === safeB;
  };
  
  // Helper function to safely compare timestamp fields (handling null values safely)
  const safeTimestampCompare = (a: number | null | undefined, b: number | null | undefined): boolean => {
    if (a === null && b === null) return true;
    if (a === undefined && b === undefined) return true;
    if (a === null || a === undefined) return false;
    if (b === null || b === undefined) return false;
    // Use strict equality for timestamps - important for UI rendering decisions
    return a === b;
  };
  
  // Helper to compare numeric values safely with fallbacks
  const safeNumberCompare = (a: number | null | undefined, b: number | null | undefined): boolean => {
    const numA = typeof a === 'number' ? a : 0;
    const numB = typeof b === 'number' ? b : 0;
    return numA === numB;
  };

  // Compare fields that are visible in UI or affect UI behavior
  // These are the fields that should trigger a re-render when they change
  const fieldComparisons = [
    // Status is critically important - defines job card appearance
    { 
      field: 'status', 
      compare: () => jobA.status === jobB.status 
    },
    // Status message shown in UI - may be null/undefined
    { 
      field: 'statusMessage', 
      compare: () => safeStringCompare(jobA.statusMessage, jobB.statusMessage)
    },
    // Error message shown when job fails - may be null/undefined/empty
    { 
      field: 'errorMessage', 
      compare: () => safeStringCompare(jobA.errorMessage, jobB.errorMessage)
    },
    // Response content shown in preview - may be null/undefined
    { 
      field: 'response', 
      compare: () => safeStringCompare(jobA.response, jobB.response)
    },
    // Token counts shown in UI 
    { 
      field: 'tokensReceived', 
      compare: () => safeNumberCompare(jobA.tokensReceived, jobB.tokensReceived)
    },
    { 
      field: 'tokensSent', 
      compare: () => safeNumberCompare(jobA.tokensSent, jobB.tokensSent)
    },
    // Character counts might affect UI and job status perception
    {
      field: 'charsReceived',
      compare: () => safeNumberCompare(jobA.charsReceived, jobB.charsReceived)
    },
    // Timestamps affect UI display (duration, relative time)
    { 
      field: 'startTime', 
      compare: () => safeTimestampCompare(jobA.startTime, jobB.startTime)
    },
    { 
      field: 'endTime', 
      compare: () => safeTimestampCompare(jobA.endTime, jobB.endTime)
    },
    // File outputs shown in UI - may be null/undefined
    { 
      field: 'outputFilePath', 
      compare: () => safeStringCompare(jobA.outputFilePath, jobB.outputFilePath)
    },
    // Use lastUpdate for sorting/organizing in UI - may be null
    { 
      field: 'lastUpdate', 
      compare: () => safeTimestampCompare(jobA.lastUpdate, jobB.lastUpdate)
    },
    // updatedAt is important for detecting changes
    {
      field: 'updatedAt',
      compare: () => safeTimestampCompare(jobA.updatedAt, jobB.updatedAt)
    }
  ];
  
  // For debugging, we log specific differences
  if (DEBUG_POLLING) {
    // Check each field and log differences
    const diffFields = [];
    
    for (const comp of fieldComparisons) {
      if (!comp.compare()) {
        let valueA, valueB;
        
        // Format values for logging based on field type
        switch (comp.field) {
          case 'startTime':
          case 'endTime':
          case 'lastUpdate':
          case 'updatedAt':
            valueA = jobA[comp.field as keyof BackgroundJob] ? new Date(jobA[comp.field as keyof BackgroundJob] as number).toISOString() : 'null';
            valueB = jobB[comp.field as keyof BackgroundJob] ? new Date(jobB[comp.field as keyof BackgroundJob] as number).toISOString() : 'null';
            break;
          case 'response':
          case 'errorMessage':
            valueA = jobA[comp.field as keyof BackgroundJob] ? 
              `"${(jobA[comp.field as keyof BackgroundJob] as string).substring(0, 20)}${(jobA[comp.field as keyof BackgroundJob] as string).length > 20 ? '...' : ''}"` : 'null';
            valueB = jobB[comp.field as keyof BackgroundJob] ? 
              `"${(jobB[comp.field as keyof BackgroundJob] as string).substring(0, 20)}${(jobB[comp.field as keyof BackgroundJob] as string).length > 20 ? '...' : ''}"` : 'null';
            break;
          default:
            valueA = String(jobA[comp.field as keyof BackgroundJob] ?? 'null');
            valueB = String(jobB[comp.field as keyof BackgroundJob] ?? 'null');
        }
        
        diffFields.push(`${comp.field}: ${valueA} !== ${valueB}`);
      }
    }
    
    // Check metadata separately
    const metadataDiffers = hasMetadataChanged(jobA, jobB);
    if (metadataDiffers) {
      diffFields.push('metadata differs');
    }
    
    if (diffFields.length > 0) {
      console.debug(`[BackgroundJobs] Jobs differ for ${jobA.id}:`, diffFields.join(', '));
      return false;
    }
    
    return true;
  } else {
    // Production fast-path without logging
    // First check all comparison fields
    for (const comp of fieldComparisons) {
      if (!comp.compare()) {
        return false;
      }
    }
    
    // Then check metadata (if it's visible in UI)
    return !hasMetadataChanged(jobA, jobB);
  }
}

// Helper function to check if metadata has changed in a way that affects UI
function hasMetadataChanged(jobA: BackgroundJob, jobB: BackgroundJob): boolean {
  // If neither job has metadata, they're equal in this respect
  if (!jobA.metadata && !jobB.metadata) return false;
  
  // If one has metadata and the other doesn't, they differ
  if (!jobA.metadata || !jobB.metadata) return true;
  
  // Define fields that are important for UI updates
  const importantFields = [
    // targetField determines which form field gets updated
    'targetField',
    // Additional fields that affect how the response is processed
    'responseFormat',
    'contentType',
    // Token counts that might be shown in the UI but stored in metadata
    'tokensReceived',
    'tokensSent',
    'charsReceived'
  ];
  
  // Check each important field
  for (const field of importantFields) {
    const valueA = jobA.metadata[field];
    const valueB = jobB.metadata[field];
    
    // Check if either value exists and is different
    if ((valueA !== undefined || valueB !== undefined) && valueA !== valueB) {
      if (DEBUG_POLLING) {
        console.debug(`[BackgroundJobs] Metadata differs for ${field}: ${valueA} !== ${valueB}`);
      }
      return true;
    }
  }
  
  // Check progress data which might appear in metadata for streaming jobs
  if (typeof jobA.metadata.progress === 'number' && typeof jobB.metadata.progress === 'number') {
    if (jobA.metadata.progress !== jobB.metadata.progress) {
      if (DEBUG_POLLING) {
        console.debug(`[BackgroundJobs] Progress differs: ${jobA.metadata.progress} !== ${jobB.metadata.progress}`);
      }
      return true;
    }
  }
  
  return false;
}

// Deep equality check for arrays of jobs
function areJobArraysEqual(arrA: BackgroundJob[], arrB: BackgroundJob[]): boolean {
  // Compare lengths first for a quick check
  if (arrA.length !== arrB.length) {
    if (DEBUG_POLLING) {
      console.debug(`[BackgroundJobs] Job arrays differ in length: ${arrA.length} vs ${arrB.length}`);
    }
    return false;
  }
  
  // Create maps of jobs by ID for efficient lookup and comparison
  const jobsMapA = new Map(arrA.map(job => [job.id, job]));
  const jobsMapB = new Map(arrB.map(job => [job.id, job]));
  
  // Check for job IDs that are in A but not in B
  for (const jobId of jobsMapA.keys()) {
    if (!jobsMapB.has(jobId)) {
      if (DEBUG_POLLING) {
        console.debug(`[BackgroundJobs] Job ${jobId} exists in array A but not in array B`);
      }
      return false;
    }
  }
  
  // Check for job IDs that are in B but not in A
  for (const jobId of jobsMapB.keys()) {
    if (!jobsMapA.has(jobId)) {
      if (DEBUG_POLLING) {
        console.debug(`[BackgroundJobs] Job ${jobId} exists in array B but not in array A`);
      }
      return false;
    }
  }
  
  // At this point, both arrays have the same job IDs
  // Now compare each job in A with its counterpart in B
  let allJobsEqual = true;
  let firstDifferentJobId = null;
  
  for (const jobA of arrA) {
    const jobB = jobsMapB.get(jobA.id);
    // We know jobB exists because we checked keys above
    if (!areJobsEqual(jobA, jobB!)) {
      allJobsEqual = false;
      firstDifferentJobId = jobA.id;
      // In debug mode, we'll continue to log all differences
      if (!DEBUG_POLLING) {
        break; // Exit early if not in debug mode
      }
    }
  }
  
  if (!allJobsEqual && DEBUG_POLLING) {
    console.debug(`[BackgroundJobs] Job arrays differ in content. First different job: ${firstDifferentJobId}`);
  }
  
  return allJobsEqual;
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
  clearHistory: () => Promise<void>;
  refreshJobs: () => Promise<void>;
};

const BackgroundJobsContext = createContext<BackgroundJobsContextType>({
  jobs: [],
  activeJobs: [],
  isLoading: false,
  error: null,
  cancelJob: async () => {},
  clearHistory: async () => {},
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
      
      if (DEBUG_POLLING && jobsData.length > 0) {
        console.debug(`[BackgroundJobs] [${fetchAttemptTime}] Retrieved ${jobsData.length} jobs, including:`, 
          jobsData.map(job => ({
            id: job.id,
            status: job.status,
            taskType: job.taskType,
            updatedAt: new Date(job.updatedAt || 0).toISOString()
          }))
        );
      }
      
      // Update jobs using functional update pattern to avoid dependency on current jobs state
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
  const clearHistory = useCallback(async (): Promise<void> => {
    try {
      const result = await clearJobHistoryAction();
      
      if (!result.isSuccess) {
        throw new Error(result.message || "Failed to clear job history");
      }
      
      // Clear local state
      setJobs([]);
      setActiveJobs([]);
      
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
    errorMessage: job?.errorMessage || null
  };
  
  return result;
}

export function useActiveJobsByType(type: string) {
  const { activeJobs } = useBackgroundJobs();
  return activeJobs.filter(job => job.taskType === type);
}