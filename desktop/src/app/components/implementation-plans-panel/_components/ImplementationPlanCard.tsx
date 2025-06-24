"use client";

import { formatDistanceToNow } from "date-fns";
import { Info, Eye, Trash2, Loader2, Copy } from "lucide-react";


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

import { getStreamingProgressValue, getParsedMetadata } from "../../background-jobs-sidebar/utils";
import { getJobDisplaySessionName } from "../../background-jobs-sidebar/_utils/job-display-utils";

import React from "react";

interface ImplementationPlanCardProps {
  plan: BackgroundJob;
  onViewContent: (plan: BackgroundJob) => void;
  onViewDetails: (plan: BackgroundJob) => void;
  onDelete: (jobId: string) => void;
  isDeleting: boolean;
  copyButtons?: CopyButtonConfig[];
  onCopyButtonClick?: (buttonConfig: CopyButtonConfig, plan: BackgroundJob) => void;
}

const ImplementationPlanCard = React.memo<ImplementationPlanCardProps>(({
  plan,
  onViewContent,
  onViewDetails,
  onDelete,
  isDeleting,
  copyButtons = [],
  onCopyButtonClick,
}) => {
  const parsedMeta = getParsedMetadata(plan.metadata);
  const isStreaming = JOB_STATUSES.ACTIVE.includes(plan.status) &&
                     ["running", "processing_stream", "generating_stream"].includes(plan.status);
  const progress = getStreamingProgressValue(
    plan.metadata,
    plan.startTime
  );

  // Parse the model information from plan metadata with priority order
  const modelInfo = (() => {
    const model = plan.modelUsed || parsedMeta?.taskData?.modelUsed;
    if (!model || typeof model !== 'string') return 'Unknown Model';
    
    // Format common model names for better display
    if (model.includes("gemini")) {
      return model.replace("gemini-", "Google Gemini ");
    } else if (model.includes("claude")) {
      return model.replace(/-\d{8}$/, ""); // Remove date suffix
    } else if (model.includes("gpt")) {
      return model.toUpperCase();
    }
    return model;
  })();

  // Calculate estimated token count if available - check job fields first, then metadata
  let tokenCountDisplay = "N/A";
  const tokensSent = Number(plan.tokensSent || parsedMeta?.taskData?.tokensSent || 0);
  const tokensReceived = Number(plan.tokensReceived || parsedMeta?.taskData?.tokensReceived || 0);
  const totalTokens = (tokensSent + tokensReceived) || 
                     Number(parsedMeta?.taskData?.totalTokens || parsedMeta?.taskData?.tokensUsed || 0);
  
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
  const hasContent = !!plan.response || isStreaming;

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
        <div className="flex justify-between">
          <CardTitle className="text-base">{sessionName}</CardTitle>
          <div className="text-xs text-muted-foreground">{timeAgo}</div>
        </div>
        <CardDescription className="flex flex-wrap gap-x-2 text-xs">
          <span>{modelInfo}</span>
          <span>•</span>
          <span>{tokenCountDisplay} tokens</span>
        </CardDescription>
      </CardHeader>

      <CardContent className="pb-4 pt-0">
        {/* Progress indicator for streaming jobs */}
        {isStreaming && (
          <div className="mb-3">
            <Progress value={progress ?? 0} className="h-1.5" />
            <div className="flex justify-between mt-1 text-xs text-muted-foreground">
              <span>Generating implementation plan...</span>
              <span>{Math.round(progress ?? 0)}%</span>
            </div>
          </div>
        )}

        {/* Actions bar */}
        <div className="flex justify-between mt-2">
          <div className="space-x-1 flex flex-wrap">
            <Button
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
              variant="outline"
              size="sm"
              className="text-xs h-7 px-2 py-1"
              onClick={() => onViewDetails(plan)}
            >
              <Info className="mr-1 h-3.5 w-3.5" />
              Details
            </Button>

            <Button
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
