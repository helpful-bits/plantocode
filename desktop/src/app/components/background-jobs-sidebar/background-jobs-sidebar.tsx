"use client";

import { useContext, useRef } from "react";

import { BackgroundJobsContext } from "@/contexts/background-jobs";
import { SidebarHeader, StatusMessages } from "@/ui";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/ui/collapsible";
import { getSidebarStyle } from "@/utils/ui-utils";
import { FileBrowser, type FileBrowserHandle } from "../generate-prompt/file-browser";

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
  const fileBrowserRef = useRef<FileBrowserHandle>(null);

  // Use the extracted sidebar state manager hook
  const {
    selectedJob,
    activeCollapsed,
    isClearing,
    clearFeedback,
    isCancelling,
    isDeleting,
    isRefreshing,
    isRetrying,
    refreshClickedRef,
    handleRefresh,
    handleClearHistory,
    handleCancelJob,
    handleDeleteJob,
    handleSelectJob,
    handleCollapseChange,
    handleRetry,
    setSelectedJob,
  } = useSidebarStateManager();

  // Use the extracted job filtering hook
  const {
    allJobsSorted,
    shouldShowLoading,
    shouldShowEmpty,
  } = useJobFiltering(jobs, isLoading);

  // Function to extract file paths from job response
  const extractFilePathsFromJob = (job: any): string[] => {
    if (!job.response) return [];
    
    try {
      const parsed = JSON.parse(job.response);
      
      // Handle path finder specific format with verified/unverified paths
      if (parsed && typeof parsed === 'object' && 'verifiedPaths' in parsed && 'unverifiedPaths' in parsed) {
        const verifiedPaths = Array.isArray(parsed.verifiedPaths) ? parsed.verifiedPaths : [];
        const unverifiedPaths = Array.isArray(parsed.unverifiedPaths) ? parsed.unverifiedPaths : [];
        return [...verifiedPaths, ...unverifiedPaths];
      }
      // Handle array responses (most common format)
      else if (Array.isArray(parsed)) {
        return parsed;
      }
      // Handle object responses with file arrays
      else if (parsed && typeof parsed === 'object') {
        // Check for all possible field names used by different task types
        const filePaths = parsed.filePaths || parsed.paths || parsed.files || 
                         parsed.filteredFiles || parsed.relevantFiles;
        
        if (Array.isArray(filePaths)) {
          return filePaths;
        }
      }
    } catch {
      // If parsing fails, return empty array
    }
    
    return [];
  };

  // Function to apply files from job to session
  const handleApplyFilesFromJob = (job: any) => {
    const paths = extractFilePathsFromJob(job);
    if (paths.length > 0 && fileBrowserRef.current) {
      fileBrowserRef.current.handleApplyFilesFromJob(paths, `job ${job.id}`);
    }
  };

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
            CollapsibleTrigger={CollapsibleTrigger}
          />

          <CollapsibleContent
            forceMount
            className="overflow-y-auto"
            style={{ height: "calc(100vh - 48px)" }}
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
              allJobsSorted={allJobsSorted}
              handleCancel={handleCancelJob}
              handleDelete={handleDeleteJob}
              isCancelling={isCancelling}
              isDeleting={isDeleting}
              isRetrying={isRetrying}
              handleRetry={handleRetry}
              onSelect={handleSelectJob}
              onApplyFiles={handleApplyFilesFromJob}
            />
          </CollapsibleContent>
        </Collapsible>
      </div>

      {/* Job Details Modal - Moved outside sidebar container to fix z-index stacking */}
      <JobDetailsModal job={selectedJob} onClose={() => setSelectedJob(null)} />
      
      {/* Hidden FileBrowser to access its apply function */}
      <div style={{ display: 'none' }}>
        <FileBrowser ref={fileBrowserRef} />
      </div>
    </>
  );
};

// Add display name to the component
BackgroundJobsSidebar.displayName = "BackgroundJobsSidebar";
