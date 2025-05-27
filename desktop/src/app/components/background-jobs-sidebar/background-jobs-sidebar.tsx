"use client";

import { useContext } from "react";

import { BackgroundJobsContext } from "@/contexts/background-jobs";
import { SidebarHeader, StatusMessages } from "@/ui";
import { Collapsible, CollapsibleContent } from "@/ui/collapsible";
import { getSidebarStyle } from "@/utils/ui-utils";

import { JobContent } from "./_components/job-content";
import { useJobFiltering } from "./hooks/use-job-filtering";
import { useSidebarStateManager } from "./hooks/use-sidebar-state-manager";
import { JobDetailsModal } from "./job-details-modal";

/**
 * Background Jobs Sidebar component
 *
 * Displays a collapsible sidebar with real-time information about background jobs
 * including active, completed, and failed jobs. Allows users to view job details,
 * cancel active jobs, and manage job history.
 */
export const BackgroundJobsSidebar = () => {
  const { jobs, isLoading, error } = useContext(BackgroundJobsContext);

  // Use the extracted sidebar state manager hook
  const {
    selectedJob,
    activeCollapsed,
    isClearing,
    clearFeedback,
    isCancelling,
    isRefreshing,
    refreshClickedRef,
    handleRefresh,
    handleClearHistory,
    handleCancelJob,
    handleSelectJob,
    handleCollapseChange,
    setSelectedJob,
  } = useSidebarStateManager();

  // Use the extracted job filtering hook
  const {
    activeJobsToShow,
    completedJobs,
    failedJobs,
    shouldShowLoading,
    shouldShowEmpty,
  } = useJobFiltering(jobs, isLoading);

  // Get container style from utility function
  const containerStyle = getSidebarStyle(activeCollapsed);

  return (
    <>
      <div
        className="bg-background/95 backdrop-blur-sm border-r border-border/60 z-50 overflow-hidden text-xs shadow-soft"
        style={containerStyle}
      >
        <Collapsible open={!activeCollapsed} onOpenChange={handleCollapseChange}>
          {/* Header with controls */}
          <SidebarHeader
            isCollapsed={activeCollapsed}
            isRefreshing={isRefreshing}
            isClearing={isClearing}
            refreshDisabled={refreshClickedRef.current ?? false}
            onRefresh={handleRefresh}
            onClearHistory={handleClearHistory}
          />

          <CollapsibleContent
            forceMount
            className="overflow-y-auto"
            style={{ height: "calc(100vh - 3.5rem)" }}
          >
            {/* Status messages (errors, feedback) */}
            <StatusMessages
              error={error}
              clearFeedback={clearFeedback}
              isCollapsed={activeCollapsed}
            />

            {/* Job listings content */}
            <JobContent
              shouldShowLoading={shouldShowLoading}
              shouldShowEmpty={shouldShowEmpty}
              activeJobsToShow={activeJobsToShow}
              completedJobs={completedJobs}
              failedJobs={failedJobs}
              handleCancel={handleCancelJob}
              isCancelling={isCancelling}
              onSelect={handleSelectJob}
            />
          </CollapsibleContent>
        </Collapsible>
      </div>

      {/* Job Details Modal - Moved outside sidebar container to fix z-index stacking */}
      <JobDetailsModal job={selectedJob} onClose={() => setSelectedJob(null)} />
    </>
  );
};

// Add display name to the component
BackgroundJobsSidebar.displayName = "BackgroundJobsSidebar";
