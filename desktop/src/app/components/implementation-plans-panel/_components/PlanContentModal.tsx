"use client";

import { Loader2, Copy, Save, ChevronLeft, ChevronRight, Plus, Check } from "lucide-react";
import React, { useEffect, useMemo, useContext } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useNotification } from "@/contexts/notification-context";
import { BackgroundJobsContext, type BackgroundJobsContextType } from "@/contexts/background-jobs/Provider";

import { type BackgroundJob, JOB_STATUSES } from "@/types/session-types";
import { type CopyButtonConfig } from "@/types/config-types";
import { Button } from "@/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/ui/dialog";
import { Progress } from "@/ui/progress";
import { VirtualizedCodeViewer } from "@/ui/virtualized-code-viewer";

import { getJobDisplaySessionName } from "../../background-jobs-sidebar/_utils/job-display-utils";
import { getStreamingStatus } from "../../background-jobs-sidebar/utils";
import { getContentForStep } from "../_utils/plan-content-parser";
import { replacePlaceholders } from "@/utils/placeholder-utils";
import { normalizeJobResponse } from '@/utils/response-utils';
import { FloatingMergeInstructions } from './FloatingMergeInstructions';
import { useLiveProgress } from "@/hooks/use-live-progress";

interface PlanContentModalProps {
  plan?: BackgroundJob;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onRefreshContent: () => Promise<void>;
  selectedStepNumber?: string | null;
  onStepSelect?: (stepNumber: string | null) => void;
  copyButtons?: CopyButtonConfig[];
  // Navigation props
  currentIndex?: number;
  totalPlans?: number;
  hasPrevious?: boolean;
  hasNext?: boolean;
  onNavigate?: (direction: 'previous' | 'next') => void;
  // Selection props
  isSelected?: boolean;
  onSelect?: (planId: string) => void;
  // Merge instructions props
  mergeInstructions?: string;
  onMergeInstructionsChange?: (value: string) => void;
  selectedCount?: number;
}


const PlanContentModal: React.FC<PlanContentModalProps> = ({
  plan,
  open,
  onOpenChange,
  onRefreshContent,
  selectedStepNumber,
  copyButtons = [],
  // Navigation props
  currentIndex = 0,
  totalPlans = 1,
  hasPrevious = false,
  hasNext = false,
  onNavigate,
  // Selection props
  isSelected = false,
  onSelect,
  // Merge instructions props
  mergeInstructions = "",
  onMergeInstructionsChange,
  selectedCount = 0,
}) => {
  const [isSaving, setIsSaving] = React.useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = React.useState(false);
  const [editedContent, setEditedContent] = React.useState<string>("");
  const [fullPlanDetails, setFullPlanDetails] = React.useState<BackgroundJob | null>(null);
  const [isLoadingFullDetails, setIsLoadingFullDetails] = React.useState(false);
  const { showNotification } = useNotification();
  
  // Get live jobs from context for real-time updates
  const { jobs } = useContext(BackgroundJobsContext) as BackgroundJobsContextType;
  
  // Get the live version of the current plan for real-time streaming updates
  const livePlan = useMemo(() => {
    if (!plan) return null;
    return jobs.find((j: BackgroundJob) => j.id === plan.id) || plan;
  }, [plan, jobs]);
  
  // Fetch full plan details when modal opens or plan changes
  useEffect(() => {
    if (!plan || !open) {
      setFullPlanDetails(null);
      return;
    }

    const fetchFullDetails = async () => {
      setIsLoadingFullDetails(true);
      try {
        const result = await invoke("get_background_job_by_id_command", { jobId: plan.id });
        setFullPlanDetails(result as BackgroundJob);
      } catch (error) {
        console.error("Failed to fetch full plan details:", error);
        // Fallback to using the plan prop
        setFullPlanDetails(plan);
      } finally {
        setIsLoadingFullDetails(false);
      }
    };

    fetchFullDetails();
  }, [plan?.id, open]);

  // Fetch full details when streaming completes
  useEffect(() => {
    if (!livePlan || !open) return;
    
    const isCompleted = livePlan.status === "completed";
    const hasEndTime = !!livePlan.endTime;
    
    // If job is completed but we don't have full details yet, fetch them
    // This handles the case where streaming just finished
    if (isCompleted && hasEndTime && !fullPlanDetails && !isLoadingFullDetails) {
      const fetchFullDetails = async () => {
        try {
          const result = await invoke("get_background_job_by_id_command", { jobId: livePlan.id });
          setFullPlanDetails(result as BackgroundJob);
        } catch (error) {
          console.error("Failed to fetch full plan details after completion:", error);
          // Don't set fullPlanDetails to livePlan here, let it keep trying
        }
      };
      
      // Small delay to ensure streaming has fully stopped and database is updated
      const timeoutId = setTimeout(() => {
        fetchFullDetails();
      }, 1000);
      
      return () => clearTimeout(timeoutId);
    }
    
    return undefined;
  }, [livePlan?.status, livePlan?.endTime, livePlan?.id, open, fullPlanDetails, isLoadingFullDetails]);

  if (!plan) return null;
  
  // Smart plan selection logic:
  // - For streaming jobs: always use live plan for real-time updates
  // - For completed jobs: use full details if available AND if it has more complete content
  const displayPlan = useMemo(() => {
    if (!livePlan) return null;
    
    const isLiveStreaming = JOB_STATUSES.ACTIVE.includes(livePlan.status);
    
    if (isLiveStreaming) {
      // For streaming jobs, always use live plan for real-time updates
      return livePlan;
    } else {
      // For completed jobs, be conservative about switching to full details
      if (fullPlanDetails) {
        // Only use full details if they have more complete content than live plan
        const liveResponseLength = livePlan.response?.length || 0;
        const fullResponseLength = fullPlanDetails.response?.length || 0;
        
        if (fullResponseLength >= liveResponseLength) {
          return fullPlanDetails;
        }
      }
      // Fallback to live plan if full details aren't better
      return livePlan;
    }
  }, [livePlan, fullPlanDetails]);

  if (!displayPlan) return null;


  // Use unified streaming detection with ACTIVE fallback
  const isStreaming = getStreamingStatus(displayPlan?.metadata) || 
                     (displayPlan?.status ? ['queued','running','processing','generating'].includes(displayPlan.status) : false);
  
  // Use live progress hook for consistent real-time updates
  const progress = useLiveProgress(displayPlan);

  // Get streamed content from the live plan during streaming
  const streamedContent = useMemo(() => {
    if (!isStreaming || !displayPlan) return "";
    // Use raw string if available to avoid parsing overhead
    if (typeof displayPlan.response === "string") return displayPlan.response;
    return normalizeJobResponse(displayPlan.response).content;
  }, [isStreaming, displayPlan?.response]);

  // Use consistent language for both states
  const viewerLanguage = "xml";

  // Determine if we should show the loading indicator
  // Only show loading when streaming AND no content has arrived yet
  const showLoadingIndicator = isStreaming && streamedContent.trim() === "";

  // Use centralized utility function for consistent sessionName logic
  const sessionName = getJobDisplaySessionName(displayPlan);

  // Copy button handler with proper notification system
  const handleCopyButtonClick = React.useCallback(async (button: CopyButtonConfig) => {
    try {
      const data = {
        IMPLEMENTATION_PLAN: editedContent,
        STEP_CONTENT: selectedStepNumber ? getContentForStep(editedContent, selectedStepNumber) : ''
      };
      
      const processedContent = replacePlaceholders(button.content, data);
      await navigator.clipboard.writeText(processedContent);
      
      showNotification({
        title: "Copied to clipboard",
        message: `${button.label} copied successfully`,
        type: "success",
        duration: 2000,
      });
    } catch (error) {
      console.error('Failed to copy to clipboard:', error);
      showNotification({
        title: "Copy failed",
        message: "Failed to copy content to clipboard",
        type: "error",
        duration: 3000,
      });
    }
  }, [editedContent, selectedStepNumber, showNotification]);

  // Initialize edited content when plan changes or streaming completes
  React.useEffect(() => {
    // Don't overwrite edited content during streaming
    if (isStreaming) return;
    
    if (displayPlan) {
      const currentContent = normalizeJobResponse(displayPlan.response).content;
      setEditedContent(currentContent);
      setHasUnsavedChanges(false);
    }
  }, [displayPlan?.id, displayPlan?.response, isStreaming]);

  // Handle content changes in the editor
  const handleContentChange = React.useCallback((newContent: string | undefined) => {
    if (newContent !== undefined && displayPlan) {
      setEditedContent(newContent);
      const originalContent = normalizeJobResponse(displayPlan.response).content || "";
      setHasUnsavedChanges(newContent !== originalContent);
    }
  }, [displayPlan?.response]);



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
          <div className="absolute inset-0 bg-background/80 flex items-center justify-center z-50">
            <div className="flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>Loading plan details...</span>
            </div>
          </div>
        )}
        <DialogHeader className="flex flex-row items-start justify-between space-y-0 pb-2 flex-shrink-0">
          <DialogDescription className="sr-only">
            View, edit, and interact with the implementation plan content.
          </DialogDescription>
          <div className="flex-1 min-w-[40%] max-w-[40%]">
            <DialogTitle className="text-lg">
              Implementation Plan: {sessionName}
            </DialogTitle>
          </div>
          
          <div className="flex items-start gap-4 flex-shrink-0 flex-1">
            {/* Status - separate container */}
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
                  {displayPlan.status === "completed" && displayPlan.modelUsed && (
                    <span className="text-xs text-muted-foreground mt-1">
                      {displayPlan.modelUsed}
                    </span>
                  )}
                </div>
              )}
            </div>

            {/* Buttons container with wrapping - separate from status */}
            <div className="flex flex-wrap gap-2 justify-end">
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
              {copyButtons.length > 0 && !isStreaming && 
                copyButtons.map((button) => (
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
                ))
              }
            </div>
          </div>
        </DialogHeader>

        {/* Progress bar for streaming jobs */}
        {isStreaming && (
          <div className="mb-2 flex-shrink-0">
            {progress !== undefined ? (
              <>
                <Progress value={progress} className="h-2" />
                <div className="flex justify-between mt-1 text-xs text-muted-foreground">
                  <span>Generating implementation plan...</span>
                  <span>{Math.round(progress)}%</span>
                </div>
              </>
            ) : (
              <>
                <Progress className="h-2" />
                <div className="flex justify-between mt-1 text-xs text-muted-foreground">
                  <span>Processing implementation plan...</span>
                </div>
              </>
            )}
          </div>
        )}

        {/* Content */}
        <div className="flex-1 min-h-0 relative">
          <VirtualizedCodeViewer
            content={isStreaming ? streamedContent : editedContent}
            height="100%"
            showCopy={false}
            showContentSize={true}
            isLoading={showLoadingIndicator}
            placeholder="No implementation plan content available yet"
            language={viewerLanguage}
            className=""
            readOnly={isStreaming} 
            streamOptimized={isStreaming}
            showFollowToggle={true}
            followStreamingDefault={true}
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
          {(totalPlans > 1 && onNavigate) || onSelect ? (
            <div className="absolute bottom-0 left-1/2 transform -translate-x-1/2 z-10">
              <div className="flex items-center gap-2 bg-card/95 backdrop-blur-sm border border-border rounded-full px-3 py-1.5 shadow-lg">
                {totalPlans > 1 && onNavigate && (
                  <>
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
                  </>
                )}
                
                {onSelect && displayPlan.status === "completed" && (
                  <>
                    {totalPlans > 1 && onNavigate && (
                      <div className="w-px h-4 bg-border mx-1" />
                    )}
                    {isSelected ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => onSelect(displayPlan.id)}
                        className="h-7 px-2 text-xs hover:bg-red-50 dark:hover:bg-red-950/20 text-green-600 dark:text-green-400 hover:text-red-600 dark:hover:text-red-400 border border-green-200 dark:border-green-800 hover:border-red-200 dark:hover:border-red-800 transition-all duration-200"
                        title="Remove from selection"
                      >
                        <Check className="h-3 w-3 mr-1" />
                        Selected
                      </Button>
                    ) : (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => onSelect(displayPlan.id)}
                        className="h-7 px-2 text-xs hover:bg-green-50 dark:hover:bg-green-950/20 text-muted-foreground hover:text-green-600 dark:hover:text-green-400 border border-dashed border-muted-foreground/30 hover:border-green-200 dark:hover:border-green-800 transition-all duration-200"
                        title="Add to selection for merging"
                      >
                        <Plus className="h-3 w-3 mr-1" />
                        Select
                      </Button>
                    )}
                  </>
                )}
              </div>
            </div>
          ) : null}
        </div>

        {/* Floating Merge Instructions - Inside Dialog to prevent modal close */}
        {onMergeInstructionsChange && selectedCount > 0 && (
          <FloatingMergeInstructions
            mergeInstructions={mergeInstructions}
            onMergeInstructionsChange={onMergeInstructionsChange}
            isOpen={true}
          />
        )}

      </DialogContent>
    </Dialog>
  );
};

export default PlanContentModal;
