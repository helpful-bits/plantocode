"use client";

import { Loader2, RefreshCw, Copy } from "lucide-react";
import React from "react";

import { type BackgroundJob, JOB_STATUSES } from "@/types/session-types";
import { type CopyButtonConfig } from "@/types/config-types";
import { Button } from "@/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/ui/dialog";
import { Progress } from "@/ui/progress";
import { VirtualizedCodeViewer } from "@/ui/virtualized-code-viewer";

import { getStreamingProgressValue } from "../../background-jobs-sidebar/utils";
import { getJobDisplaySessionName } from "../../background-jobs-sidebar/_utils/job-display-utils";
import { parsePlanResponseContent, extractStepsFromPlan } from "../_utils/plan-content-parser";

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

const PlanContentModal: React.FC<PlanContentModalProps> = ({
  plan,
  open,
  onOpenChange,
  onRefreshContent,
  selectedStepNumber,
  onStepSelect,
  copyButtons = [],
  onCopyButtonClick,
}) => {
  const [isRefreshing, setIsRefreshing] = React.useState(false);

  if (!plan) return null;

  const isStreaming = JOB_STATUSES.ACTIVE.includes(plan.status) &&
                     (plan.status === "running" || plan.status === "processingStream" || plan.status === "generatingStream");
  const progress = getStreamingProgressValue(
    plan.metadata,
    plan.startTime
  );

  let displayContent = "No content available yet.";
  let viewerLanguage = "xml"; // Default to XML for implementation plans

  if (plan) {
    if (isStreaming) { 
      displayContent = plan.response || "Streaming content...";
      // viewerLanguage remains "xml" as LLM is instructed to output XML
    } else if (plan.status === "completed") {
      displayContent = parsePlanResponseContent(plan.response);
      // viewerLanguage remains "xml" for the parsed original content
    } else if (plan.response) { // For other non-streaming, non-completed states with a response
      displayContent = plan.response;
      // Potentially could be error messages, but stick to "xml" or "markdown"
      // if error, it might not be XML. For now, assume "xml" is fine.
    }
  }

  // Determine if we should show the loading indicator
  // Only show loading when streaming AND no content has arrived yet
  const showLoadingIndicator = isStreaming && (!plan.response || plan.response.trim() === "");

  // Use centralized utility function for consistent sessionName logic
  const sessionName = getJobDisplaySessionName(plan);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await onRefreshContent();
    } finally {
      setIsRefreshing(false);
    }
  };

  // Extract steps from the plan for step-specific copy buttons
  const steps = React.useMemo(() => {
    return extractStepsFromPlan(plan.response);
  }, [plan.response]);


  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl h-[95vh] !flex !flex-col !gap-0 text-foreground !bg-card rounded-xl shadow-lg !backdrop-blur-none">
        <DialogHeader>
          <DialogTitle className="text-lg">
            Implementation Plan: {sessionName}
          </DialogTitle>
        </DialogHeader>

        {/* Controls */}
        <div className="flex justify-between items-center mb-2">
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

          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleRefresh}
              disabled={isRefreshing}
            >
              <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
              Refresh
            </Button>
          </div>
        </div>

        {/* Step Selection */}
        {steps.length > 0 && !isStreaming && (
          <div className="mb-3">
            <div className="text-xs text-muted-foreground mb-2">Select step for copy buttons:</div>
            <div className="flex flex-wrap gap-2">
              <Button
                variant={selectedStepNumber === null ? "default" : "outline"}
                size="sm"
                onClick={() => onStepSelect?.(null)}
                className="text-xs h-7"
              >
                Full Plan
              </Button>
              {steps.map((step) => (
                <Button
                  key={step.number}
                  variant={selectedStepNumber === step.number ? "default" : "outline"}
                  size="sm"
                  onClick={() => onStepSelect?.(step.number)}
                  className="text-xs h-7"
                  title={step.title}
                >
                  Step {step.number}
                </Button>
              ))}
            </div>
          </div>
        )}
        
        {/* Configurable Copy Buttons */}
        {copyButtons.length > 0 && !isStreaming && (
          <div className="mb-3">
            <div className="text-xs text-muted-foreground mb-2">Copy with template:</div>
            <div className="flex flex-wrap gap-2">
              {copyButtons.map((button) => (
                <Button
                  key={button.id}
                  variant="outline"
                  size="sm"
                  onClick={() => onCopyButtonClick?.(button)}
                  className="text-xs h-7"
                  title={`Copy: ${button.label}`}
                >
                  <Copy className="h-3 w-3 mr-1" />
                  {button.label}
                </Button>
              ))}
            </div>
          </div>
        )}

        {/* Progress bar for streaming jobs */}
        {isStreaming && (
          <div className="mb-4">
            <Progress value={progress ?? 0} className="h-2" />
            <div className="flex justify-between mt-1 text-xs text-muted-foreground">
              <span>Generating implementation plan...</span>
              <span>{Math.round(progress ?? 0)}%</span>
            </div>
          </div>
        )}


        {/* Content */}
        <VirtualizedCodeViewer
          content={displayContent}
          height="calc(100% - 8rem)"
          showCopy={true}
          copyText="Copy Plan"
          showContentSize={true}
          isLoading={showLoadingIndicator}
          placeholder="No implementation plan content available yet"
          language={viewerLanguage}
          className="mt-2"
          loadingIndicator={
            <div className="flex items-center justify-center h-full">
              <div className="flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span className="text-sm text-muted-foreground">Generating implementation plan...</span>
              </div>
            </div>
          }
        />
      </DialogContent>
    </Dialog>
  );
};

export default PlanContentModal;
