"use client";

import { useState, useEffect, useMemo, useRef, useCallback } from "react";

import { useBackgroundJobs } from "@/contexts/background-jobs/useBackgroundJobs";
import { useProject } from "@/contexts/project-context";
import { type BackgroundJob, JOB_STATUSES } from "@/types/session-types";
import { useNotification } from "@/contexts/notification-context";
import { createLogger } from "@/utils/logger";

const logger = createLogger({ namespace: "ImplPlansLogic" });

interface UseImplementationPlansLogicProps {
  sessionId: string | null;
}

export function useImplementationPlansLogic({
  sessionId,
}: UseImplementationPlansLogicProps) {
  const { jobs, isLoading, deleteJob, refreshJobs } = useBackgroundJobs();
  const { projectDirectory } = useProject();
  const { showNotification } = useNotification();

  // UI state
  const [copiedPlanId, setCopiedPlanId] = useState<string | undefined>(undefined);
  const [jobForModal, setJobForModal] = useState<BackgroundJob | undefined>(undefined);
  const [planContentModal, setPlanContentModal] = useState<{
    plan: BackgroundJob;
    open: boolean;
  } | undefined>(undefined);
  const [pollingError, setPollingError] = useState<string | undefined>(undefined);
  const [jobToDelete, setJobToDelete] = useState<string | undefined>(undefined);
  const [isDeleting, setIsDeleting] = useState<Record<string, boolean>>({});

  // Ref to track the polling interval for streaming updates
  const streamingUpdateInterval = useRef<ReturnType<typeof setInterval> | undefined>(undefined);

  // Filter implementation plans for the current project and optionally session
  const implementationPlans = useMemo(() => {
    if (!jobs) return [];

    // Filter for implementation plan jobs
    return jobs
      .filter((job: BackgroundJob) => {
        // Must be implementation_plan task type
        if (job.taskType !== "implementation_plan") return false;

        // If project directory is specified, filter by it
        if (projectDirectory && job.projectDirectory !== projectDirectory) {
          return false;
        }

        // If sessionId is specified, filter by it
        if (sessionId && job.sessionId !== sessionId) {
          return false;
        }

        return true;
      })
      .sort((a: BackgroundJob, b: BackgroundJob) => {
        // Active jobs first
        const aIsActive = JOB_STATUSES.ACTIVE.includes(a.status);
        const bIsActive = JOB_STATUSES.ACTIVE.includes(b.status);

        if (aIsActive && !bIsActive) return -1;
        if (!aIsActive && bIsActive) return 1;

        // Then sort by creation date (newest first)
        return (b.createdAt || 0) - (a.createdAt || 0);
      });
  }, [jobs, projectDirectory, sessionId]);

  // Copy implementation plan content to clipboard
  const handleCopyToClipboard = useCallback(
    async (text: string, jobId: string) => {
      try {
        await navigator.clipboard.writeText(text);
        setCopiedPlanId(jobId);

        showNotification({
          title: "Copied!",
          message: "Implementation plan copied to clipboard.",
          type: "success",
        });

        // Reset copied state after 2 seconds
        setTimeout(() => {
          setCopiedPlanId(undefined);
        }, 2000);
      } catch (error) {
        logger.error("Failed to copy text: ", error);
        showNotification({
          title: "Copy Failed",
          message: "Could not copy to clipboard.",
          type: "error",
        });
      }
    },
    []
  );

  // Delete implementation plan job
  const handleDeletePlan = useCallback(
    async (jobId: string) => {
      if (!jobId) return;

      setIsDeleting((prev) => ({ ...prev, [jobId]: true }));

      try {
        await deleteJob(jobId);

        // Optimistic UI update
        setIsDeleting((prev) => ({ ...prev, [jobId]: false }));
        setJobToDelete(undefined);

        showNotification({
          title: "Success",
          message: "Implementation plan deleted successfully.",
          type: "success",
        });

        // Refresh jobs list
        await refreshJobs();
      } catch (error) {
        logger.error("Error deleting job:", error);

        showNotification({
          title: "Error",
          message: "Failed to delete implementation plan.",
          type: "error",
        });

        setIsDeleting((prev) => ({ ...prev, [jobId]: false }));
      }
    },
    [deleteJob, refreshJobs]
  );

  // Fetch the latest content for a specific job - define this before it's used
  const refreshJobContent = useCallback(
    async (jobId: string) => {
      try {
        await refreshJobs();

        // Find the updated job in the refreshed jobs list
        const updatedJobs = jobs;
        const updatedJob = updatedJobs.find(
          (job: BackgroundJob) => job.id === jobId
        );

        if (updatedJob) {
          // Update the plan in the modal with the fresh data
          setPlanContentModal((prev) =>
            prev && prev.plan.id === jobId
              ? { ...prev, plan: updatedJob }
              : prev
          );

          // If the job is no longer active, clear the interval
          if (
            !JOB_STATUSES.ACTIVE.includes(updatedJob.status) &&
            streamingUpdateInterval.current
          ) {
            clearInterval(streamingUpdateInterval.current);
            streamingUpdateInterval.current = undefined;
          }
        }
      } catch (error) {
        logger.error("Error refreshing job content:", error);
        setPollingError("Failed to refresh the plan content.");
        throw error;
      }
    },
    [jobs, refreshJobs]
  );

  // Handle opening the plan content modal
  const handleViewPlanContent = useCallback((plan: BackgroundJob) => {
    setPlanContentModal({ plan, open: true });

    // Start polling for updates if the plan is still active
    if (JOB_STATUSES.ACTIVE.includes(plan.status)) {
      // Clear any existing interval
      if (streamingUpdateInterval.current) {
        clearInterval(streamingUpdateInterval.current);
      }

      // Set up new polling interval
      streamingUpdateInterval.current = setInterval(() => {
        refreshJobContent(plan.id).catch((error) => {
          logger.error("Error polling for job updates:", error);
          setPollingError(
            "Failed to get the latest updates. The plan may still be generating."
          );
        });
      }, 3000);
    }
  }, [refreshJobContent]);

  // Handle closing the plan content modal
  const handleClosePlanContentModal = useCallback(() => {
    setPlanContentModal((prev) => (prev ? { ...prev, open: false } : undefined));

    // Stop polling when modal closes
    if (streamingUpdateInterval.current) {
      clearInterval(streamingUpdateInterval.current);
      streamingUpdateInterval.current = undefined;
    }

    // Clear error when closing
    setPollingError(undefined);
  }, []);

  // Clean up polling interval on unmount
  useEffect(() => {
    return () => {
      if (streamingUpdateInterval.current) {
        clearInterval(streamingUpdateInterval.current);
      }
    };
  }, []);

  // Handle plan details modal
  const handleViewPlanDetails = useCallback((plan: BackgroundJob) => {
    setJobForModal(plan);
  }, []);

  // Handle plan details modal close
  const handleClosePlanDetails = useCallback(() => {
    setJobForModal(undefined);
  }, []);

  return {
    implementationPlans,
    isLoading,
    copiedPlanId,
    jobForModal,
    planContentModal,
    pollingError,
    jobToDelete,
    isDeleting,

    // Actions
    handleCopyToClipboard,
    handleDeletePlan,
    handleViewPlanContent,
    handleClosePlanContentModal,
    refreshJobContent,
    handleViewPlanDetails,
    handleClosePlanDetails,
    setJobToDelete,
    refreshJobs,
  };
}

export default useImplementationPlansLogic;