"use client";

import { useMemo, memo } from "react";
import { type BackgroundJob } from "@/types/session-types";

import { EmptyState, LoadingState } from "../sidebar-states";
import { JobCard } from "../job-card";
import { getParsedMetadata } from "../utils";

// Memoized JobCard to prevent unnecessary re-renders
const MemoizedJobCard = memo(JobCard, (prevProps, nextProps) => {
  // Custom comparison function for better performance
  return (
    prevProps.job.id === nextProps.job.id &&
    prevProps.job.status === nextProps.job.status &&
    prevProps.job.response === nextProps.job.response &&
    prevProps.job.updatedAt === nextProps.job.updatedAt &&
    prevProps.job.actualCost === nextProps.job.actualCost &&
    prevProps.job.tokensSent === nextProps.job.tokensSent &&
    prevProps.job.tokensReceived === nextProps.job.tokensReceived &&
    prevProps.isCancelling[prevProps.job.id] === nextProps.isCancelling[nextProps.job.id] &&
    prevProps.isDeleting[prevProps.job.id] === nextProps.isDeleting[nextProps.job.id] &&
    prevProps.currentSessionId === nextProps.currentSessionId &&
    prevProps.hasContinuationJob === nextProps.hasContinuationJob &&
    prevProps.isWorkflowActive === nextProps.isWorkflowActive &&
    prevProps.webSearchSystemPrompt === nextProps.webSearchSystemPrompt
  );
});

interface JobContentProps {
  shouldShowLoading: boolean;
  shouldShowEmpty: boolean;
  allJobsSorted: BackgroundJob[];
  handleCancel: (jobId: string) => Promise<void>;
  handleDelete: (jobId: string) => Promise<void>;
  isCancelling: Record<string, boolean>;
  isDeleting: Record<string, boolean>;
  onSelect: (job: BackgroundJob) => void;
  onApplyFiles?: (job: BackgroundJob) => Promise<void>;
  onContinueWorkflow?: (job: BackgroundJob) => Promise<void>;
  currentSessionId?: string;
  webSearchSystemPrompt?: string;
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
  onContinueWorkflow,
  currentSessionId,
  webSearchSystemPrompt,
}: JobContentProps) => {
  // Optimized job grouping with metadata caching and workflow status
  const { jobGroups, continuationJobsMap } = useMemo(() => {
    const groups: { workflowId: string | null; jobs: BackgroundJob[]; isActive: boolean }[] = [];
    const processedJobs = new Set<string>();
    const metadataCache = new Map<string, any>();
    const continuationJobs = new Map<string, boolean>(); // Map of jobId -> hasContinuation
    const activeWorkflowIds = new Set<string>();
    const workflowsWithWebSearch = new Map<string, boolean>(); // Map of workflowId -> hasWebSearchExecution
    
    // Helper to get cached metadata
    const getCachedMetadata = (job: BackgroundJob) => {
      if (!metadataCache.has(job.id)) {
        metadataCache.set(job.id, getParsedMetadata(job.metadata));
      }
      return metadataCache.get(job.id);
    };
    
    // First pass: identify continuation jobs, active workflows, and workflows with web search execution
    allJobsSorted.forEach((job) => {
      const metadata = getCachedMetadata(job);
      
      // Check if this is a web_search_execution that continues from another job
      if (job.taskType === 'web_search_execution' && metadata?.continuedFromJob) {
        continuationJobs.set(metadata.continuedFromJob, true);
      }
      
      // Check if this is a web_search_execution in a workflow
      if (job.taskType === 'web_search_execution' && metadata?.workflowId) {
        workflowsWithWebSearch.set(metadata.workflowId, true);
      }
      
      // Check if this job's workflow is active
      if (metadata?.workflowId) {
        // Check if any job in the workflow is still running
        const workflowJobs = allJobsSorted.filter((j) => {
          const jMeta = getCachedMetadata(j);
          return jMeta?.workflowId === metadata.workflowId;
        });
        
        const hasActiveJob = workflowJobs.some(j => 
          ['running', 'processingStream', 'queued', 'created', 'preparing'].includes(j.status)
        );
        
        if (hasActiveJob) {
          activeWorkflowIds.add(metadata.workflowId);
        }
      }
    });
    
    // For web_search_prompts_generation jobs in workflows, mark them as having continuation if the workflow has web_search_execution
    allJobsSorted.forEach((job) => {
      const metadata = getCachedMetadata(job);
      if (job.taskType === 'web_search_prompts_generation' && 
          metadata?.workflowId && 
          workflowsWithWebSearch.has(metadata.workflowId)) {
        continuationJobs.set(job.id, true);
      }
    });
    
    // Second pass: group jobs
    allJobsSorted.forEach((job) => {
      if (processedJobs.has(job.id)) return;
      
      const metadata = getCachedMetadata(job);
      const workflowId = metadata?.workflowId;
      
      if (workflowId) {
        // Find all jobs with the same workflow ID
        const workflowJobs = allJobsSorted.filter((j) => {
          const jMeta = getCachedMetadata(j);
          return jMeta?.workflowId === workflowId;
        });
        
        // Mark all workflow jobs as processed
        workflowJobs.forEach(j => processedJobs.add(j.id));
        
        groups.push({ 
          workflowId, 
          jobs: workflowJobs,
          isActive: activeWorkflowIds.has(workflowId)
        });
      } else {
        // Standalone job
        processedJobs.add(job.id);
        groups.push({ workflowId: null, jobs: [job], isActive: false });
      }
    });
    
    return { 
      jobGroups: groups, 
      continuationJobsMap: continuationJobs
    };
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
                      <MemoizedJobCard
                        job={job}
                        handleCancel={handleCancel}
                        handleDelete={handleDelete}
                        isCancelling={isCancelling}
                        isDeleting={isDeleting}
                        onSelect={onSelect}
                        onApplyFiles={onApplyFiles}
                        onContinueWorkflow={onContinueWorkflow}
                        currentSessionId={currentSessionId}
                        hasContinuationJob={continuationJobsMap.has(job.id)}
                        webSearchSystemPrompt={webSearchSystemPrompt}
                        isWorkflowActive={group.isActive}
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
