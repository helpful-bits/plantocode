"use client";

import { useContext, useCallback } from "react";

import { BackgroundJobsContext } from "@/contexts/background-jobs";
import { SidebarHeader, StatusMessages } from "@/ui";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/ui/collapsible";
import { getSidebarStyle } from "@/utils/ui-utils";
import { type BackgroundJob } from "@/types/session-types";
import { useSessionStateContext, useSessionActionsContext } from "@/contexts/session";
import { invoke } from '@tauri-apps/api/core';

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
  const { updateCurrentSessionFields, applyFileSelectionUpdate } = useSessionActionsContext();

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
    
  }, [currentSession, updateCurrentSessionFields]);

  // Function to apply files from job to session
  const handleApplyFilesFromJob = async (job: BackgroundJob) => {
    // If response is missing (due to lightweight query), fetch full job data
    let jobWithResponse = job;
    if (!job.response && job.status === 'completed') {
      try {
        jobWithResponse = await invoke<BackgroundJob>('get_background_job_by_id_command', {
          jobId: job.id
        });
      } catch (error) {
        console.error('Failed to fetch full job details:', error);
        return;
      }
    }

    // Handle web search execution jobs specially
    if (jobWithResponse.taskType === 'web_search_execution' && jobWithResponse.status === 'completed' && jobWithResponse.response) {
      try {
        let responseData: any;
        if (typeof jobWithResponse.response === 'string') {
          responseData = JSON.parse(jobWithResponse.response);
        } else {
          responseData = jobWithResponse.response;
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
    
    // Use standardized response format from backend
    if (jobWithResponse.response) {
      try {
        let response: any;
        if (typeof jobWithResponse.response === 'string') {
          response = JSON.parse(jobWithResponse.response);
        } else {
          response = jobWithResponse.response;
        }
        // Backend standardizes all file-finding responses to have 'files' array
        if (response.files && Array.isArray(response.files)) {
          paths = response.files;
        }
      } catch (e) {
        console.error('Failed to parse job response:', e);
      }
    }
    
    if (paths.length > 0) {
      applyFileSelectionUpdate(paths, `job ${job.id}`);
    } else {
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
    </>
  );
};

// Add display name to the component
BackgroundJobsSidebar.displayName = "BackgroundJobsSidebar";
