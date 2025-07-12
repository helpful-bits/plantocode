import { useState, useEffect, useMemo } from "react";

import { type BackgroundJob } from "@/types/session-types";
import { createLogger } from "@/utils/logger";
import { getParsedMetadata } from '../utils';

const logger = createLogger({ namespace: "JobFiltering" });

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
  const { allJobsSorted, hasJobs } = useMemo(() => {
      // Track start time for performance measurement
      const startTime = performance.now();

      // Use cached jobs during loading to prevent UI flicker
      const jobsToUse = isLoading && cachedJobs.length > 0 ? cachedJobs : jobs;

      // Deduplicate jobs by ID, keeping the most recent version
      const uniqueJobs = Array.from(
        jobsToUse.reduce((map, job) => {
          const existing = map.get(job.id);
          if (!existing || (job.updatedAt && existing.updatedAt && new Date(job.updatedAt) > new Date(existing.updatedAt))) {
            map.set(job.id, job);
          } else if (!existing) {
            map.set(job.id, job);
          }
          return map;
        }, new Map<string, BackgroundJob>()).values()
      );

      // No filtering needed - workflow jobs are already filtered at the state level
      const filteredJobs = uniqueJobs;

      logger.debug(
        `Sorting ${filteredJobs.length} jobs (filtered from ${uniqueJobs.length} unique jobs, original count: ${jobsToUse.length}, cached=${isLoading && cachedJobs.length > 0})`
      );

      // Log job status distribution for debugging
      const statusCounts = filteredJobs.reduce(
        (acc: Record<string, number>, job: BackgroundJob) => {
          acc[job.status] = (acc[job.status] || 0) + 1;
          return acc;
        },
        {} as Record<string, number>
      );

      logger.debug(
        `Jobs status distribution:`,
        statusCounts
      );

      // Group jobs by workflowId
      const workflowGroups = new Map<string, BackgroundJob[]>();
      const standaloneJobs: BackgroundJob[] = [];
      
      filteredJobs.forEach((job: BackgroundJob) => {
        const meta = getParsedMetadata(job.metadata);
        const workflowId = meta?.workflowId;
        if (workflowId) {
          const group = workflowGroups.get(workflowId) || [];
          group.push(job);
          workflowGroups.set(workflowId, group);
        } else {
          standaloneJobs.push(job);
        }
      });
      
      // Sort jobs within each workflow group by creation time (newest first, oldest at bottom)
      workflowGroups.forEach((jobs) => {
        jobs.sort((a: BackgroundJob, b: BackgroundJob) => 
          (b.createdAt || 0) - (a.createdAt || 0)
        );
      });
      
      // Sort standalone jobs by creation time (newest first)
      standaloneJobs.sort((a: BackgroundJob, b: BackgroundJob) =>
        (b.createdAt || 0) - (a.createdAt || 0)
      );
      
      // Get the newest job from each workflow to determine workflow order
      const workflowsWithNewest = Array.from(workflowGroups.entries()).map(([workflowId, jobs]) => ({
        workflowId,
        jobs,
        newestTime: Math.max(...jobs.map(j => j.createdAt || 0))
      }));
      
      // Sort workflows by their newest job time (newest first)
      workflowsWithNewest.sort((a, b) => b.newestTime - a.newestTime);
      
      // Interleave workflow bundles with standalone jobs based on timing
      const sortedJobs: BackgroundJob[] = [];
      let workflowIndex = 0;
      let standaloneIndex = 0;
      
      while (workflowIndex < workflowsWithNewest.length || standaloneIndex < standaloneJobs.length) {
        // Check if we have jobs from both categories
        const hasWorkflow = workflowIndex < workflowsWithNewest.length;
        const hasStandalone = standaloneIndex < standaloneJobs.length;
        
        if (hasWorkflow && hasStandalone) {
          // Compare newest times
          const workflowNewest = workflowsWithNewest[workflowIndex].newestTime;
          const standaloneNewest = standaloneJobs[standaloneIndex].createdAt || 0;
          
          if (workflowNewest >= standaloneNewest) {
            // Add entire workflow bundle
            sortedJobs.push(...workflowsWithNewest[workflowIndex].jobs);
            workflowIndex++;
          } else {
            // Add standalone job
            sortedJobs.push(standaloneJobs[standaloneIndex]);
            standaloneIndex++;
          }
        } else if (hasWorkflow) {
          // Only workflows left
          sortedJobs.push(...workflowsWithNewest[workflowIndex].jobs);
          workflowIndex++;
        } else if (hasStandalone) {
          // Only standalone jobs left
          sortedJobs.push(standaloneJobs[standaloneIndex]);
          standaloneIndex++;
        }
      }

      const duration = performance.now() - startTime;
      logger.debug(
        `Sorted ${sortedJobs.length} jobs in ${Math.round(duration)}ms`
      );

      return {
        allJobsSorted: sortedJobs,
        hasJobs: filteredJobs.length > 0,
      };
    }, [jobs, cachedJobs, isLoading]);

  // Show loading only on first load, otherwise show cached content during updates
  const shouldShowLoading = initialLoad && isLoading && cachedJobs.length === 0;
  const shouldShowEmpty = !shouldShowLoading && !hasJobs;

  return {
    allJobsSorted,
    hasJobs,
    shouldShowLoading,
    shouldShowEmpty,
  };
}
