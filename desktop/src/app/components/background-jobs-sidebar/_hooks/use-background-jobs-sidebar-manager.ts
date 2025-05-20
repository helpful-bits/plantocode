"use client";

import { useState, useRef, useEffect, useCallback , useContext } from "react";

import { BackgroundJobsContext } from "@/contexts/background-jobs";
import { useUILayout } from "@/contexts/ui-layout-context";
import { type BackgroundJob } from "@/types/session-types";

/**
 * Custom hook that manages the state and logic for the BackgroundJobsSidebar component.
 *
 * This hook encapsulates:
 * - Job selection for details modal
 * - Sidebar collapse state and synchronization with CSS/context
 * - History clearing functionality
 * - Job cancellation
 * - Job list refreshing
 */
export function useBackgroundJobsSidebarManager() {
  // The underlying implementation now uses Tauri commands
  // but the API remains the same for consumers
  const { cancelJob, clearHistory, refreshJobs } = useContext(
    BackgroundJobsContext
  );

  // Use the UI layout context
  const { setIsSidebarCollapsed } = useUILayout();

  // State for selected job for the details modal
  const [selectedJob, setSelectedJob] = useState<BackgroundJob | null>(null);

  // Collapse state
  const [activeCollapsed, setActiveCollapsed] = useState(false);

  // Job management states
  const [isClearing, setIsClearing] = useState(false);
  const [clearFeedback, setClearFeedback] = useState<string | null>(null);
  const [isCancelling, setIsCancelling] = useState<Record<string, boolean>>({});
  const [isRefreshing, setIsRefreshing] = useState(false);
  const refreshClickedRef = useRef(false);

  // Clear feedback message after it's been shown
  useEffect(() => {
    if (clearFeedback) {
      const timer = setTimeout(() => {
        setClearFeedback(null);
      }, 5000); // Show for 5 seconds

      return () => clearTimeout(timer);
    }
    return undefined;
  }, [clearFeedback]);

  // Update CSS variable and context when sidebar state changes
  useEffect(() => {
    // Update CSS variable for the sidebar width
    document.documentElement.style.setProperty(
      "--sidebar-width",
      activeCollapsed ? "48px" : "320px" // 320px when expanded
    );

    // Update the context state
    setIsSidebarCollapsed(activeCollapsed);
  }, [activeCollapsed, setIsSidebarCollapsed]);

  // Handle manual refresh of jobs
  const handleRefresh = useCallback(async () => {
    // Prevent duplicate clicks
    if (refreshClickedRef.current || isRefreshing) return;

    refreshClickedRef.current = true;
    setIsRefreshing(true);

    try {
      await refreshJobs();
    } finally {
      setIsRefreshing(false);
      // Reset after a delay to prevent rapid clicks
      setTimeout(() => {
        refreshClickedRef.current = false;
      }, 1000);
    }
  }, [isRefreshing, refreshJobs]);

  // Handle clearing of history
  const handleClearHistory = useCallback(
    async (daysToKeep?: number) => {
      setIsClearing(true);
      try {
        await clearHistory(daysToKeep);

        // Set appropriate feedback message based on the clearing operation
        if (daysToKeep === -1) {
          setClearFeedback(
            "All completed, failed, and canceled jobs have been deleted"
          );
        } else if (daysToKeep === undefined || daysToKeep === 0) {
          setClearFeedback("Jobs older than 90 days permanently deleted");
        } else {
          setClearFeedback(
            `Jobs older than ${daysToKeep} day${daysToKeep > 1 ? "s" : ""} have been hidden from view`
          );
        }
      } catch (err) {
        setClearFeedback("Error clearing jobs. Please try again.");
        console.error("[BackgroundJobsSidebar] Error clearing history:", err);
      } finally {
        setIsClearing(false);
      }
    },
    [clearHistory]
  );

  // Handle job cancellation
  const handleCancel = useCallback(
    async (jobId: string) => {
      setIsCancelling((prev) => ({ ...prev, [jobId]: true }));

      try {
        await cancelJob(jobId);
      } finally {
        setIsCancelling((prev) => ({ ...prev, [jobId]: false }));
      }
    },
    [cancelJob]
  );

  // Handle selecting a job for details view
  const handleSelectJob = useCallback((job: BackgroundJob) => {
    setSelectedJob(job);
  }, []);

  // Handle sidebar collapse toggle
  const handleCollapseChange = useCallback((open: boolean) => {
    setActiveCollapsed(!open);
    // This will trigger the useEffect which updates both CSS var and context
  }, []);

  return {
    // State
    selectedJob,
    activeCollapsed,
    isClearing,
    clearFeedback,
    isCancelling,
    isRefreshing,
    refreshClickedRef,

    // Handlers
    handleRefresh,
    handleClearHistory,
    handleCancel,
    handleSelectJob,
    handleCollapseChange,

    // State setters (for direct manipulation if needed)
    setSelectedJob,
    setActiveCollapsed,
  };
}
