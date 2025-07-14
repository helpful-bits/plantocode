"use client";

import { formatDistanceToNow } from "date-fns";
import { Info, Eye, Trash2, Loader2, Copy } from "lucide-react";
import React, { useState, useEffect } from "react";

import { type BackgroundJob, JOB_STATUSES } from "@/types/session-types";
import { type CopyButtonConfig } from "@/types/config-types";
import { Button } from "@/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/ui/card";
import { Progress } from "@/ui/progress";
// Note: Using native checkbox as there's no Checkbox component in the UI library

import { getStreamingProgressValue, getParsedMetadata } from "../../background-jobs-sidebar/utils";
import { getJobDisplaySessionName } from "../../background-jobs-sidebar/_utils/job-display-utils";

interface ImplementationPlanCardProps {
  plan: BackgroundJob;
  onViewContent: (plan: BackgroundJob) => void;
  onViewDetails: (plan: BackgroundJob) => void;
  onDelete: (jobId: string) => void;
  isDeleting: boolean;
  copyButtons?: CopyButtonConfig[];
  onCopyButtonClick?: (buttonConfig: CopyButtonConfig, plan: BackgroundJob) => void;
  isSelected?: boolean;
  onToggleSelection?: (jobId: string) => void;
}

/**
 * Custom hook for live progress updates in Implementation Plan cards
 * Updates progress every second for running jobs
 * Reflects accurate streamProgress from metadata
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

const ImplementationPlanCard = React.memo<ImplementationPlanCardProps>(({
  plan,
  onViewContent,
  onViewDetails,
  onDelete,
  isDeleting,
  copyButtons = [],
  onCopyButtonClick,
  isSelected = false,
  onToggleSelection,
}) => {
  const parsedMeta = getParsedMetadata(plan.metadata);
  
  // Extract the plan title from metadata
  const planTitle = String(parsedMeta?.planTitle || parsedMeta?.generated_title || "");
  
  // Helper function to truncate long titles
  const truncateTitle = (title: string, maxLength: number = 80) => {
    if (title.length <= maxLength) return title;
    return `${title.substring(0, maxLength - 3)}...`;
  };
  const isStreaming = JOB_STATUSES.ACTIVE.includes(plan.status) &&
                     ["running", "processing_stream", "generating_stream"].includes(plan.status);
  
  // Use live progress hook for consistent and real-time updates
  const progress = useLiveProgress(
    plan.metadata,
    plan.startTime,
    plan.taskType, // Now includes taskType for proper calculation
    isStreaming
  );

  // Parse the model information from plan metadata with priority order
  const modelInfo = (() => {
    const model = plan.modelUsed || parsedMeta?.taskData?.modelUsed;
    if (!model || typeof model !== 'string') return 'Unknown Model';
    
    // Return raw model name without formatting
    return model;
  })();

  // Display token count directly from plan object (server-provided data)
  let tokenCountDisplay = "N/A";
  const tokensSent = Number(plan.tokensSent || 0);
  const tokensReceived = Number(plan.tokensReceived || 0);
  const totalTokens = tokensSent + tokensReceived;
  
  if (totalTokens > 0) {
    tokenCountDisplay = totalTokens.toLocaleString();
  } else if (isStreaming) {
    tokenCountDisplay = "Thinking...";
  }

  // Format timestamps
  const timeAgo = plan.updatedAt
    ? formatDistanceToNow(new Date(plan.updatedAt), { addSuffix: true })
    : "Unknown time";

  // Extract session name using centralized utility function
  const sessionName = getJobDisplaySessionName(plan);

  // Determine if the job has content to display
  // For completed jobs, we assume they have content (will be fetched on demand)
  // For streaming jobs, we can view the stream
  const hasContent = JOB_STATUSES.COMPLETED.includes(plan.status) || isStreaming;

  return (
    <Card className="relative mb-4 overflow-hidden">
      {/* Status indicator strip on the left side */}
      <div
        className={`absolute left-0 top-0 bottom-0 w-1 ${
          JOB_STATUSES.COMPLETED.includes(plan.status)
            ? "bg-success"
            : JOB_STATUSES.FAILED.includes(plan.status)
              ? "bg-destructive"
              : isStreaming
                ? "bg-primary"
                : "bg-warning"
        }`}
      />

      <CardHeader className="pb-2">
        <div className="flex justify-between items-start">
          <div className="flex items-start gap-2 flex-1">
            {onToggleSelection && JOB_STATUSES.COMPLETED.includes(plan.status) && (
              <input
                type="checkbox"
                checked={isSelected}
                onChange={() => onToggleSelection(plan.id)}
                className="mt-0.5 h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
              />
            )}
            <div className="flex-1">
              <CardTitle className="text-base">
                {truncateTitle(planTitle || plan.prompt || sessionName || "Implementation Plan")}
              </CardTitle>
              <CardDescription className="flex flex-wrap gap-x-2 text-xs mt-1">
                {plan.taskType === "implementation_plan_merge" && (
                  <>
                    <span className="text-primary font-medium">Merged</span>
                    <span>•</span>
                  </>
                )}
                <span>{modelInfo}</span>
                <span>•</span>
                <span>{tokenCountDisplay} tokens</span>
              </CardDescription>
            </div>
          </div>
          <div className="text-xs text-muted-foreground">{timeAgo}</div>
        </div>
      </CardHeader>

      <CardContent className="pb-4 pt-0">
        {/* Progress indicator for streaming jobs */}
        {isStreaming && (
          <div className="mb-3">
            {(() => {
              // Show indeterminate progress if no accurate progress available
              const displayProgress = progress;
              
              if (displayProgress !== undefined) {
                return (
                  <React.Fragment key="progress-fragment">
                    <Progress value={displayProgress} className="h-1.5" />
                    <div className="flex justify-between mt-1 text-xs text-muted-foreground">
                      <span>Generating implementation plan...</span>
                      <span>{Math.round(displayProgress)}%</span>
                    </div>
                  </React.Fragment>
                );
              } else {
                // Show indeterminate progress when no progress data available
                return (
                  <React.Fragment key="progress-fragment">
                    <Progress value={undefined} className="h-1.5" />
                    <div className="flex justify-between mt-1 text-xs text-muted-foreground">
                      <span>Generating implementation plan...</span>
                      <span>Processing...</span>
                    </div>
                  </React.Fragment>
                );
              }
            })()}
          </div>
        )}

        {/* Actions bar */}
        <div className="flex justify-between mt-2">
          <div className="space-x-1 flex flex-wrap">
            <Button
              key="view-content"
              variant="outline"
              size="sm"
              className="text-xs h-7 px-2 py-1"
              disabled={!hasContent}
              onClick={() => onViewContent(plan)}
            >
              <Eye className="mr-1 h-3.5 w-3.5" />
              {isStreaming ? "View Stream" : "View Content"}
            </Button>

            {/* Copy buttons */}
            {copyButtons.length > 0 && !isStreaming && hasContent && (
              copyButtons.map((button) => (
                <Button
                  key={button.id}
                  variant="outline"
                  size="sm"
                  className="text-xs h-7 px-2 py-1"
                  onClick={() => onCopyButtonClick?.(button, plan)}
                  title={`Copy: ${button.label}`}
                >
                  <Copy className="mr-1 h-3 w-3" />
                  {button.label}
                </Button>
              ))
            )}
          </div>

          <div className="space-x-1">
            <Button
              key="details"
              variant="outline"
              size="sm"
              className="text-xs h-7 px-2 py-1"
              onClick={() => onViewDetails(plan)}
            >
              <Info className="mr-1 h-3.5 w-3.5" />
              Details
            </Button>

            <Button
              key="delete"
              variant="outline"
              size="sm"
              className="text-xs h-7 px-2 py-1 text-destructive hover:text-destructive hover:bg-destructive/10"
              isLoading={isDeleting}
              onClick={() => onDelete(plan.id)}
              disabled={isDeleting}
            >
              {isDeleting ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Trash2 className="h-3.5 w-3.5" />
              )}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
});

ImplementationPlanCard.displayName = "ImplementationPlanCard";

export default ImplementationPlanCard;
