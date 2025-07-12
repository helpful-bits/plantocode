"use client";

import { useMemo } from "react";
import { type BackgroundJob } from "@/types/session-types";

import { EmptyState, LoadingState } from "../sidebar-states";
import { JobCard } from "../job-card";
import { getParsedMetadata } from "../utils";

interface JobContentProps {
  shouldShowLoading: boolean;
  shouldShowEmpty: boolean;
  allJobsSorted: BackgroundJob[];
  handleCancel: (jobId: string) => Promise<void>;
  handleDelete: (jobId: string) => Promise<void>;
  isCancelling: Record<string, boolean>;
  isDeleting: Record<string, boolean>;
  onSelect: (job: BackgroundJob) => void;
  onApplyFiles?: (job: BackgroundJob) => void;
  currentSessionId?: string;
}

/**
 * Component for rendering the scrollable job content area
 */
export const JobContent = ({
  shouldShowLoading,
  shouldShowEmpty,
  allJobsSorted,
  handleCancel,
  handleDelete,
  isCancelling,
  isDeleting,
  onSelect,
  onApplyFiles,
  currentSessionId,
}: JobContentProps) => {
  // Group jobs by workflow
  const jobGroups = useMemo(() => {
    const groups: { workflowId: string | null; jobs: BackgroundJob[] }[] = [];
    const processedJobs = new Set<string>();
    
    allJobsSorted.forEach((job) => {
      if (processedJobs.has(job.id)) return;
      
      const metadata = getParsedMetadata(job.metadata);
      const workflowId = metadata?.workflowId;
      
      if (workflowId) {
        // Find all jobs with the same workflow ID
        const workflowJobs = allJobsSorted.filter((j) => {
          const jMeta = getParsedMetadata(j.metadata);
          return jMeta?.workflowId === workflowId;
        });
        
        // Mark all workflow jobs as processed
        workflowJobs.forEach(j => processedJobs.add(j.id));
        
        groups.push({ workflowId, jobs: workflowJobs });
      } else {
        // Standalone job
        processedJobs.add(job.id);
        groups.push({ workflowId: null, jobs: [job] });
      }
    });
    
    return groups;
  }, [allJobsSorted]);
  
  return (
    <div className="flex flex-col w-full min-h-full px-3 py-3 pb-24 relative">
      {shouldShowLoading ? (
        <LoadingState />
      ) : shouldShowEmpty ? (
        <EmptyState />
      ) : (
        <div className="w-full max-w-full overflow-hidden">
          {jobGroups.map((group, groupIndex) => {
            const isWorkflowGroup = group.workflowId !== null && group.jobs.length > 1;
            
            return (
              <div
                key={group.workflowId || `standalone-${groupIndex}`}
                className={groupIndex > 0 ? "mt-3" : ""}
              >
                <div className={isWorkflowGroup ? "relative border border-dashed border-muted-foreground/40 rounded-lg p-[3px]" : ""}>
                  {group.jobs.map((job, jobIndex) => (
                    <div key={job.id} className={jobIndex > 0 ? "mt-3" : ""}>
                      <JobCard
                        job={job}
                        handleCancel={handleCancel}
                        handleDelete={handleDelete}
                        isCancelling={isCancelling}
                        isDeleting={isDeleting}
                        onSelect={onSelect}
                        onApplyFiles={onApplyFiles}
                        currentSessionId={currentSessionId}
                      />
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

JobContent.displayName = "JobContent";
