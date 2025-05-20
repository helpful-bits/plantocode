"use client";

import { useState, useEffect, useMemo, useRef, useCallback } from "react";

import { useBackgroundJobs } from "@/contexts/background-jobs/useBackgroundJobs";
import { useProject } from "@/contexts/project-context";
import { type BackgroundJob } from "@/types/session-types";
import { toast } from "@/ui/use-toast";

// Define streaming statuses for consistent checking
const STREAMING_STATUSES = [
  "running",
  "processing_stream",
  "generating_stream",
];

interface UseImplementationPlansLogicProps {
  sessionId?: string | null;
}

export function useImplementationPlansLogic({
  sessionId,
}: UseImplementationPlansLogicProps) {
  const { jobs, isLoading, deleteJob, refreshJobs } = useBackgroundJobs();
  const { projectDirectory } = useProject();

  // UI state
  const [copiedPlanId, setCopiedPlanId] = useState<string | null>(null);
  const [jobForModal, setJobForModal] = useState<BackgroundJob | null>(null);
  const [planContentModal, setPlanContentModal] = useState<{
    plan: BackgroundJob;
    open: boolean;
  } | null>(null);
  const [pollingError, setPollingError] = useState<string | null>(null);
  const [jobToDelete, setJobToDelete] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState<Record<string, boolean>>({});

  // Ref to track the polling interval for streaming updates
  const streamingUpdateInterval = useRef<ReturnType<typeof setInterval> | null>(null);

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
        const aIsActive = STREAMING_STATUSES.includes(a.status.toLowerCase());
        const bIsActive = STREAMING_STATUSES.includes(b.status.toLowerCase());

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

        toast({
          title: "Copied!",
          description: "Implementation plan copied to clipboard.",
          variant: "success",
        });

        // Reset copied state after 2 seconds
        setTimeout(() => {
          setCopiedPlanId(null);
        }, 2000);
      } catch (error) {
        console.error("Failed to copy text: ", error);
        toast({
          title: "Copy Failed",
          description: "Could not copy to clipboard.",
          variant: "destructive",
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
        setJobToDelete(null);

        toast({
          title: "Success",
          description: "Implementation plan deleted successfully.",
          variant: "success",
        });

        // Refresh jobs list
        await refreshJobs();
      } catch (error) {
        console.error("Error deleting job:", error);

        toast({
          title: "Error",
          description: "Failed to delete implementation plan.",
          variant: "destructive",
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

          // If the job is no longer streaming, clear the interval
          if (
            !STREAMING_STATUSES.includes(updatedJob.status.toLowerCase()) &&
            streamingUpdateInterval.current
          ) {
            clearInterval(streamingUpdateInterval.current);
            streamingUpdateInterval.current = null;
          }
        }
      } catch (error) {
        console.error("Error refreshing job content:", error);
        setPollingError("Failed to refresh the plan content.");
        throw error;
      }
    },
    [jobs, refreshJobs]
  );

  // Handle opening the plan content modal
  const handleViewPlanContent = useCallback((plan: BackgroundJob) => {
    setPlanContentModal({ plan, open: true });

    // Start polling for updates if the plan is still streaming
    if (STREAMING_STATUSES.includes(plan.status.toLowerCase())) {
      // Clear any existing interval
      if (streamingUpdateInterval.current) {
        clearInterval(streamingUpdateInterval.current);
      }

      // Set up new polling interval
      streamingUpdateInterval.current = setInterval(() => {
        refreshJobContent(plan.id).catch((error) => {
          console.error("Error polling for job updates:", error);
          setPollingError(
            "Failed to get the latest updates. The plan may still be generating."
          );
        });
      }, 3000);
    }
  }, [refreshJobContent]);

  // Handle closing the plan content modal
  const handleClosePlanContentModal = useCallback(() => {
    setPlanContentModal((prev) => (prev ? { ...prev, open: false } : null));

    // Stop polling when modal closes
    if (streamingUpdateInterval.current) {
      clearInterval(streamingUpdateInterval.current);
      streamingUpdateInterval.current = null;
    }

    // Clear error when closing
    setPollingError(null);
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
    setJobForModal(null);
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