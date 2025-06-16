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
  isDeleting: Record<string, boolean>;
  isRefreshing: boolean;
}

export interface SidebarManager extends SidebarState {
  refreshClickedRef: React.RefObject<boolean>;
  handleRefresh: () => Promise<void>;
  handleClearHistory: (daysToKeep?: number) => Promise<void>;
  handleCancelJob: (jobId: string) => Promise<void>;
  handleDeleteJob: (jobId: string) => Promise<void>;
  handleSelectJob: (job: BackgroundJob) => void;
  handleCollapseChange: (open: boolean) => void;
  setSelectedJob: (job: BackgroundJob | null) => void;
}

/**
 * Hook for managing background jobs sidebar state and side effects
 */
export function useSidebarStateManager(): SidebarManager {
  const backgroundJobsContext = useContext(BackgroundJobsContext);
  const { cancelJob, deleteJob, clearHistory, refreshJobs } = backgroundJobsContext;

  // Use the UI layout context
  const { setIsSidebarCollapsed } = useUILayout();

  // State as a combined object
  const [state, setState] = useState<SidebarState>({
    selectedJob: null,
    activeCollapsed: false,
    isClearing: false,
    clearFeedback: null,
    isCancelling: {},
    isDeleting: {},
    isRefreshing: false,
  });

  // Track previous sidebar state before auto-collapsing for settings
  const [previousCollapsedState, setPreviousCollapsedState] = useState<boolean | null>(null);
  const [isAutoCollapsedForSettings, setIsAutoCollapsedForSettings] = useState(false);

  const refreshClickedRef = useRef(false);
  const refreshTimeoutRef = useRef<number | null>(null);
  
  // Create a ref for the state to avoid dependency cycles
  const stateRef = useRef(state);
  
  // Update the state ref when state changes
  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  // Clear feedback message after it's been shown
  useEffect(() => {
    if (state.clearFeedback) {
      const timer = setTimeout(() => {
        try {
          setState((prev: SidebarState) => ({ ...prev, clearFeedback: null }));
        } catch (error) {
          console.error('[SidebarStateManager] Error clearing feedback message:', error);
        }
      }, 5000); // Show for 5 seconds

      return () => clearTimeout(timer);
    }
    return undefined;
  }, [state.clearFeedback]);

  // Cleanup refresh timeout on unmount
  useEffect(() => {
    return () => {
      if (refreshTimeoutRef.current !== null) {
        clearTimeout(refreshTimeoutRef.current);
        refreshTimeoutRef.current = null;
      }
    };
  }, []);

  // Update CSS variable and context when sidebar state changes
  useEffect(() => {
    // Update CSS variable for the sidebar width using the utility
    setSidebarWidth(state.activeCollapsed);

    // Update the context state
    setIsSidebarCollapsed(state.activeCollapsed);
  }, [state.activeCollapsed, setIsSidebarCollapsed]);

  // Auto-collapse sidebar when navigating to settings to maximize horizontal space
  useEffect(() => {
    const handleRouteChange = (event: CustomEvent) => {
      const newPath = event.detail.path;
      if (!newPath) return;
      const isSettingsRoute = newPath === '/settings';
      
      if (isSettingsRoute && !isAutoCollapsedForSettings) {
        setPreviousCollapsedState(state.activeCollapsed);
        setIsAutoCollapsedForSettings(true);
        setState((prev: SidebarState) => ({ ...prev, activeCollapsed: true }));
      } else if (!isSettingsRoute && isAutoCollapsedForSettings) {
        setIsAutoCollapsedForSettings(false);
        
        if (previousCollapsedState !== null) {
          setState((prev: SidebarState) => ({ ...prev, activeCollapsed: previousCollapsedState }));
          setPreviousCollapsedState(null);
        }
      }
    };

    window.addEventListener('routeChange', handleRouteChange as EventListener);
    
    const currentPath = window.location.pathname;
    if (currentPath === '/settings' && !isAutoCollapsedForSettings) {
      setPreviousCollapsedState(state.activeCollapsed);
      setIsAutoCollapsedForSettings(true);
      setState((prev: SidebarState) => ({ ...prev, activeCollapsed: true }));
    }

    return () => {
      window.removeEventListener('routeChange', handleRouteChange as EventListener);
    };
  }, [state.activeCollapsed, isAutoCollapsedForSettings, previousCollapsedState]);

  // Handle manual refresh of jobs
  const handleRefresh = useCallback(async () => {
    // Prevent duplicate clicks
    if (refreshClickedRef.current || stateRef.current.isRefreshing) return;

    refreshClickedRef.current = true;
    setState((prev: SidebarState) => ({ ...prev, isRefreshing: true }));

    try {
      await refreshJobs();
    } finally {
      setState((prev: SidebarState) => ({ ...prev, isRefreshing: false }));
      
      // Clear any existing timeout first
      if (refreshTimeoutRef.current !== null) {
        clearTimeout(refreshTimeoutRef.current);
      }
      
      // Reset after a delay to prevent rapid clicks
      refreshTimeoutRef.current = window.setTimeout(() => {
        try {
          refreshClickedRef.current = false;
          refreshTimeoutRef.current = null;
        } catch (error) {
          console.error('[SidebarStateManager] Error resetting refresh state:', error);
        }
      }, 1000);
    }
  }, [refreshJobs]);

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
  // - When > 0: Delete jobs older than the specified number of days
  const handleClearHistory = useCallback(
    async (daysToKeep?: number) => {
      setState((prev: SidebarState) => ({ ...prev, isClearing: true }));

      try {
        await clearHistory(daysToKeep);

        // Set appropriate feedback message based on the clearing operation
        const feedbackMessage =
          daysToKeep === -1
            ? "All completed, failed, and canceled jobs have been deleted"
            : daysToKeep === undefined || daysToKeep === 0
              ? "Jobs older than 90 days permanently deleted"
              : `Jobs older than ${daysToKeep} day${daysToKeep > 1 ? "s" : ""} have been deleted`;

        setState((prev: SidebarState) => ({ ...prev, clearFeedback: feedbackMessage }));
      } catch (err) {
        setState((prev: SidebarState) => ({
          ...prev,
          clearFeedback: "Error clearing jobs. Please try again.",
        }));
        console.error("[BackgroundJobsSidebar] Error clearing history:", err);
      } finally {
        setState((prev: SidebarState) => ({ ...prev, isClearing: false }));
      }
    },
    [clearHistory]
  );

  // Handle job cancellation
  const handleCancelJob = useCallback(
    async (jobId: string) => {
      setState((prev: SidebarState) => ({
        ...prev,
        isCancelling: { ...prev.isCancelling, [jobId]: true },
      }));

      try {
        await cancelJob(jobId);
      } finally {
        setState((prev: SidebarState) => ({
          ...prev,
          isCancelling: { ...prev.isCancelling, [jobId]: false },
        }));
      }
    },
    [cancelJob]
  );

  // Handle job deletion
  const handleDeleteJob = useCallback(
    async (jobId: string) => {
      setState((prev: SidebarState) => ({
        ...prev,
        isDeleting: { ...prev.isDeleting, [jobId]: true },
      }));

      try {
        await deleteJob(jobId);
      } finally {
        setState((prev: SidebarState) => ({
          ...prev,
          isDeleting: { ...prev.isDeleting, [jobId]: false },
        }));
      }
    },
    [deleteJob]
  );

  // Handle sidebar collapse toggle
  const handleCollapseChange = useCallback((open: boolean) => {
    // If user manually changes sidebar state while on settings, clear auto-collapse tracking
    if (isAutoCollapsedForSettings) {
      setIsAutoCollapsedForSettings(false);
      setPreviousCollapsedState(null);
    }
    
    setState((prev: SidebarState) => ({ ...prev, activeCollapsed: !open }));
    // This will trigger the useEffect which updates both CSS var and context
  }, [isAutoCollapsedForSettings]);

  // Handle selecting a job for details view
  const handleSelectJob = useCallback((job: BackgroundJob) => {
    setState((prev: SidebarState) => ({ ...prev, selectedJob: job }));
  }, []);

  // Set selected job (used for closing modal)
  const setSelectedJob = useCallback((job: BackgroundJob | null) => {
    setState((prev: SidebarState) => ({ ...prev, selectedJob: job }));
  }, []);

  return {
    ...state,
    refreshClickedRef,
    handleRefresh,
    handleClearHistory,
    handleCancelJob,
    handleDeleteJob,
    handleSelectJob,
    handleCollapseChange,
    setSelectedJob,
  };
}
