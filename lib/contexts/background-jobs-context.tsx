"use client";

import React, { createContext, useContext, useEffect, useState, useCallback, ReactNode } from 'react';
import { BackgroundJob, BackgroundJobStatus } from '@/lib/types/background-jobs';
import { getActiveJobsAction, clearJobHistoryAction, cancelBackgroundJobAction } from '@/actions/background-job-actions';
import streamingRequestPool from "../api/streaming-request-pool";
import { safeFetch } from '@/lib/utils';

// Polling interval (ms)
const POLLING_INTERVAL = 2000;

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
  
  // Fetch jobs from the API
  const fetchJobs = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      
      // Use server action directly instead of API route
      const result = await getActiveJobsAction();
      
      if (!result.isSuccess) {
        throw new Error(result.message || "Failed to fetch jobs");
      }
      
      // Get jobs from the action result
      const jobsData = result.data || [];
      
      // Update state with fetched jobs
      setJobs(jobsData);
      
      // Filter active jobs (those that are still running)
      const activeJobsList = jobsData.filter((job) => 
        job.status === 'running' || job.status === 'queued' || job.status === 'preparing'
      );
      setActiveJobs(activeJobsList);
      
      return jobsData;
    } catch (err) {
      console.error('[BackgroundJobs] Error fetching jobs:', err);
      setError(err instanceof Error ? err : new Error(String(err)));
      return [];
    } finally {
      setIsLoading(false);
    }
  }, []);
  
  // Manual refresh function for jobs
  const refreshJobs = useCallback(async () => {
    return fetchJobs();
  }, [fetchJobs]);
  
  // Set up polling
  useEffect(() => {
    if (!pollingEnabled) return;
    
    // Fetch jobs initially
    fetchJobs();
    
    // Set up polling interval
    const interval = setInterval(() => {
      fetchJobs();
    }, POLLING_INTERVAL);
    
    // Clean up on unmount
    return () => {
      clearInterval(interval);
    };
  }, [pollingEnabled, fetchJobs]);
  
  // Cancel a job
  const cancelJob = useCallback(async (jobId: string): Promise<void> => {
    try {
      // Cancel the request in the streaming pool if active
      streamingRequestPool.cancelRequest(jobId, "User canceled");
      
      // Call the API to update job status
      await cancelBackgroundJobAction(jobId);
      
      // Update local state
      setJobs(prev => prev.map(job => 
        job.id === jobId 
          ? { ...job, status: 'cancelled' as BackgroundJobStatus, statusMessage: 'Canceled by user' } 
          : job
      ));
      
      // Refresh jobs to get the updated state
      await fetchJobs();
    } catch (err) {
      console.error('[BackgroundJobs] Error canceling job:', err);
      throw err;
    }
  }, [fetchJobs]);
  
  // Clear job history
  const clearHistory = useCallback(async (): Promise<void> => {
    try {
      await clearJobHistoryAction();
      
      // Clear local state
      setJobs([]);
      setActiveJobs([]);
      
      // Refresh jobs to ensure we have current state
      await fetchJobs();
    } catch (err) {
      console.error('[BackgroundJobs] Error clearing job history:', err);
      throw err;
    }
  }, [fetchJobs]);
  
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

export const useBackgroundJobs = () => useContext(BackgroundJobsContext);

export function useBackgroundJob(jobId: string | null) {
  const { jobs } = useBackgroundJobs();
  
  if (!jobId) return null;
  
  return jobs.find(job => job.id === jobId) || null;
}

export function useActiveJobsByType(type: string) {
  const { activeJobs } = useBackgroundJobs();
  
  return activeJobs.filter(job => job.type === type);
}