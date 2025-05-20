import {
  CheckCircle,
  AlertCircle,
  Clock,
  XCircle,
  Loader2,
  X,
  FileCode,
} from "lucide-react";
import React, { useEffect } from "react";

import {
  type BackgroundJob,
  JOB_STATUSES,
  type JobStatus,
} from "@/types/session-types";
import { Badge } from "@/ui/badge";
import { Button } from "@/ui/button";
import { Progress } from "@/ui/progress";
import { ScrollArea } from "@/ui/scroll-area";

import {
  getStatusIconClass,
  getApiTypeBadgeClasses,
  formatApiType,
  formatTaskType,
  formatTimeAgo,
  formatTokenCount,
  getStreamingProgressValue,
  getParsedMetadata,
} from "./utils";

export interface JobCardProps {
  job: BackgroundJob;
  handleCancel: (id: string) => Promise<void>;
  isCancelling: Record<string, boolean>;
  onSelect: (job: BackgroundJob) => void;
}

export const JobCard = React.memo(
  ({ job, handleCancel, isCancelling, onSelect }: JobCardProps) => {
    // For debugging - enable to log all rerenders of JobCard
    const DEBUG_JOBCARD = false;

    // Add logging for tracking JobCard re-renders
    useEffect(() => {
      if (DEBUG_JOBCARD) {
        console.debug(
          `JobCard [${job.id}] rendering, status=${job.status}, response=${Boolean(job.response)}, error=${Boolean(job.errorMessage)}`
        );
      }
    }, [job.id, job.status, job.response, job.errorMessage, DEBUG_JOBCARD]);

    // Choose best timestamp for display
    // Priority: startTime > lastUpdate > createdAt
    const displayTime = job.startTime || job.lastUpdate || job.createdAt;

    // Format relative time with fallback for invalid date
    const timeAgo =
      displayTime && displayTime > 0
        ? formatTimeAgo(displayTime)
        : "Unknown time";

    // Determine if job can be canceled (only active/non-terminal jobs)
    const canCancel = JOB_STATUSES.ACTIVE.includes(job.status);

    const getResponsePreview = () => {
      if (
        job.taskType === "implementation_plan" &&
        job.status === "completed"
      ) {
        return `Implementation plan generated successfully.`;
      }

      if (job.response) {
        // No need to truncate since we're using scroll area
        return job.response;
      }
      return "";
    };

    // Format error text for preview
    const getErrorPreview = () => {
      if (!job.errorMessage) return "";
      // No need to truncate since we're using scroll area
      return job.errorMessage;
    };

    // Render the appropriate status icon
    const renderStatusIcon = (status: string) => {
      switch (status) {
        case "completed":
        case "completed_by_tag":
          return <CheckCircle className={getStatusIconClass(status)} />;
        case "failed":
          return <AlertCircle className={getStatusIconClass(status)} />;
        case "running":
        case "processing_stream":
          return <Loader2 className={getStatusIconClass(status)} />;
        case "canceled":
          return <XCircle className={getStatusIconClass(status)} />;
        case "preparing":
        case "created":
        case "queued":
        case "idle":
        case "preparing_input":
        case "generating_stream":
          return <Clock className={getStatusIconClass(status)} />;
        default:
          return <Clock className={getStatusIconClass(status)} />;
      }
    };

    // Get user-friendly status display
    const getStatusDisplay = () => {
      // Use constants for all status checks
      if (job.status === "running" || job.status === "processing_stream") {
        return "Processing";
      } else if (
        job.status === "preparing" ||
        job.status === "created" ||
        job.status === "queued" ||
        job.status === "preparing_input" ||
        job.status === "generating_stream"
      ) {
        return "Preparing";
      } else if (JOB_STATUSES.COMPLETED.includes(job.status as JobStatus)) {
        // Handle different completed states
        if (job.status === "completed_by_tag") {
          return "Completed";
        }
        return "Completed";
      } else if (job.status === "failed") {
        return "Failed";
      } else if (job.status === "canceled") {
        return "Canceled";
      } else {
        // Capitalize the first letter for any other status
        return job.status.charAt(0).toUpperCase() + job.status.slice(1);
      }
    };

    // Render card content
    return (
      <div
        className="border bg-card p-3 rounded-md text-xs cursor-pointer hover:bg-accent/10 transition-colors w-full"
        style={{
          height: "160px", // Fixed height for better layout stability
          overflow: "hidden",
          maxWidth: "100%", // Ensure card doesn't overflow sidebar
          boxSizing: "border-box", // Include padding in width calculation
        }}
        onClick={() => onSelect(job)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') onSelect(job);
        }}
        data-testid={`job-card-${job.id}`}
        data-status={job.status}
      >
        <div className="flex items-center justify-between mb-2 w-full">
          <div className="flex items-center gap-2 font-medium">
            <span className="w-4 h-4 inline-flex items-center justify-center">
              {renderStatusIcon(job.status)}
            </span>
            <span className="truncate">{getStatusDisplay()}</span>
          </div>

          <div className="w-6 h-6 flex-shrink-0">
            {canCancel && (
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                onClick={(e) => {
                  e.stopPropagation(); // Prevent triggering the card's onClick
                  void handleCancel(job.id);
                }}
                isLoading={isCancelling[job.id]}
                loadingIcon={<Loader2 className="h-3 w-3 animate-spin" />}
                aria-label="Cancel job"
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
        </div>

        <div className="flex flex-wrap gap-2 mb-2 min-h-[20px]">
          {job.apiType && (
            <Badge className={getApiTypeBadgeClasses(job.apiType)}>
              {formatApiType(job.apiType)}
            </Badge>
          )}
          {job.taskType && (
            <Badge
              variant="outline"
              className="text-[10px] flex items-center gap-1.5"
            >
              {formatTaskType(job.taskType)}
            </Badge>
          )}
        </div>

        <div className="text-muted-foreground text-[10px] mt-2">{timeAgo}</div>

        {/* Progress bar for running jobs */}
        {job.status === "running" && (
          <div className="mt-2 mb-1">
            <Progress
              value={
                // Get parsed metadata and calculate streaming progress
                (() => {
                  const parsedMeta = getParsedMetadata(job.metadata);

                  // Use the standardized helper function for calculating progress
                  if (
                    job.taskType === "implementation_plan" &&
                    parsedMeta?.isStreaming === true
                  ) {
                    return getStreamingProgressValue(
                      parsedMeta,
                      job.startTime,
                      job.maxOutputTokens
                    );
                  }
                  // For other streaming jobs
                  else if (parsedMeta?.isStreaming) {
                    if (
                      parsedMeta.responseLength &&
                      parsedMeta.estimatedTotalLength
                    ) {
                      // If we have a good estimate based on content length
                      return Math.min(
                        (parsedMeta.responseLength /
                          parsedMeta.estimatedTotalLength) *
                          100,
                        98
                      );
                    } else if (parsedMeta.streamProgress) {
                      // If we have a stream progress value directly
                      return Math.min(parsedMeta.streamProgress, 95);
                    } else {
                      // Fallback based on elapsed time
                      return Math.min(
                        Math.floor(
                          (Date.now() - (job.startTime || Date.now())) / 150
                        ),
                        95
                      );
                    }
                  } else {
                    // Non-streaming job - base on elapsed time with a slower progression
                    return Math.min(
                      Math.floor(
                        (Date.now() - (job.startTime || Date.now())) / 250
                      ),
                      90
                    );
                  }
                })()
              }
              className="h-0.5"
            />
            <div className="flex justify-between items-center">
              {job.statusMessage && (
                <p
                  className="text-[11px] text-blue-600 dark:text-blue-400 mt-0.5 truncate max-w-[75%]"
                  title={job.statusMessage}
                >
                  {job.statusMessage}
                </p>
              )}
              {(() => {
                const parsedMeta = getParsedMetadata(job.metadata);
                return parsedMeta?.streamProgress ? (
                  <p className="text-[9px] text-muted-foreground mt-0.5 text-right">
                    {Math.floor(parsedMeta.streamProgress)}%
                  </p>
                ) : null;
              })()}
            </div>
          </div>
        )}

        {/* Token count and model display */}
        <div className="text-muted-foreground text-[10px] mt-2 flex items-center justify-between min-h-[24px] w-full">
          <div className="flex flex-col gap-0.5 max-w-[90%] overflow-hidden">
            {/* Display token counts with better formatting */}
            {(job.tokensSent ?? 0) > 0 ||
            (job.tokensReceived ?? 0) > 0 ||
            (job.totalTokens ?? 0) > 0 ? (
              <span className="flex items-center gap-1.5">
                <span className="text-[9px] text-muted-foreground">
                  Tokens:
                </span>
                <span className="font-mono">
                  {formatTokenCount(job.tokensSent ?? 0)}
                </span>
                <span className="text-[9px]">→</span>
                <span className="font-mono">
                  {formatTokenCount(job.tokensReceived ?? 0)}
                </span>
                {(job.totalTokens ?? 0) > 0 &&
                  (job.totalTokens ?? 0) !==
                    (job.tokensSent ?? 0) + (job.tokensReceived ?? 0) && (
                    <span className="font-mono text-[9px] ml-1">
                      ({formatTokenCount(job.totalTokens ?? 0)} total)
                    </span>
                  )}
              </span>
            ) : (
              <span className="h-3"></span> /* Empty placeholder to maintain height */
            )}
            {job.modelUsed ? (
              <span
                className="text-[9px] text-gray-500 truncate max-w-[180px]"
                title={job.modelUsed}
              >
                {job.modelUsed.includes("gemini")
                  ? job.modelUsed.replace("gemini-", "Gemini ")
                  : job.modelUsed.includes("claude")
                    ? job.modelUsed.replace(/-\d{8}$/, "")
                    : job.modelUsed}
              </span>
            ) : (
              <span className="h-3"></span> /* Empty placeholder to maintain height */
            )}
          </div>

          {/* Show duration for completed jobs or empty placeholder */}
          {job.endTime && job.startTime ? (
            <span className="text-[9px] text-gray-500 flex-shrink-0 ml-1">
              {Math.round((job.endTime - job.startTime) / 1000)}s
            </span>
          ) : (
            <span className="h-3 flex-shrink-0"></span> /* Empty placeholder to maintain height */
          )}
        </div>

        {/* Info section container with fixed height for stability */}
        <div className="min-h-[42px] max-h-[42px] overflow-hidden">
          {job.status === "completed" &&
            job.taskType === "implementation_plan" && (
              <div className="text-[10px] mt-2 border-t pt-2 flex items-center gap-1.5 text-muted-foreground">
                <FileCode className="h-3.5 w-3.5 text-primary" />
                <span className="font-medium">
                  {(() => {
                    const parsedMeta = getParsedMetadata(job.metadata);
                    return parsedMeta?.sessionName
                      ? `Plan: ${parsedMeta.sessionName}`
                      : "Implementation plan in database";
                  })()}
                </span>
              </div>
            )}

          {/* Legacy file output is no longer supported */}

          {/* For path finder jobs, show path count from metadata if available */}
          {job.taskType === "path_finder" && job.status === "completed" && (
            <div className="text-[10px] mt-2 border-t pt-2 flex items-center gap-1.5 text-muted-foreground">
              {(() => {
                const parsedMeta = getParsedMetadata(job.metadata);
                return parsedMeta?.pathCount ? (
                  <span className="font-medium">
                    Found {parsedMeta.pathCount} relevant file
                    {parsedMeta.pathCount !== 1 ? "s" : ""}
                  </span>
                ) : (
                  <span className="font-medium">Path finder completed</span>
                );
              })()}
            </div>
          )}

          {/* For regular jobs or those without special indicators, show response preview */}
          {job.response &&
            !(job.status === "completed" && job.outputFilePath) &&
            !(job.taskType === "path_finder" && job.status === "completed") && (
              <div className="text-[10px] mt-2 border-t pt-2 text-muted-foreground break-words text-balance">
                <ScrollArea className="h-[40px]">
                  {getResponsePreview()}
                </ScrollArea>
              </div>
            )}

          {/* Show error message if job failed or canceled */}
          {(job.status === "failed" || job.status === "canceled") &&
            job.errorMessage && (
              <div className="text-[10px] mt-2 border-t pt-2 text-red-500 break-words text-balance">
                <ScrollArea className="h-[40px]">
                  {getErrorPreview()}
                </ScrollArea>
              </div>
            )}

          {/* Empty placeholder element when no special content is present, to maintain consistent height */}
          {/* All jobs now store output in the response field */}
          {!(job.taskType === "path_finder" && job.status === "completed") &&
            !job.response &&
            !(job.status === "failed" || job.status === "canceled") && (
              <div className="h-[42px]"></div>
            )}
        </div>
      </div>
    );
  }
);

// Add displayName for better debugging
JobCard.displayName = "JobCard";
