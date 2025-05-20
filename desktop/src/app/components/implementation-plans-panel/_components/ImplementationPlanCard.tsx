"use client";

import { formatDistanceToNow } from "date-fns";
import { ClipboardCopy, Info, Eye, Trash2, Loader2 } from "lucide-react";


import { type BackgroundJob } from "@/types/session-types";
import { Button } from "@/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/ui/card";
import { Progress } from "@/ui/progress";

import { getStreamingProgressValue } from "../../background-jobs-sidebar/utils";

import type React from "react";

// Define streaming statuses for consistent checking
const STREAMING_STATUSES = [
  "running",
  "processing_stream",
  "generating_stream",
];

interface ImplementationPlanCardProps {
  plan: BackgroundJob;
  onCopyContent: (text: string, jobId: string) => void;
  onViewContent: (plan: BackgroundJob) => void;
  onViewDetails: (plan: BackgroundJob) => void;
  onDelete: (jobId: string) => void;
  isDeleting: boolean;
  copiedPlanId: string | null;
}

const ImplementationPlanCard: React.FC<ImplementationPlanCardProps> = ({
  plan,
  onCopyContent,
  onViewContent,
  onViewDetails,
  onDelete,
  isDeleting,
  copiedPlanId,
}) => {
  const isStreaming = STREAMING_STATUSES.includes(plan.status.toLowerCase());
  const progress = getStreamingProgressValue(
    plan.metadata,
    plan.startTime,
    plan.maxOutputTokens
  );

  // Parse the model information from plan metadata if available
  const modelInfo = plan.metadata?.modelInfo
    ? `${(plan.metadata.modelInfo as any)?.modelName || (plan.metadata.modelInfo as any)?.model || 'Unknown'}`
    : "Unknown model";

  // Calculate estimated token count if available in metadata
  let tokenCount = "Unknown";
  if (plan.metadata?.tokenCount !== undefined) {
    if (typeof plan.metadata.tokenCount === 'number') {
      tokenCount = plan.metadata.tokenCount.toLocaleString();
    } else if (plan.metadata.tokenCount !== null) {
      // Handle non-number token count safely with safe string conversion
      if (plan.metadata.tokenCount === null) {
        tokenCount = "Unknown";
      } else {
        // Safe handling of any value type by converting to string in a controlled way
        try {
          const numericValue = typeof plan.metadata.tokenCount === 'object' 
            ? parseInt(JSON.stringify(plan.metadata.tokenCount).replace(/[^0-9]/g, '') || '0', 10)
            : parseInt(String(plan.metadata.tokenCount).replace(/[^0-9]/g, '') || '0', 10);
          
          tokenCount = numericValue > 0 ? `~${numericValue.toLocaleString()}` : "Unknown";
        } catch {
          tokenCount = "Unknown";
        }
      }
    }
  } else if (plan.metadata?.estimatedTokens !== undefined) {
    if (typeof plan.metadata.estimatedTokens === 'number') {
      tokenCount = plan.metadata.estimatedTokens.toLocaleString();
    } else if (plan.metadata.estimatedTokens !== null) {
      // Handle non-number token count safely with safe string conversion
      if (plan.metadata.estimatedTokens === null) {
        tokenCount = "Unknown";
      } else {
        // Safe handling of any value type by converting to string in a controlled way
        try {
          const numericValue = typeof plan.metadata.estimatedTokens === 'object' 
            ? parseInt(JSON.stringify(plan.metadata.estimatedTokens).replace(/[^0-9]/g, '') || '0', 10) 
            : parseInt(String(plan.metadata.estimatedTokens).replace(/[^0-9]/g, '') || '0', 10);
          
          tokenCount = numericValue > 0 ? `~${numericValue.toLocaleString()}` : "Unknown";
        } catch {
          tokenCount = "Unknown";
        }
      }
    }
  }

  // Format timestamps
  const timeAgo = plan.updatedAt
    ? formatDistanceToNow(new Date(plan.updatedAt), { addSuffix: true })
    : "Unknown time";

  // Extract session name
  const sessionName = plan.metadata?.sessionName || "Untitled Session";

  // Determine if the job has content to display
  const hasContent = !!plan.response || isStreaming;

  return (
    <Card className="relative mb-4 overflow-hidden">
      {/* Status indicator strip on the left side */}
      <div
        className={`absolute left-0 top-0 bottom-0 w-1 ${
          plan.status === "completed"
            ? "bg-green-500"
            : plan.status === "failed"
              ? "bg-red-500"
              : isStreaming
                ? "bg-blue-500"
                : "bg-amber-500"
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
          <span>{tokenCount} tokens</span>
        </CardDescription>
      </CardHeader>

      <CardContent className="pb-4 pt-0">
        {/* Progress indicator for streaming jobs */}
        {isStreaming && (
          <div className="mb-3">
            <Progress value={progress} className="h-1.5" />
            <div className="flex justify-between mt-1 text-xs text-muted-foreground">
              <span>Generating implementation plan...</span>
              <span>{Math.round(progress ?? 0)}%</span>
            </div>
          </div>
        )}

        {/* Actions bar */}
        <div className="flex justify-between mt-2">
          <div className="space-x-1">
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

            <Button
              variant="outline"
              size="sm"
              className="text-xs h-7 px-2 py-1"
              disabled={!plan.response}
              onClick={() =>
                plan.response && onCopyContent(plan.response, plan.id)
              }
            >
              <ClipboardCopy className="mr-1 h-3.5 w-3.5" />
              {copiedPlanId === plan.id ? "Copied!" : "Copy"}
            </Button>
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
};

export default ImplementationPlanCard;
