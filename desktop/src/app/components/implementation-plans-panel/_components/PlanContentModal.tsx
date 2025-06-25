"use client";

import { Loader2, Copy, Save } from "lucide-react";
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

interface PlanContentModalProps {
  plan?: BackgroundJob;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onRefreshContent: () => Promise<void>;
  selectedStepNumber?: string | null;
  onStepSelect?: (stepNumber: string | null) => void;
  copyButtons?: CopyButtonConfig[];
  onCopyButtonClick?: (buttonConfig: CopyButtonConfig) => void;
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
    isRunning ? getStreamingProgressValue(metadata, startTime, taskType) : undefined
  );

  useEffect(() => {
    if (!isRunning) {
      setProgress(undefined);
      return;
    }

    const updateProgress = () => {
      const newProgress = getStreamingProgressValue(metadata, startTime, taskType);
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
}) => {
  const [isSaving, setIsSaving] = React.useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = React.useState(false);
  const [editedContent, setEditedContent] = React.useState<string>("");
  const { showNotification } = useNotification();

  if (!plan) return null;

  const isStreaming = JOB_STATUSES.ACTIVE.includes(plan.status) &&
                     (plan.status === "running" || plan.status === "processingStream" || plan.status === "generatingStream");
  
  // Use live progress hook for consistent and real-time updates
  const progress = useLiveProgress(
    plan.metadata,
    plan.startTime,
    plan.taskType, // Now includes taskType for proper calculation
    isStreaming
  );

  let displayContent = "No content available yet.";
  let viewerLanguage = "xml"; // Default to XML for implementation plans

  if (plan) {
    if (isStreaming) { 
      displayContent = plan.response || "Streaming content...";
      // viewerLanguage remains "xml" as LLM is instructed to output XML
    } else if (plan.status === "completed") {
      // Use edited content if available and has changes, otherwise use original
      displayContent = hasUnsavedChanges ? editedContent : parsePlanResponseContent(plan.response);
      // viewerLanguage remains "xml" for the parsed original content
    } else if (plan.response) { // For other non-streaming, non-completed states with a response
      displayContent = hasUnsavedChanges ? editedContent : plan.response;
      // Potentially could be error messages, but stick to "xml" or "markdown"
      // if error, it might not be XML. For now, assume "xml" is fine.
    }
  }

  // Determine if we should show the loading indicator
  // Only show loading when streaming AND no content has arrived yet
  const showLoadingIndicator = isStreaming && (!plan.response || plan.response.trim() === "");

  // Use centralized utility function for consistent sessionName logic
  const sessionName = getJobDisplaySessionName(plan);

  // Default copy button handler using replacePlaceholders
  const handleCopyButtonClick = React.useCallback(async (button: CopyButtonConfig) => {
    if (onCopyButtonClick) {
      onCopyButtonClick(button);
      return;
    }
    
    // Default implementation using replacePlaceholders
    try {
      const data = {
        IMPLEMENTATION_PLAN: displayContent,
        STEP_CONTENT: selectedStepNumber ? getContentForStep(displayContent, selectedStepNumber) : ''
      };
      
      const processedContent = replacePlaceholders(button.content, data);
      await navigator.clipboard.writeText(processedContent);
    } catch (error) {
      console.error('Failed to copy to clipboard:', error);
    }
  }, [onCopyButtonClick, displayContent, selectedStepNumber]);

  // Initialize edited content when plan changes
  React.useEffect(() => {
    if (plan && !isStreaming) {
      const currentContent = plan.status === "completed" 
        ? parsePlanResponseContent(plan.response)
        : plan.response || "";
      setEditedContent(currentContent);
      setHasUnsavedChanges(false);
    }
  }, [plan?.id, plan?.response, plan?.status, isStreaming]);

  // Handle content changes in the editor
  const handleContentChange = React.useCallback((newContent: string | undefined) => {
    if (newContent !== undefined && plan) {
      setEditedContent(newContent);
      const originalContent = plan.status === "completed" 
        ? parsePlanResponseContent(plan.response)
        : plan.response || "";
      setHasUnsavedChanges(newContent !== originalContent);
    }
  }, [plan?.response, plan?.status]);

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


  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl h-[95vh] !flex !flex-col !gap-0 text-foreground !bg-card rounded-xl shadow-lg !backdrop-blur-none">
        <DialogHeader className="flex flex-row items-center justify-between space-y-0 pb-2 flex-shrink-0">
          <DialogTitle className="text-lg">
            Implementation Plan: {sessionName}
          </DialogTitle>
          
          <div className="flex items-center gap-3">
            {/* Status */}
            <div className="text-sm text-muted-foreground flex items-center">
              {isStreaming ? (
                <span className="flex items-center">
                  <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                  Generating plan...
                </span>
              ) : (
                <span>
                  {plan.status === "completed" ? "Completed" : plan.status}
                </span>
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
        <div className="flex-1 min-h-0">
          <VirtualizedCodeViewer
            content={displayContent}
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
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default PlanContentModal;
