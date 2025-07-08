"use client";

import { useContext, useRef, useCallback } from "react";

import { BackgroundJobsContext } from "@/contexts/background-jobs";
import { SidebarHeader, StatusMessages } from "@/ui";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/ui/collapsible";
import { getSidebarStyle } from "@/utils/ui-utils";
import { FileBrowser, type FileBrowserHandle } from "../generate-prompt/file-browser";
import { type BackgroundJob } from "@/types/session-types";
import { useSessionStateContext, useSessionActionsContext } from "@/contexts/session";

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
  const { activeSessionId, currentSession } = useSessionStateContext();
  const { updateCurrentSessionFields } = useSessionActionsContext();
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
    refreshClickedRef,
    handleRefresh,
    handleClearHistory,
    handleCancelJob,
    handleDeleteJob,
    handleSelectJob,
    handleCollapseChange,
    setSelectedJob,
  } = useSidebarStateManager();

  // Use the extracted job filtering hook
  const {
    allJobsSorted,
    shouldShowLoading,
    shouldShowEmpty,
  } = useJobFiltering(jobs, isLoading);

  // Function to apply web search results to the session
  const applyWebSearchResultsToSession = useCallback((results: any[]) => {
    if (!currentSession || !results || results.length === 0) return;
    
    const taskDescription = currentSession.taskDescription || "";
    
    // Format results with XML tags - extract findings from each result object
    const xmlFormattedResults = results.map((result, index) => {
      // Handle both string results and object results with title/findings structure
      let content: string;
      if (typeof result === 'string') {
        content = result;
      } else if (result && typeof result === 'object') {
        // Extract just the findings - title is not useful
        content = result.findings || '';
      } else {
        content = String(result);
      }
      
      return `<research_finding_${index + 1}>\n${content}\n</research_finding_${index + 1}>`;
    }).join("\n\n");
    
    // Prepare the new task description
    const updatedTaskDescription = taskDescription.trim() 
      ? `${taskDescription}\n\n${xmlFormattedResults}`
      : xmlFormattedResults;
    
    // Update the session
    updateCurrentSessionFields({
      taskDescription: updatedTaskDescription
    });
    
    console.log(`Applied ${results.length} web search results to task description`);
  }, [currentSession, updateCurrentSessionFields]);

  // Function to apply files from job to session
  const handleApplyFilesFromJob = (job: BackgroundJob) => {
    // Handle web search execution jobs specially
    if (job.taskType === 'web_search_execution' && job.status === 'completed' && job.response) {
      try {
        let responseData: any;
        if (typeof job.response === 'string') {
          responseData = JSON.parse(job.response);
        } else {
          responseData = job.response;
        }
        
        // Extract search results and apply them
        if (responseData.searchResults && Array.isArray(responseData.searchResults)) {
          // Apply web search results directly to the session
          applyWebSearchResultsToSession(responseData.searchResults);
          return;
        }
      } catch (e) {
        console.error('Failed to parse web search results:', e);
      }
      return;
    }
    
    let paths: string[] = [];
    
    // Check if this is a completed file_finder_workflow
    if (job.taskType === 'file_finder_workflow' && job.status === 'completed' && job.response) {
      try {
        // Parse workflow result to get final_paths
        const workflowResult = typeof job.response === 'string' ? JSON.parse(job.response) : job.response;
        if (workflowResult.selectedFiles && Array.isArray(workflowResult.selectedFiles)) {
          paths = workflowResult.selectedFiles;
        }
      } catch (e) {
        console.error('Failed to parse workflow result:', e);
      }
    } else {
      // Get file paths from structured job.metadata directly - no parsing needed
      if (job.metadata && typeof job.metadata === 'object') {
        // Look for structured fields in metadata (camelCase)
        const metadata = job.metadata as any;
        paths = metadata.verifiedPaths || metadata.relevantFiles || metadata.correctedPaths || [];
      } else if (job.response) {
        // Check response data if available
        if (typeof job.response === 'string') {
          // Try to parse string response
          try {
            const parsed = JSON.parse(job.response);
            if (Array.isArray(parsed)) {
              paths = parsed;
            } else if (parsed.verifiedPaths && parsed.unverifiedPaths) {
              paths = [...(parsed.verifiedPaths || []), ...(parsed.unverifiedPaths || [])];
            } else if (parsed.filePaths || parsed.paths || parsed.files || parsed.filteredFiles || parsed.relevantFiles) {
              paths = parsed.filePaths || parsed.paths || parsed.files || parsed.filteredFiles || parsed.relevantFiles || [];
            }
          } catch (e) {
            // If parsing fails, leave paths empty
          }
        } else if (typeof job.response === 'object' && job.response !== null) {
          // Handle various response formats
          const response = job.response as any;
          if (response.verifiedPaths && response.unverifiedPaths) {
            paths = [...(response.verifiedPaths || []), ...(response.unverifiedPaths || [])];
          } else if (Array.isArray(response)) {
            paths = response;
          } else if (response.filePaths || response.paths || response.files || response.filteredFiles || response.relevantFiles) {
            paths = response.filePaths || response.paths || response.files || response.filteredFiles || response.relevantFiles || [];
          }
        }
      }
    }
    
    if (paths.length > 0 && fileBrowserRef.current) {
      fileBrowserRef.current.handleApplyFilesFromJob(paths, `job ${job.id}`);
    }
  };

  // Removed handleApplyTextFromJob as web search workflows are now filtered out
  // This functionality is no longer needed since workflow jobs don't appear in the sidebar

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
              onSelect={handleSelectJob}
              onApplyFiles={handleApplyFilesFromJob}
              currentSessionId={activeSessionId || undefined}
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
