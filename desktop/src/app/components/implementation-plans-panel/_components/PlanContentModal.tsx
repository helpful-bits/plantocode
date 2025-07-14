"use client";

import { Loader2, Copy, Save, ChevronLeft, ChevronRight } from "lucide-react";
import React, { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useNotification } from "@/contexts/notification-context";

import { type BackgroundJob, JOB_STATUSES } from "@/types/session-types";
import { type CopyButtonConfig } from "@/types/config-types";
import { Button } from "@/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/ui/dialog";
import { Progress } from "@/ui/progress";
import { VirtualizedCodeViewer } from "@/ui/virtualized-code-viewer";

import { getStreamingProgressValue } from "../../background-jobs-sidebar/utils";
import { getJobDisplaySessionName } from "../../background-jobs-sidebar/_utils/job-display-utils";
import { parsePlanResponseContent, getContentForStep } from "../_utils/plan-content-parser";
import { replacePlaceholders } from "@/utils/placeholder-utils";
import { normalizeJobResponse } from '@/utils/response-utils';

interface PlanContentModalProps {
  plan?: BackgroundJob;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onRefreshContent: () => Promise<void>;
  selectedStepNumber?: string | null;
  onStepSelect?: (stepNumber: string | null) => void;
  copyButtons?: CopyButtonConfig[];
  onCopyButtonClick?: (buttonConfig: CopyButtonConfig) => void;
  // Navigation props
  currentIndex?: number;
  totalPlans?: number;
  hasPrevious?: boolean;
  hasNext?: boolean;
  onNavigate?: (direction: 'previous' | 'next') => void;
}

/**
 * Custom hook for live progress updates in Plan Content Modal
 * Updates progress every second for running jobs
 */
const useLiveProgress = (
  metadata: any,
  startTime: number | null | undefined,
  taskType: string | undefined,
  isRunning: boolean
): number | undefined => {
  const [progress, setProgress] = useState<number | undefined>(() => 
    isRunning ? getStreamingProgressValue(metadata) : undefined
  );

  useEffect(() => {
    if (!isRunning) {
      setProgress(undefined);
      return;
    }

    const updateProgress = () => {
      const newProgress = getStreamingProgressValue(metadata);
      setProgress(newProgress);
    };

    // Update immediately
    updateProgress();

    // Set up interval to update every second
    const interval = setInterval(updateProgress, 1000);

    return () => clearInterval(interval);
  }, [metadata, startTime, taskType, isRunning]);

  return progress;
};

const PlanContentModal: React.FC<PlanContentModalProps> = ({
  plan,
  open,
  onOpenChange,
  onRefreshContent,
  selectedStepNumber,
  copyButtons = [],
  onCopyButtonClick,
  // Navigation props
  currentIndex = 0,
  totalPlans = 1,
  hasPrevious = false,
  hasNext = false,
  onNavigate,
}) => {
  const [isSaving, setIsSaving] = React.useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = React.useState(false);
  const [editedContent, setEditedContent] = React.useState<string>("");
  const { showNotification } = useNotification();
  
  // State for full job details (with response content)
  const [fullPlanDetails, setFullPlanDetails] = useState<BackgroundJob | null>(null);
  const [isLoadingFullDetails, setIsLoadingFullDetails] = useState(false);

  if (!plan) return null;
  
  // Fetch full job details when plan changes or modal opens
  useEffect(() => {
    const fetchFullPlanDetails = async () => {
      if (!plan || !open) {
        setFullPlanDetails(null);
        return;
      }
      
      setIsLoadingFullDetails(true);
      try {
        const result = await invoke<BackgroundJob | null>('get_background_job_by_id_command', {
          jobId: plan.id
        });
        
        if (result) {
          setFullPlanDetails(result);
        } else {
          // Fallback to the provided plan if fetch fails
          setFullPlanDetails(plan);
        }
      } catch (error) {
        console.error('Failed to fetch full plan details:', error);
        // Fallback to the provided plan if fetch fails
        setFullPlanDetails(plan);
      } finally {
        setIsLoadingFullDetails(false);
      }
    };
    
    fetchFullPlanDetails();
  }, [plan?.id, open]);
  
  // Use full details if available, but merge with the live plan prop to get updates
  const displayPlan = React.useMemo(() => {
    if (!plan) return null;
    if (!fullPlanDetails) {
      return plan;
    }
    // Merge the live plan over the fetched details to ensure streaming updates are reflected
    // BUT preserve the response content from fullPlanDetails (lightweight plan has NULL response)
    const merged = { 
      ...fullPlanDetails, 
      ...plan, 
      response: fullPlanDetails.response || plan.response,
      prompt: fullPlanDetails.prompt || plan.prompt,
      systemPromptTemplate: fullPlanDetails.systemPromptTemplate || plan.systemPromptTemplate
    };
    
    // Debug logging to verify content is preserved
    if (process.env.NODE_ENV === 'development') {
      console.log('PlanContentModal merge:', {
        jobId: plan.id,
        fullDetailsResponseLength: fullPlanDetails.response?.length || 0,
        lightweightResponseLength: plan.response?.length || 0,
        mergedResponseLength: merged.response?.length || 0
      });
    }
    
    return merged;
  }, [fullPlanDetails, plan]);

  if (!displayPlan) return null;

  const isStreaming = JOB_STATUSES.ACTIVE.includes(displayPlan.status) &&
                     (displayPlan.status === "running" || displayPlan.status === "processingStream" || displayPlan.status === "generatingStream");
  
  // Use live progress hook for consistent and real-time updates
  const progress = useLiveProgress(
    displayPlan.metadata,
    displayPlan.startTime,
    displayPlan.taskType, // Now includes taskType for proper calculation
    isStreaming
  );

  const viewerLanguage = "xml"; // Default to XML for implementation plans

  // Determine if we should show the loading indicator
  // Only show loading when streaming AND no content has arrived yet
  const showLoadingIndicator = isStreaming && editedContent.trim() === "";

  // Use centralized utility function for consistent sessionName logic
  const sessionName = getJobDisplaySessionName(displayPlan);

  // Default copy button handler using replacePlaceholders
  const handleCopyButtonClick = React.useCallback(async (button: CopyButtonConfig) => {
    if (onCopyButtonClick) {
      onCopyButtonClick(button);
      return;
    }
    
    // Default implementation using replacePlaceholders
    try {
      const data = {
        IMPLEMENTATION_PLAN: editedContent,
        STEP_CONTENT: selectedStepNumber ? getContentForStep(editedContent, selectedStepNumber) : ''
      };
      
      const processedContent = replacePlaceholders(button.content, data);
      await navigator.clipboard.writeText(processedContent);
    } catch (error) {
      console.error('Failed to copy to clipboard:', error);
    }
  }, [onCopyButtonClick, editedContent, selectedStepNumber]);

  // Initialize edited content when plan changes, and sync during streaming
  React.useEffect(() => {
    if (displayPlan) {
      const currentContent = parsePlanResponseContent(normalizeJobResponse(displayPlan.response).content);
      setEditedContent(currentContent);
      setHasUnsavedChanges(false); // Reset when the underlying plan data changes
    }
  }, [displayPlan?.id, displayPlan?.response, displayPlan?.status]);

  // Handle content changes in the editor
  const handleContentChange = React.useCallback((newContent: string | undefined) => {
    if (newContent !== undefined && displayPlan) {
      setEditedContent(newContent);
      const originalContent = displayPlan.status === "completed" 
        ? parsePlanResponseContent(normalizeJobResponse(displayPlan.response).content)
        : normalizeJobResponse(displayPlan.response).content || "";
      setHasUnsavedChanges(newContent !== originalContent);
    }
  }, [displayPlan?.response, displayPlan?.status]);

  // Save changes to the database
  const handleSave = React.useCallback(async () => {
    if (!plan || !hasUnsavedChanges) return;
    
    setIsSaving(true);
    try {
      await invoke("update_implementation_plan_content_command", {
        jobId: plan.id,
        newContent: editedContent
      });
      
      setHasUnsavedChanges(false);
      showNotification({
        title: "Changes saved",
        message: "Implementation plan content has been updated successfully",
        type: "success",
        duration: 3000,
      });
      
      // Refresh the plan content to reflect changes
      await onRefreshContent();
    } catch (error) {
      console.error("Failed to save implementation plan:", error);
      showNotification({
        title: "Save failed",
        message: "Failed to save changes to implementation plan",
        type: "error",
        duration: 5000,
      });
    } finally {
      setIsSaving(false);
    }
  }, [plan?.id, editedContent, hasUnsavedChanges, onRefreshContent, showNotification]);

  // Keyboard navigation
  useEffect(() => {
    if (!open || !onNavigate) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Only handle arrow keys when not editing content
      if (e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLInputElement) {
        return;
      }

      if (e.key === 'ArrowLeft' && hasPrevious) {
        e.preventDefault();
        onNavigate('previous');
      } else if (e.key === 'ArrowRight' && hasNext) {
        e.preventDefault();
        onNavigate('next');
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, onNavigate, hasPrevious, hasNext]);

  // Format completion date
  const formatCompletionDate = (timestamp: number | null | undefined) => {
    if (!timestamp) return null;
    const date = new Date(timestamp);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl h-[95vh] !flex !flex-col !gap-0 text-foreground !bg-card rounded-xl shadow-lg !backdrop-blur-none">
        {isLoadingFullDetails && (
          <div className="absolute inset-0 bg-background/50 backdrop-blur-sm flex items-center justify-center z-10 rounded-xl">
            <div className="flex flex-col items-center gap-2">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <p className="text-sm text-muted-foreground">Loading plan content...</p>
            </div>
          </div>
        )}
        <DialogHeader className="flex flex-row items-start justify-between space-y-0 pb-2 flex-shrink-0">
          <DialogTitle className="text-lg">
            Implementation Plan: {sessionName}
          </DialogTitle>
          
          <div className="flex items-start gap-2">
            {/* Status - with more space */}
            <div className="text-sm text-muted-foreground min-w-[200px] flex justify-center">
              {isStreaming ? (
                <span className="flex items-center">
                  <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                  Generating plan...
                </span>
              ) : (
                <div className="flex flex-col items-center">
                  <span>
                    {displayPlan.status === "completed" ? "Completed" : displayPlan.status}
                  </span>
                  {displayPlan.status === "completed" && displayPlan.endTime && (
                    <span className="text-xs">
                      {formatCompletionDate(displayPlan.endTime)}
                    </span>
                  )}
                </div>
              )}
            </div>

            {/* Save Button */}
            {!isStreaming && hasUnsavedChanges && (
              <Button
                variant="default"
                size="sm"
                onClick={handleSave}
                disabled={isSaving}
                className="text-xs h-7"
                title="Save changes to implementation plan"
              >
                {isSaving ? (
                  <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                ) : (
                  <Save className="h-3 w-3 mr-1" />
                )}
                {isSaving ? "Saving..." : "Save"}
              </Button>
            )}

            {/* Copy Buttons */}
            {copyButtons.length > 0 && !isStreaming && (
              <div className="flex flex-wrap gap-2">
                {copyButtons.map((button) => (
                  <Button
                    key={button.id}
                    variant="outline"
                    size="sm"
                    onClick={() => handleCopyButtonClick(button)}
                    className="text-xs h-7"
                    title={`Copy: ${button.label}`}
                  >
                    <Copy className="h-3 w-3 mr-1" />
                    {button.label}
                  </Button>
                ))}
              </div>
            )}
          </div>
        </DialogHeader>

        {/* Progress bar for streaming jobs */}
        {isStreaming && (
          <div className="mb-2 flex-shrink-0">
            {(() => {
              // Ensure we always show some progress for active jobs, consistent with other components
              const displayProgress = progress !== undefined ? progress : 10;
              
              return (
                <>
                  <Progress value={displayProgress} className="h-2" />
                  <div className="flex justify-between mt-1 text-xs text-muted-foreground">
                    <span>Generating implementation plan...</span>
                    <span>{Math.round(displayProgress)}%</span>
                  </div>
                </>
              );
            })()}
          </div>
        )}

        {/* Content */}
        <div className="flex-1 min-h-0 relative">
          <VirtualizedCodeViewer
            content={editedContent}
            height="100%"
            showCopy={false}
            showContentSize={true}
            isLoading={showLoadingIndicator}
            placeholder="No implementation plan content available yet"
            language={viewerLanguage}
            className=""
            readOnly={isStreaming} 
            onChange={isStreaming ? undefined : handleContentChange}
            loadingIndicator={
              <div className="flex items-center justify-center h-full">
                <div className="flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span className="text-sm text-muted-foreground">Generating implementation plan...</span>
                </div>
              </div>
            }
          />
          
          {/* Navigation overlay at the bottom */}
          {totalPlans > 1 && onNavigate && (
            <div className="absolute bottom-0 left-1/2 transform -translate-x-1/2 z-10">
              <div className="flex items-center gap-2 bg-card/95 backdrop-blur-sm border border-border rounded-full px-3 py-1.5 shadow-lg">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => onNavigate('previous')}
                  disabled={!hasPrevious}
                  className="h-7 w-7 p-0 hover:bg-accent/50"
                  title="Previous plan (←)"
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <span className="text-xs text-muted-foreground px-2 min-w-[60px] text-center">
                  {currentIndex + 1} of {totalPlans}
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => onNavigate('next')}
                  disabled={!hasNext}
                  className="h-7 w-7 p-0 hover:bg-accent/50"
                  title="Next plan (→)"
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default PlanContentModal;
