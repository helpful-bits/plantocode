"use client";

import { formatDistanceToNow } from "date-fns";
import { Info, Eye, Trash2, Loader2, Copy, Terminal, Circle, Check, AlertTriangle } from "lucide-react";
import React from "react";

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
import { Checkbox } from "@/ui/checkbox";

import { getParsedMetadata } from "../../background-jobs-sidebar/utils";
import { useLiveProgress } from "@/hooks/use-live-progress";
import { useTerminalSessions } from "@/contexts/terminal-sessions/useTerminalSessions";

// Performance profiling example (enable locally during investigations):
// import { withProfiler } from "@/utils/react-performance-profiler";
// export default withProfiler(ImplementationPlanCard, "ImplementationPlanCard");

interface ImplementationPlanCardProps {
  plan: BackgroundJob;
  onViewContent: (plan: BackgroundJob) => void;
  onViewDetails: (plan: BackgroundJob) => void;
  onDelete: (jobId: string) => void;
  isDeleting: boolean;
  copyButtons?: CopyButtonConfig[];
  onCopyButtonClick?: (buttonConfig: CopyButtonConfig, plan: BackgroundJob) => void;
  onPreloadPlanContent?: () => void;
  isSelected?: boolean;
  onToggleSelection?: (jobId: string) => void;
  onViewTerminal?: (planId: string) => void;
}


const ImplementationPlanCard = React.memo<ImplementationPlanCardProps>(({
  plan,
  onViewContent,
  onViewDetails,
  onDelete,
  isDeleting,
  copyButtons = [],
  onCopyButtonClick,
  onPreloadPlanContent,
  isSelected = false,
  onToggleSelection,
  onViewTerminal,
}) => {
  const { getSession, getAttention } = useTerminalSessions();
  const terminalSession = getSession(plan.id);
  const attention = getAttention(plan.id);
  const parsedMeta = getParsedMetadata(plan.metadata);

  const planTitle = String(parsedMeta?.planTitle || parsedMeta?.generated_title || "Implementation Plan");
  
  // Helper function to truncate long titles
  const truncateTitle = (title: string, maxLength: number = 80) => {
    if (title.length <= maxLength) return title;
    return `${title.substring(0, maxLength - 3)}...`;
  };
  // Check if actively streaming (running status but no content yet)
  const hasResponseContent = plan.response && plan.response.trim().length > 0;
  const isStreaming = JOB_STATUSES.ACTIVE.includes(plan.status) &&
                     ["running", "processingStream", "generatingStream"].includes(plan.status) &&
                     !hasResponseContent;
  
  // Use live progress hook for consistent real-time updates
  const progress = useLiveProgress(plan);

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

  // Determine if the job has content to display
  // For completed jobs, we assume they have content (will be fetched on demand)
  // For streaming jobs, we can view the stream
  // For running jobs with content, we can view the delivered content
  const hasContent = JOB_STATUSES.COMPLETED.includes(plan.status) || isStreaming || hasResponseContent;

  // Check if the plan is ready for terminal access
  const isPlanReadyForTerminal = JOB_STATUSES.COMPLETED.includes(plan.status);

  // Get attention icon with priority over status icon
  const getAttentionIcon = () => {
    // Check for attention first (priority)
    if (attention && attention.level) {
      const attentionColors = {
        high: 'text-red-500',
        medium: 'text-yellow-500',
        low: 'text-blue-500'
      };
      return (
        <AlertTriangle
          className={`h-3 w-3 ${attentionColors[attention.level]}`}
          data-testid="attention-icon"
        />
      );
    }

    // Check subStatusMessage for attention keywords
    if (parsedMeta?.subStatusMessage) {
      const message = String(parsedMeta.subStatusMessage).toLowerCase();
      if (message.includes('input') || message.includes('waiting') || message.includes('prompt') || message.includes('confirm')) {
        return (
          <AlertTriangle
            className="h-3 w-3 text-yellow-500"
            data-testid="attention-icon-message"
          />
        );
      }
    }

    return null;
  };

  // Get terminal status icon (used when no attention)
  const getTerminalStatusIcon = () => {
    if (!terminalSession) return null;

    switch (terminalSession.status) {
      case 'running':
        return <Circle className="h-3 w-3 fill-green-500 text-green-500 animate-pulse" data-testid="terminal-status-running" />;
      case 'completed':
        return <Check className="h-3 w-3 text-green-500" data-testid="terminal-status-completed" />;
      case 'failed':
        return <AlertTriangle className="h-3 w-3 text-red-500" data-testid="terminal-status-failed" />;
      case 'agent_requires_attention':
        return <AlertTriangle className="h-3 w-3 text-amber-500" data-testid="terminal-status-agent-requires-attention" />;
      default:
        return null;
    }
  };


  return (
    <Card 
      className="relative mb-4 overflow-hidden"
      onMouseEnter={onPreloadPlanContent}
    >
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
              <div className="flex items-center mt-1">
                <Checkbox
                  checked={isSelected}
                  onCheckedChange={() => onToggleSelection(plan.id)}
                />
              </div>
            )}
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <CardTitle className="text-base">
                  {truncateTitle(planTitle)}
                </CardTitle>
                {getAttentionIcon() || getTerminalStatusIcon()}
              </div>
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
              <>
                {copyButtons.map((button) => (
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
                ))}
              </>
            )}
          </div>

          <div className="space-x-1">
            {isPlanReadyForTerminal && onViewTerminal && (
              <Button
                key="terminal"
                variant="outline"
                size="sm"
                className="text-xs h-7 px-2 py-1"
                onClick={() => onViewTerminal(plan.id)}
                data-testid="terminal-button"
              >
                <Terminal className="mr-1 h-3.5 w-3.5" />
                Terminal
              </Button>
            )}

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
