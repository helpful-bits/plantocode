"use client";

import React, { createContext, useContext, useEffect, useState, useCallback, useRef, ReactNode } from 'react';
import { BackgroundJob, JobStatus, ApiType, TaskType } from '@/types/session-types';
import { getActiveJobsAction, clearJobHistoryAction, cancelBackgroundJobAction } from '@/actions/background-job-actions';
import streamingRequestPool from "../api/streaming-request-pool";
import { safeFetch } from '@/lib/utils';

// Polling interval (ms)
// The background jobs are polled every 30 seconds, but to minimize unnecessary API calls:
// 1. When active jobs exist, the polling occurs at the full interval (30s)
// 2. When no active jobs exist, polling only happens if >60s has passed since the last poll
// This helps reduce the number of API calls when the system is idle
const POLLING_INTERVAL = 30000;

// Add a debug flag to control the additional logging
const DEBUG_POLLING = false;

// Deep equality check function for comparing jobs
function areJobsEqual(jobA: BackgroundJob, jobB: BackgroundJob): boolean {
  if (!jobA || !jobB) return false;
  if (jobA.id !== jobB.id) return false;
  
  // Quick check for timestamp updates - if updatedAt changed, jobs likely differ
  if (jobA.updatedAt !== jobB.updatedAt) return false;
  
  // Compare key fields that should trigger UI updates when changed
  if (
    jobA.status !== jobB.status ||
    jobA.statusMessage !== jobB.statusMessage ||
    jobA.errorMessage !== jobB.errorMessage ||
    jobA.response !== jobB.response ||
    jobA.tokensReceived !== jobB.tokensReceived ||
    jobA.tokensSent !== jobB.tokensSent ||
    jobA.endTime !== jobB.endTime ||
    jobA.startTime !== jobB.startTime ||
    jobA.lastUpdate !== jobB.lastUpdate ||
    jobA.xmlPath !== jobB.xmlPath
  ) {
    return false;
  }
  
  // Deep compare metadata only if it exists in both
  const metadataEqual = (!jobA.metadata && !jobB.metadata) || 
    (jobA.metadata && jobB.metadata && 
     JSON.stringify(jobA.metadata) === JSON.stringify(jobB.metadata));
  
  return !!metadataEqual;
}

// Deep equality check for arrays of jobs
function areJobArraysEqual(arrA: BackgroundJob[], arrB: BackgroundJob[]): boolean {
  if (arrA.length !== arrB.length) return false;
  
  // Create a map of jobs by ID for efficient lookup
  const jobsMapB = new Map(arrB.map(job => [job.id, job]));
  
  // Check if all jobs in A match their counterparts in B
  for (const jobA of arrA) {
    const jobB = jobsMapB.get(jobA.id);
    if (!jobB || !areJobsEqual(jobA, jobB)) {
      return false;
    }
  }
  
  return true;
}

// List of non-terminal statuses for active jobs
const NON_TERMINAL_STATUSES = ['idle', 'preparing', 'running', 'queued', 'created'];

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
  
  // Update refs when state changes
  useEffect(() => {
    activeJobsCountRef.current = activeJobs.length;
  }, [activeJobs]);
  
  useEffect(() => {
    lastFetchTimeRef.current = lastFetchTime;
  }, [lastFetchTime]);
  
  // Fetch jobs from the API
  const fetchJobs = useCallback(async () => {
    // Prevent multiple concurrent fetches
    if (isFetchingRef.current) {
      if (DEBUG_POLLING) {
        console.debug(`[BackgroundJobs] [${new Date().toISOString()}] Skipping fetch - already in progress`);
      }
      return null;
    }
    
    isFetchingRef.current = true;
    
    try {
      setError(null);
      
      // Only show loading state on initial load, not during polling
      if (initialLoad) {
        setIsLoading(true);
      }
      
      if (DEBUG_POLLING) {
        console.debug(`[BackgroundJobs] [${new Date().toISOString()}] Fetching jobs: initialLoad=${initialLoad}`);
      }
      
      // Use server action directly instead of API route
      const fetchStartTime = performance.now();
      const result = await getActiveJobsAction();
      const fetchDuration = performance.now() - fetchStartTime;
      
      if (DEBUG_POLLING) {
        console.debug(`[BackgroundJobs] [${new Date().toISOString()}] Fetch completed in ${Math.round(fetchDuration)}ms with ${result.isSuccess ? 'success' : 'failure'}`);
      }
      
      // Record the fetch time
      const fetchTimeMs = Date.now();
      setLastFetchTime(fetchTimeMs);
      
      if (!result.isSuccess) {
        throw new Error(result.message || "Failed to fetch jobs");
      }
      
      // Get jobs from the action result
      const jobsData = result.data || [];
      
      // Update jobs using functional update pattern to avoid dependency on current jobs state
      setJobs(prevJobs => {
        // Only update if jobs have changed
        if (!areJobArraysEqual(prevJobs, jobsData)) {
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
          return activeJobsList;
        }
        return prevActiveJobs;
      });
      
      return jobsData;
    } catch (err) {
      console.error('[BackgroundJobs] Error fetching jobs:', err);
      setError(err instanceof Error ? err : new Error(String(err)));
      
      // Don't reset existing jobs state on error to prevent UI flicker
      return null; // Return null instead of using the jobs state variable
    } finally {
      if (initialLoad) {
        setIsLoading(false);
        setInitialLoad(false);
      }
      isFetchingRef.current = false;
    }
  }, [initialLoad]);
  
  // Manual refresh function for jobs - force a refresh
  const refreshJobs = useCallback(async (): Promise<void> => {
    // Skip if already fetching to prevent overlapping requests
    if (isFetchingRef.current) {
      if (DEBUG_POLLING) {
        console.debug(`[BackgroundJobs] [${new Date().toISOString()}] Skipping manual refresh - fetch already in progress`);
      }
      return;
    }
    
    isFetchingRef.current = true;
    try {
      setError(null);
      setIsLoading(true);
      
      if (DEBUG_POLLING) {
        console.debug(`[BackgroundJobs] [${new Date().toISOString()}] Manual refresh triggered`);
      }
      
      // Use server action directly
      const result = await getActiveJobsAction();
      
      // Record the fetch time
      const fetchTimeMs = Date.now();
      setLastFetchTime(fetchTimeMs);
      
      if (!result.isSuccess) {
        throw new Error(result.message || "Failed to fetch jobs");
      }
      
      // Get jobs from the action result
      const jobsData = result.data || [];
      
      // Update jobs using functional update pattern
      setJobs(prevJobs => {
        // Only update if jobs have changed
        if (!areJobArraysEqual(prevJobs, jobsData)) {
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
          return activeJobsList;
        }
        return prevActiveJobs;
      });
    } catch (err) {
      console.error('[BackgroundJobs] Error refreshing jobs:', err);
      setError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setIsLoading(false);
      isFetchingRef.current = false;
    }
  }, []);
  
  // Set up polling
  useEffect(() => {
    if (!pollingEnabled) return;
    
    // Create a function inside the effect for polling logic
    const executeFetch = async () => {
      // Skip if a fetch is already in progress
      if (isFetchingRef.current) {
        if (DEBUG_POLLING) {
          console.debug(`[BackgroundJobs] [${new Date().toISOString()}] Skipping poll - fetch already in progress`);
        }
        return;
      }
      
      // Determine if we should poll:
      // - If there are active jobs, always poll
      // - If no active jobs, poll only every 120 seconds (2 minutes)
      const now = Date.now();
      const timeSinceLastFetch = now - lastFetchTimeRef.current;
      const shouldPoll = activeJobsCountRef.current > 0 || timeSinceLastFetch > 120000;
      
      if (DEBUG_POLLING) {
        console.debug(`[BackgroundJobs] [${new Date().toISOString()}] Polling check: activeJobs=${activeJobsCountRef.current}, timeSinceLastFetch=${Math.round(timeSinceLastFetch/1000)}s, shouldPoll=${shouldPoll}`);
      }
      
      if (shouldPoll) {
        if (DEBUG_POLLING) {
          console.debug(`[BackgroundJobs] [${new Date().toISOString()}] Refreshing jobs: reason=${activeJobsCountRef.current > 0 ? 'active jobs present' : 'time threshold exceeded'}`);
        }
        
        isFetchingRef.current = true;
        try {
          // Use server action directly instead of API route
          const result = await getActiveJobsAction();
          
          // Record the fetch time
          const fetchTimeMs = Date.now();
          setLastFetchTime(fetchTimeMs);
          
          if (!result.isSuccess) {
            throw new Error(result.message || "Failed to fetch jobs");
          }
          
          // Get jobs from the action result
          const jobsData = result.data || [];
          
          // Update jobs using functional update pattern
          setJobs(prevJobs => {
            // Only update if jobs have changed
            if (!areJobArraysEqual(prevJobs, jobsData)) {
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
              return activeJobsList;
            }
            return prevActiveJobs;
          });
        } catch (err) {
          console.error('[BackgroundJobs] Error in polling fetch:', err);
          setError(err instanceof Error ? err : new Error(String(err)));
        } finally {
          isFetchingRef.current = false;
        }
      }
    };
    
    // Fetch jobs initially
    executeFetch();
    
    // Set up polling interval
    const interval = setInterval(executeFetch, POLLING_INTERVAL);
    
    // Clean up on unmount
    return () => {
      clearInterval(interval);
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