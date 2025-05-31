"use client";

import { Loader2, RefreshCw } from "lucide-react";
import React from "react";

import { type BackgroundJob, JOB_STATUSES } from "@/types/session-types";
import { Alert, AlertDescription } from "@/ui/alert";
import { Button } from "@/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/ui/dialog";
import { Progress } from "@/ui/progress";
import { VirtualizedCodeViewer } from "@/ui/virtualized-code-viewer";

import { getStreamingProgressValue, getParsedMetadata } from "../../background-jobs-sidebar/utils";

interface PlanContentModalProps {
  plan?: BackgroundJob;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pollingError?: string;
  onRefreshContent: (jobId: string) => Promise<void>;
}

const PlanContentModal: React.FC<PlanContentModalProps> = ({
  plan,
  open,
  onOpenChange,
  pollingError,
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
  const planContent = plan.response || "No content available yet";
  const parsedMetadata = getParsedMetadata(plan.metadata);
  const sessionName = parsedMetadata?.sessionName || "Untitled Session";

  const handleRefresh = async () => {
    if (!plan) return;
    setIsRefreshing(true);
    try {
      await onRefreshContent(plan.id);
    } finally {
      setIsRefreshing(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col">
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

        {/* Error message */}
        {pollingError && (
          <Alert variant="destructive" className="mb-4">
            <AlertDescription>{pollingError}</AlertDescription>
          </Alert>
        )}

        {/* Content */}
        <VirtualizedCodeViewer
          content={planContent}
          height="60vh"
          showCopy={true}
          copyText="Copy Plan"
          showContentSize={true}
          isLoading={isStreaming}
          placeholder="No implementation plan content available yet"
          language="markdown"
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
