"use client";

import { ClipboardCopy, Loader2, RefreshCw } from "lucide-react";
import React from "react";

import { type BackgroundJob } from "@/types/session-types";
import { Alert, AlertDescription } from "@/ui/alert";
import { Button } from "@/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/ui/dialog";
import { Progress } from "@/ui/progress";
import { ScrollArea } from "@/ui/scroll-area";

import { getStreamingProgressValue } from "../../background-jobs-sidebar/utils";

// Define streaming statuses for consistent checking
const STREAMING_STATUSES = [
  "running",
  "processing_stream",
  "generating_stream",
];

interface PlanContentModalProps {
  plan: BackgroundJob | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pollingError: string | null;
  onCopyContent: (text: string) => void;
  onRefreshContent: (jobId: string) => Promise<void>;
}

const PlanContentModal: React.FC<PlanContentModalProps> = ({
  plan,
  open,
  onOpenChange,
  pollingError,
  onCopyContent,
  onRefreshContent,
}) => {
  const [isRefreshing, setIsRefreshing] = React.useState(false);

  if (!plan) return null;

  const isStreaming = STREAMING_STATUSES.includes(plan.status.toLowerCase());
  const progress = getStreamingProgressValue(
    plan.metadata,
    plan.startTime,
    plan.maxOutputTokens
  );
  const planContent = plan.response || "No content available yet";
  const sessionName = plan.metadata?.sessionName || "Untitled Session";

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
              isLoading={isRefreshing}
              disabled={isRefreshing}
            >
              <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
              Refresh
            </Button>

            <Button
              variant="outline"
              size="sm"
              onClick={() => onCopyContent(planContent)}
              disabled={!planContent}
            >
              <ClipboardCopy className="h-3.5 w-3.5 mr-1.5" />
              Copy
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
        <ScrollArea className="flex-grow border rounded-md bg-card p-4 mt-2 relative min-h-[60vh]">
          <pre className="whitespace-pre-wrap text-sm">{planContent}</pre>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
};

export default PlanContentModal;
