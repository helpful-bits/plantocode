import { useMemo } from "react";

import { type BackgroundJob } from "@/types/session-types";
import { getParsedMetadata } from '../utils';

export function useJobFiltering(jobs: BackgroundJob[], isLoading: boolean) {
  const { allJobsSorted, hasJobs } = useMemo(() => {
    const uniqueJobs = Array.from(
      jobs.reduce((map, job) => {
        const existing = map.get(job.id);
        const jobTime = job.updatedAt || job.createdAt || 0;
        const existingTime = existing ? (existing.updatedAt || existing.createdAt || 0) : 0;

        if (!existing || jobTime > existingTime) {
          map.set(job.id, job);
        }
        return map;
      }, new Map<string, BackgroundJob>()).values()
    );

    const workflowGroups = new Map<string, BackgroundJob[]>();
    const standaloneJobs: BackgroundJob[] = [];

    uniqueJobs.forEach((job) => {
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

    workflowGroups.forEach((jobs) => {
      jobs.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    });

    standaloneJobs.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

    const workflowsWithNewest = Array.from(workflowGroups.entries()).map(([workflowId, jobs]) => ({
      workflowId,
      jobs,
      newestTime: Math.max(...jobs.map(j => j.createdAt || 0))
    }));

    workflowsWithNewest.sort((a, b) => b.newestTime - a.newestTime);

    const sortedJobs: BackgroundJob[] = [];
    let workflowIndex = 0;
    let standaloneIndex = 0;

    while (workflowIndex < workflowsWithNewest.length || standaloneIndex < standaloneJobs.length) {
      const hasWorkflow = workflowIndex < workflowsWithNewest.length;
      const hasStandalone = standaloneIndex < standaloneJobs.length;

      if (hasWorkflow && hasStandalone) {
        const workflowNewest = workflowsWithNewest[workflowIndex].newestTime;
        const standaloneNewest = standaloneJobs[standaloneIndex].createdAt || 0;

        if (workflowNewest >= standaloneNewest) {
          sortedJobs.push(...workflowsWithNewest[workflowIndex].jobs);
          workflowIndex++;
        } else {
          sortedJobs.push(standaloneJobs[standaloneIndex]);
          standaloneIndex++;
        }
      } else if (hasWorkflow) {
        sortedJobs.push(...workflowsWithNewest[workflowIndex].jobs);
        workflowIndex++;
      } else if (hasStandalone) {
        sortedJobs.push(standaloneJobs[standaloneIndex]);
        standaloneIndex++;
      }
    }

    return {
      allJobsSorted: sortedJobs,
      hasJobs: uniqueJobs.length > 0,
    };
  }, [jobs]);

  const shouldShowLoading = isLoading && jobs.length === 0;
  const shouldShowEmpty = !shouldShowLoading && !hasJobs;

  return {
    allJobsSorted,
    hasJobs,
    shouldShowLoading,
    shouldShowEmpty,
  };
}
