"use client";

import { useState, useMemo, useCallback } from "react";

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
  const [jobToDelete, setJobToDelete] = useState<string | undefined>(undefined);
  const [isDeleting, setIsDeleting] = useState<Record<string, boolean>>({});

  // Filter implementation plans for the current project and optionally session
  const implementationPlans = useMemo(() => {
    if (!jobs) return [];

    return jobs
      .filter((job: BackgroundJob) => {
        if (job.taskType !== "implementation_plan") return false;


        if (sessionId && job.sessionId !== sessionId) {
          return false;
        }

        return true;
      })
      .sort((a: BackgroundJob, b: BackgroundJob) => {
        const aIsActive = JOB_STATUSES.ACTIVE.includes(a.status);
        const bIsActive = JOB_STATUSES.ACTIVE.includes(b.status);

        if (aIsActive && !bIsActive) return -1;
        if (!aIsActive && bIsActive) return 1;

        return (b.createdAt || 0) - (a.createdAt || 0);
      });
  }, [jobs, projectDirectory, sessionId]);

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
    jobToDelete,
    isDeleting,

    // Actions
    handleCopyToClipboard,
    handleDeletePlan,
    handleViewPlanDetails,
    handleClosePlanDetails,
    setJobToDelete,
    refreshJobs,
  };
}

export default useImplementationPlansLogic;