"use client";

import { Loader2, RefreshCw } from "lucide-react";
import React from "react";

import { type BackgroundJob, JOB_STATUSES } from "@/types/session-types";
import { Button } from "@/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/ui/dialog";
import { Progress } from "@/ui/progress";
import { VirtualizedCodeViewer } from "@/ui/virtualized-code-viewer";

import { getStreamingProgressValue, getParsedMetadata } from "../../background-jobs-sidebar/utils";
import { parsePlanResponseContent } from "../_utils/plan-content-parser";

interface PlanContentModalProps {
  plan?: BackgroundJob;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onRefreshContent: () => Promise<void>;
}

const PlanContentModal: React.FC<PlanContentModalProps> = ({
  plan,
  open,
  onOpenChange,
  onRefreshContent,
}) => {
  const [isRefreshing, setIsRefreshing] = React.useState(false);

  if (!plan) return null;

  const isStreaming = JOB_STATUSES.ACTIVE.includes(plan.status) &&
                     (plan.status === "running" || plan.status === "processing_stream" || plan.status === "generating_stream");
  const progress = getStreamingProgressValue(
    plan.metadata,
    plan.startTime,
    plan.maxOutputTokens
  );

  let displayContent = "No content available yet.";
  let viewerLanguage = "xml"; // Default to XML for implementation plans

  if (plan) {
    if (isStreaming) { // isStreaming is already defined in the component
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

  const parsedMetadata = getParsedMetadata(plan.metadata);
  const sessionName = (() => {
    // Priority 1: Check additionalParams.sessionName
    if (parsedMetadata?.additionalParams?.sessionName && typeof parsedMetadata.additionalParams.sessionName === 'string') {
      return parsedMetadata.additionalParams.sessionName;
    }
    
    // Priority 2: Check nested payload data
    if (parsedMetadata?.sessionName && typeof parsedMetadata.sessionName === 'string') {
      return parsedMetadata.sessionName;
    }
    
    // Priority 3: Check job payload for session name
    if (parsedMetadata?.parsedJobPayload?.data?.sessionName && typeof parsedMetadata.parsedJobPayload.data.sessionName === 'string') {
      return parsedMetadata.parsedJobPayload.data.sessionName;
    }
    
    // Priority 4: Use plan title if available
    if (parsedMetadata?.additionalParams?.planTitle && typeof parsedMetadata.additionalParams.planTitle === 'string') {
      return parsedMetadata.additionalParams.planTitle;
    }
    
    // Priority 5: Extract meaningful content from the first line of the prompt
    if (plan.prompt && typeof plan.prompt === 'string' && plan.prompt.trim()) {
      const firstLine = plan.prompt.trim().split('\n')[0].trim();
      if (firstLine.length > 0) {
        return firstLine.length > 60 ? firstLine.substring(0, 60) + '...' : firstLine;
      }
    }
    
    return "Untitled Session";
  })();

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await onRefreshContent();
    } finally {
      setIsRefreshing(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl max-h-[90vh] !flex !flex-col !gap-0 text-foreground !bg-card rounded-xl shadow-lg !backdrop-blur-none">
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

        {/* Progress bar for streaming jobs */}
        {isStreaming && (
          <div className="mb-4">
            <Progress value={progress} className="h-2" />
            <div className="flex justify-between mt-1 text-xs text-muted-foreground">
              <span>Generating implementation plan...</span>
              <span>{Math.round(progress ?? 0)}%</span>
            </div>
          </div>
        )}


        {/* Content */}
        <VirtualizedCodeViewer
          content={displayContent}
          height="60vh"
          showCopy={true}
          copyText="Copy Plan"
          showContentSize={true}
          isLoading={isStreaming}
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
