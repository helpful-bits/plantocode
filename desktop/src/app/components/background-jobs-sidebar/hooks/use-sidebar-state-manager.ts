"use client";

import { useState, useRef, useEffect, useCallback, useContext } from "react";

import { BackgroundJobsContext } from "@/contexts/background-jobs";
import { useUILayout } from "@/contexts/ui-layout-context";
import { type BackgroundJob } from "@/types/session-types";
import { setSidebarWidth } from "@/utils/ui-utils";

export interface SidebarState {
  selectedJob: BackgroundJob | null;
  activeCollapsed: boolean;
  isClearing: boolean;
  clearFeedback: string | null;
  isCancelling: Record<string, boolean>;
  isRefreshing: boolean;
}

export interface SidebarManager extends SidebarState {
  refreshClickedRef: React.RefObject<boolean>;
  handleRefresh: () => Promise<void>;
  handleClearHistory: (daysToKeep?: number) => Promise<void>;
  handleCancelJob: (jobId: string) => Promise<void>;
  handleSelectJob: (job: BackgroundJob) => void;
  handleCollapseChange: (open: boolean) => void;
  setSelectedJob: (job: BackgroundJob | null) => void;
}

/**
 * Hook for managing background jobs sidebar state and side effects
 */
export function useSidebarStateManager(): SidebarManager {
  const backgroundJobsContext = useContext(BackgroundJobsContext);
  const { cancelJob, clearHistory, refreshJobs } = backgroundJobsContext;

  // Use the UI layout context
  const { setIsSidebarCollapsed } = useUILayout();

  // State as a combined object
  const [state, setState] = useState<SidebarState>({
    selectedJob: null,
    activeCollapsed: false,
    isClearing: false,
    clearFeedback: null,
    isCancelling: {},
    isRefreshing: false,
  });

  const refreshClickedRef = useRef(false);

  // Clear feedback message after it's been shown
  useEffect(() => {
    if (state.clearFeedback) {
      const timer = setTimeout(() => {
        setState((prev) => ({ ...prev, clearFeedback: null }));
      }, 5000); // Show for 5 seconds

      return () => clearTimeout(timer);
    }
    return undefined;
  }, [state.clearFeedback]);

  // Update CSS variable and context when sidebar state changes
  useEffect(() => {
    // Update CSS variable for the sidebar width using the utility
    setSidebarWidth(state.activeCollapsed);

    // Update the context state
    setIsSidebarCollapsed(state.activeCollapsed);
  }, [state.activeCollapsed, setIsSidebarCollapsed]);

  // Handle manual refresh of jobs
  const handleRefresh = useCallback(async () => {
    // Prevent duplicate clicks
    if (refreshClickedRef.current || state.isRefreshing) return;

    refreshClickedRef.current = true;
    setState((prev) => ({ ...prev, isRefreshing: true }));

    try {
      await refreshJobs();
    } finally {
      setState((prev) => ({ ...prev, isRefreshing: false }));
      // Reset after a delay to prevent rapid clicks
      setTimeout(() => {
        refreshClickedRef.current = false;
      }, 1000);
    }
  }, [state.isRefreshing, refreshJobs]);

  // Add event listener for custom refresh event
  useEffect(() => {
    const handleRefreshEvent = () => {
      void handleRefresh();
    };

    // Add event listener
    window.addEventListener("refresh-background-jobs", handleRefreshEvent);

    // Clean up
    return () => {
      window.removeEventListener("refresh-background-jobs", handleRefreshEvent);
    };
  }, [handleRefresh]);

  // Handle clearing of history
  // daysToKeep parameter determines the clearing behavior:
  // - When -1: Delete all completed/failed/canceled jobs
  // - When undefined or 0: Only permanently deletes very old jobs (90+ days)
  // - When > 0: Hides jobs older than the specified number of days from view (marks as cleared=1)
  const handleClearHistory = useCallback(
    async (daysToKeep?: number) => {
      setState((prev) => ({ ...prev, isClearing: true }));

      try {
        await clearHistory(daysToKeep);

        // Set appropriate feedback message based on the clearing operation
        const feedbackMessage =
          daysToKeep === -1
            ? "All completed, failed, and canceled jobs have been deleted"
            : daysToKeep === undefined || daysToKeep === 0
              ? "Jobs older than 90 days permanently deleted"
              : `Jobs older than ${daysToKeep} day${daysToKeep > 1 ? "s" : ""} have been hidden from view`;

        setState((prev) => ({ ...prev, clearFeedback: feedbackMessage }));
      } catch (err) {
        setState((prev) => ({
          ...prev,
          clearFeedback: "Error clearing jobs. Please try again.",
        }));
        console.error("[BackgroundJobsSidebar] Error clearing history:", err);
      } finally {
        setState((prev) => ({ ...prev, isClearing: false }));
      }
    },
    [clearHistory]
  );

  // Handle job cancellation
  const handleCancelJob = useCallback(
    async (jobId: string) => {
      setState((prev) => ({
        ...prev,
        isCancelling: { ...prev.isCancelling, [jobId]: true },
      }));

      try {
        await cancelJob(jobId);
      } finally {
        setState((prev) => ({
          ...prev,
          isCancelling: { ...prev.isCancelling, [jobId]: false },
        }));
      }
    },
    [cancelJob]
  );

  // Handle sidebar collapse toggle
  const handleCollapseChange = useCallback((open: boolean) => {
    setState((prev) => ({ ...prev, activeCollapsed: !open }));
    // This will trigger the useEffect which updates both CSS var and context
  }, []);

  // Handle selecting a job for details view
  const handleSelectJob = useCallback((job: BackgroundJob) => {
    setState((prev) => ({ ...prev, selectedJob: job }));
  }, []);

  // Set selected job (used for closing modal)
  const setSelectedJob = useCallback((job: BackgroundJob | null) => {
    setState((prev) => ({ ...prev, selectedJob: job }));
  }, []);

  return {
    ...state,
    refreshClickedRef,
    handleRefresh,
    handleClearHistory,
    handleCancelJob,
    handleSelectJob,
    handleCollapseChange,
    setSelectedJob,
  };
}
