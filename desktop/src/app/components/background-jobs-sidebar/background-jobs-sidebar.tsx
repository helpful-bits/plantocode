"use client";

import { useContext, useCallback, useState, useEffect, useMemo } from "react";

import { BackgroundJobsContext } from "@/contexts/background-jobs";
import { SidebarHeader, StatusMessages } from "@/ui";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/ui/collapsible";
import { getSidebarStyle } from "@/utils/ui-utils";
import { type BackgroundJob } from "@/types/session-types";
import { useSessionStateContext, useSessionActionsContext } from "@/contexts/session";
import { invoke } from '@tauri-apps/api/core';
import { useNotification } from '@/contexts/notification-context';
import { getSystemPromptForTaskAction } from "@/actions/ai/prompt.actions";

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
  const { showNotification } = useNotification();
  
  // System prompt cache for web search execution
  const [webSearchSystemPrompt, setWebSearchSystemPrompt] = useState<string>('');
  const [isLoadingSystemPrompt, setIsLoadingSystemPrompt] = useState(false);

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
  
  // Check if we have any completed web_search_prompts_generation jobs
  const hasWebSearchPromptsJob = useMemo(() => {
    return allJobsSorted.some(job => 
      job.taskType === "web_search_prompts_generation" && 
      job.status === "completed"
    );
  }, [allJobsSorted]);
  
  // Fetch system prompt once when we have a relevant job and a session
  useEffect(() => {
    if (hasWebSearchPromptsJob && activeSessionId && !webSearchSystemPrompt && !isLoadingSystemPrompt) {
      const fetchSystemPrompt = async () => {
        setIsLoadingSystemPrompt(true);
        try {
          const result = await getSystemPromptForTaskAction({
            sessionId: activeSessionId,
            taskType: 'web_search_execution'
          });
          if (result.isSuccess && result.data) {
            setWebSearchSystemPrompt(result.data.systemPrompt);
          }
        } catch (error) {
          console.error('Failed to fetch web search system prompt:', error);
        } finally {
          setIsLoadingSystemPrompt(false);
        }
      };
      
      fetchSystemPrompt();
    }
  }, [hasWebSearchPromptsJob, activeSessionId, webSearchSystemPrompt, isLoadingSystemPrompt]);

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

  // Function to continue workflow from a completed web search prompts generation job
  const handleContinueWorkflow = useCallback(async (job: BackgroundJob) => {
    if (job.taskType !== 'web_search_prompts_generation' || job.status !== 'completed') {
      return;
    }

    showNotification({
      title: "Continuing research",
      message: "Starting web search execution...",
      type: "info"
    });

    try {
      // Call the backend command to continue the workflow from this job
      await invoke('continue_workflow_from_job_command', {
        jobId: job.id
      });

      showNotification({
        title: "Research continued",
        message: "Web search execution is now running",
        type: "success"
      });
    } catch (error) {
      console.error('Failed to continue workflow:', error);
      showNotification({
        title: "Failed to continue research",
        message: String(error),
        type: "error"
      });
    }
  }, [showNotification]);

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
    
    // Handle video analysis jobs specially
    if (jobWithResponse.taskType === 'video_analysis' && jobWithResponse.status === 'completed' && jobWithResponse.response) {
      // Get current task description
      const currentTaskDescription = currentSession?.taskDescription || '';
      
      // Parse the response to extract just the analysis content
      let analysisContent = '';
      try {
        const responseData = typeof jobWithResponse.response === 'string' 
          ? JSON.parse(jobWithResponse.response) 
          : jobWithResponse.response;
        
        // Extract just the analysis field
        analysisContent = responseData.analysis || jobWithResponse.response;
      } catch (e) {
        // If parsing fails, use the raw response
        analysisContent = jobWithResponse.response;
      }
      
      // Create the finding text with the video analysis results
      const finding = `\n\n<video_analysis_summary>\n${analysisContent}\n</video_analysis_summary>`;
      
      // Append finding to current task description
      const updatedTaskDescription = currentTaskDescription + finding;
      
      // Update session with the new task description
      updateCurrentSessionFields({
        taskDescription: updatedTaskDescription
      });
      
      // Show success notification
      showNotification({
        title: "Video analysis applied",
        message: "The video analysis findings have been added to your task description",
        type: "success"
      });
      
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
              onContinueWorkflow={handleContinueWorkflow}
              webSearchSystemPrompt={webSearchSystemPrompt}
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
