import { useState, useEffect, useMemo } from 'react';
import { BackgroundJob, JOB_STATUSES } from '@core/types/session-types';

// Enable this for extensive logging of job filtering and sorting
// Define this outside of the hook entirely to avoid it being included in dependency arrays
const DEBUG_JOB_FILTERING = false;

/**
 * Custom hook for filtering and sorting jobs in the background jobs sidebar
 */
export function useJobFiltering(jobs: BackgroundJob[], isLoading: boolean) {
  // Keep a cached version of jobs to show during loading
  const [cachedJobs, setCachedJobs] = useState<BackgroundJob[]>([]);
  const [initialLoad, setInitialLoad] = useState(true);
  
  // Update cached jobs whenever we get new jobs
  useEffect(() => {
    if (jobs.length > 0) {
      setCachedJobs(jobs);
      if (initialLoad) setInitialLoad(false);
    }
  }, [jobs, initialLoad]);
  
  // Memoize job filtering to prevent unnecessary recalculations on render
  const { activeJobsToShow, completedJobs, failedJobs, hasJobs } = useMemo(() => {
    // Track start time for performance measurement
    const startTime = DEBUG_JOB_FILTERING ? performance.now() : 0;
    
    // Use cached jobs during loading to prevent UI flicker
    const jobsToUse = isLoading && cachedJobs.length > 0 ? cachedJobs : jobs;
    
    if (DEBUG_JOB_FILTERING) {
      console.debug(`[useJobFiltering] Filtering ${jobsToUse.length} jobs (cached=${isLoading && cachedJobs.length > 0})`);
      
      // Log job status distribution for debugging
      const statusCounts = jobsToUse.reduce((acc, job) => {
        acc[job.status] = (acc[job.status] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);
      
      console.debug(`[useJobFiltering] Jobs status distribution:`, statusCounts);
    }
    
    // Use the centralized constants for status categories to ensure consistency
    const ACTIVE_STATUSES = JOB_STATUSES.ACTIVE;
    const COMPLETED_STATUSES = JOB_STATUSES.COMPLETED;
    const FAILED_STATUSES = JOB_STATUSES.FAILED;
    
    // Create a safe compare function for timestamps that handles undefined/null values
    const safeCompare = (
      a: BackgroundJob,
      b: BackgroundJob,
      // Array of property names to check in order of preference
      props: Array<keyof BackgroundJob>
    ) => {
      // Find the first valid property to compare
      for (const prop of props) {
        const aVal = a[prop] as number | undefined | null;
        const bVal = b[prop] as number | undefined | null;
        
        // Only use this property if both values are valid numbers
        if (typeof aVal === 'number' && typeof bVal === 'number') {
          return bVal - aVal; // Descending order (newest first)
        }
      }
      // Fallback to creation time - every job should have this
      return (b.createdAt || 0) - (a.createdAt || 0);
    };
    
    // Active jobs - filter for status and sort by most recently updated
    const activeList = jobsToUse.filter(job => 
      ACTIVE_STATUSES.includes(job.status)
    ).sort((a, b) => safeCompare(a, b, ['updatedAt', 'startTime', 'lastUpdate']));
    
    // Completed jobs - filter for status and sort by most recently completed 
    const completedList = jobsToUse.filter(job => 
      COMPLETED_STATUSES.includes(job.status)
    ).sort((a, b) => safeCompare(a, b, ['endTime', 'updatedAt', 'lastUpdate']));
    
    // Failed or canceled jobs - filter for status and sort by most recent
    const failedList = jobsToUse.filter(job => 
      FAILED_STATUSES.includes(job.status)
    ).sort((a, b) => safeCompare(a, b, ['endTime', 'updatedAt', 'lastUpdate']));
    
    if (DEBUG_JOB_FILTERING) {
      const duration = performance.now() - startTime;
      console.debug(`[useJobFiltering] Filtered jobs in ${Math.round(duration)}ms:`, {
        active: activeList.length,
        completed: completedList.length,
        failed: failedList.length,
        total: jobsToUse.length,
      });
    }
    
    return {
      activeJobsToShow: activeList,
      completedJobs: completedList,
      failedJobs: failedList,
      hasJobs: jobsToUse.length > 0
    };
  // DEBUG_JOB_FILTERING is a constant and doesn't need to be in deps
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobs, cachedJobs, isLoading]);
  
  // Show loading only on first load, otherwise show cached content during updates
  const shouldShowLoading = initialLoad && isLoading && cachedJobs.length === 0;
  const shouldShowEmpty = !shouldShowLoading && !hasJobs;
  
  return {
    activeJobsToShow,
    completedJobs,
    failedJobs,
    hasJobs,
    shouldShowLoading,
    shouldShowEmpty
  };
}