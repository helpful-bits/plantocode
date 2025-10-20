"use client";

import { useContext, useMemo, useCallback } from "react";
import { BackgroundJobsContext } from "@/contexts/background-jobs";
import { useSessionStateContext } from "@/contexts/session";
import { JOB_STATUSES } from "@/types/session-types";
import { startFileFinderWorkflowAction, cancelWorkflowAction } from "@/actions/workflows";
import { getSessionAction } from "@/actions/session/crud.actions";

export function useWorkflowState() {
  const { jobs } = useContext(BackgroundJobsContext);
  const { currentSession } = useSessionStateContext();

  // Check for active file-finding stage jobs instead of master workflow job
  const activeFileFindingJob = useMemo(() => {
    if (!currentSession?.id) return null;

    // Look for active stage jobs that are part of file finding workflow
    const fileFindingTaskTypes = ['regex_file_filter', 'file_relevance_assessment', 'extended_path_finder'];
    
    const activeStageJobs = jobs.filter(
      job => fileFindingTaskTypes.includes(job.taskType) && 
             job.sessionId === currentSession.id &&
             JOB_STATUSES.ACTIVE.includes(job.status)
    );

    if (activeStageJobs.length === 0) return null;

    // Return the most recent active job
    return activeStageJobs.sort((a, b) => b.createdAt - a.createdAt)[0];
  }, [jobs, currentSession?.id]);

  // Also check for completed workflow job to handle completion
  const fileFinderWorkflowJob = useMemo(() => {
    if (!currentSession?.id) return null;

    const workflowJobs = jobs.filter(
      job => job.taskType === 'file_finder_workflow' && job.sessionId === currentSession.id
    );

    if (workflowJobs.length === 0) return null;

    return workflowJobs.sort((a, b) => b.createdAt - a.createdAt)[0];
  }, [jobs, currentSession?.id]);

  const findingFiles = useMemo(() => {
    // Check if any stage jobs are active
    return activeFileFindingJob !== null;
  }, [activeFileFindingJob]);

  const findingFilesError = useMemo(() => {
    if (!fileFinderWorkflowJob) return null;
    if (fileFinderWorkflowJob.status === 'failed') {
      return fileFinderWorkflowJob.errorMessage || 'Workflow failed';
    }
    return null;
  }, [fileFinderWorkflowJob]);

  const triggerFind = useCallback(async () => {
    const sessionId = currentSession?.id;
    if (!sessionId) {
      throw new Error("Missing session ID to start workflow");
    }

    try {
      const freshResult = await getSessionAction(sessionId);
      const fresh = freshResult?.isSuccess && freshResult.data ? freshResult.data : currentSession;

      if (!fresh?.taskDescription || !fresh?.projectDirectory) {
        throw new Error("Missing required session data to start workflow");
      }

      const result = await startFileFinderWorkflowAction({
        sessionId: fresh.id,
        taskDescription: fresh.taskDescription,
        projectDirectory: fresh.projectDirectory,
        excludedPaths: fresh.forceExcludedFiles || [],
        timeoutMs: 300000
      });

      if (!result.isSuccess) {
        throw new Error(result.message || "Failed to start workflow");
      }
    } catch (error) {
      console.error("Failed to start file finder workflow:", error);
      throw error;
    }
  }, [currentSession]);

  const cancelFind = useCallback(async () => {
    // Cancel the master workflow job if it exists
    if (fileFinderWorkflowJob && JOB_STATUSES.ACTIVE.includes(fileFinderWorkflowJob.status)) {
      try {
        await cancelWorkflowAction(fileFinderWorkflowJob.id);
      } catch (error) {
        console.error("Failed to cancel workflow:", error);
      }
    }
  }, [fileFinderWorkflowJob]);

  // Removed auto-apply logic - let users click "Use Files" button on completed jobs
  // This gives users control over when to apply the found files

  return {
    findingFiles,
    findingFilesError,
    triggerFind,
    cancelFind
  };
}