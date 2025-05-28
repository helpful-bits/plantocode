import {
  CheckCircle,
  AlertCircle,
  Clock,
  XCircle,
  Loader2,
  X,
  FileCode,
} from "lucide-react";
import React from "react";

import {
  type BackgroundJob,
  JOB_STATUSES,
  type JobStatus,
} from "@/types/session-types";
import { Badge } from "@/ui/badge";
import { Button } from "@/ui/button";
import { Progress } from "@/ui/progress";

import {
  getStatusIconClass,
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

    // Choose best timestamp for display
    // Priority: startTime > lastUpdate > createdAt
    const displayTime = job.startTime || job.lastUpdate || job.createdAt;

    // Format relative time with fallback for invalid date
    const timeAgo =
      displayTime && displayTime > 0
        ? formatTimeAgo(displayTime)
        : "Unknown time";

    // Determine if job can be canceled (only active/non-terminal jobs)
    const canCancel = JOB_STATUSES.ACTIVE.includes(job.status as JobStatus);

    const getResponsePreview = () => {
      if (
        job.taskType === "implementation_plan" &&
        JOB_STATUSES.COMPLETED.includes(job.status as JobStatus)
      ) {
        return "Implementation plan generated.";
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
    const renderStatusIcon = (status: JobStatus) => {
      if (JOB_STATUSES.COMPLETED.includes(status)) {
        return <CheckCircle className={getStatusIconClass(status)} />;
      }
      if (status === "failed") {
        return <AlertCircle className={getStatusIconClass(status)} />;
      }
      if (status === "running" || status === "processing_stream") {
        return <Loader2 className={getStatusIconClass(status)} />;
      }
      if (status === "canceled") {
        return <XCircle className={getStatusIconClass(status)} />;
      }
      if (JOB_STATUSES.ACTIVE.includes(status)) {
        return <Clock className={getStatusIconClass(status)} />;
      }
      return <Clock className={getStatusIconClass(status)} />;
    };

    // Get user-friendly status display
    const getStatusDisplay = () => {
      // Use constants for all status checks
      if (job.status === "running" || job.status === "processing_stream") {
        return "Processing";
      } else if (
        ["preparing", "created", "queued", "preparing_input", "generating_stream"].includes(job.status)
      ) {
        return "Preparing";
      } else if (JOB_STATUSES.COMPLETED.includes(job.status as JobStatus)) {
        return "Completed";
      } else if (JOB_STATUSES.FAILED.includes(job.status as JobStatus)) {
        return job.status === "failed" ? "Failed" : "Canceled";
      } else {
        // Capitalize the first letter for any other status
        return job.status.charAt(0).toUpperCase() + job.status.slice(1);
      }
    };

    // Render card content
    return (
      <div
        className="border border-border/60 bg-background/80 p-2 rounded-lg text-xs text-foreground cursor-pointer hover:bg-muted/50 transition-colors flex flex-col w-full max-w-full overflow-hidden shadow-soft backdrop-blur-sm min-w-0"
        style={{
          minHeight: "140px", // Reduced minimum height for better space utilization
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
        <div className="flex items-center justify-between mb-2 w-full min-w-0">
          <div className="flex items-center gap-2 font-medium min-w-0 flex-1">
            <span className="w-4 h-4 inline-flex items-center justify-center flex-shrink-0">
              {renderStatusIcon(job.status as JobStatus)}
            </span>
            <span className="truncate text-foreground">{getStatusDisplay()}</span>
            {job.taskType && (
              <Badge
                variant="outline"
                className="text-[10px] flex items-center gap-1.5 ml-1 flex-shrink-0"
              >
                {formatTaskType(job.taskType)}
              </Badge>
            )}
          </div>

          <div className="w-6 h-6 flex-shrink-0">
            {canCancel && (
              <Button
                variant="ghost"
                size="icon-xs"
                onClick={(e: React.MouseEvent<HTMLButtonElement>) => {
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

        <div className="text-muted-foreground text-[10px] mt-2">{timeAgo}</div>

        {/* Progress bar for running jobs */}
        {(job.status === "running" || job.status === "processing_stream") && (
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
            <div className="flex justify-between items-center min-w-0 overflow-hidden">
              {job.statusMessage && (
                <p
                  className="text-[11px] text-primary mt-0.5 truncate flex-1 min-w-0"
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
        <div className="text-muted-foreground text-[10px] mt-2 flex items-center justify-between min-h-[24px] w-full min-w-0">
          <div className="flex flex-col gap-0.5 max-w-[90%] overflow-hidden min-w-0 flex-1">
            {/* Display token counts with better formatting */}
            {(job.tokensSent ?? 0) > 0 ||
            (job.tokensReceived ?? 0) > 0 ||
            (job.totalTokens ?? 0) > 0 ? (
              <span className="flex items-center gap-1 overflow-hidden min-w-0">
                <span className="text-[9px] text-muted-foreground flex-shrink-0">
                  Tokens:
                </span>
                <span className="font-mono text-foreground text-[9px] flex-shrink-0">
                  {formatTokenCount(job.tokensSent ?? 0)}
                </span>
                <span className="text-[9px] text-muted-foreground flex-shrink-0">→</span>
                <span className="font-mono text-foreground text-[9px] flex-shrink-0">
                  {formatTokenCount(job.tokensReceived ?? 0)}
                </span>
                {(job.totalTokens ?? 0) > 0 &&
                  (job.totalTokens ?? 0) !==
                    (job.tokensSent ?? 0) + (job.tokensReceived ?? 0) && (
                    <span className="font-mono text-[9px] ml-1 text-muted-foreground">
                      ({formatTokenCount(job.totalTokens ?? 0)} total)
                    </span>
                  )}
              </span>
            ) : (
              <span className="h-3"></span> /* Empty placeholder to maintain height */
            )}
            {job.modelUsed ? (
              <span
                className="text-[9px] text-muted-foreground truncate max-w-full"
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
            <span className="text-[9px] text-muted-foreground flex-shrink-0 ml-1">
              {Math.round((job.endTime - job.startTime) / 1000)}s
            </span>
          ) : (
            <span className="h-3 flex-shrink-0"></span> /* Empty placeholder to maintain height */
          )}
        </div>

        {/* Info section container with flexible height */}
        <div className="flex-1 flex flex-col justify-end">
          {JOB_STATUSES.COMPLETED.includes(job.status as JobStatus) &&
            job.taskType === "implementation_plan" && (
              <div className="text-[10px] mt-2 border-t border-border/60 pt-2 flex items-center gap-1.5 text-muted-foreground">
                <FileCode className="h-3.5 w-3.5 text-primary" />
                <span className="font-medium text-foreground">
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
          {job.taskType === "path_finder" && JOB_STATUSES.COMPLETED.includes(job.status as JobStatus) && (
            <div className="text-[10px] mt-2 border-t border-border/60 pt-2 flex items-center gap-1.5 text-muted-foreground">
              {(() => {
                const parsedMeta = getParsedMetadata(job.metadata);
                const pathFinderData = parsedMeta?.pathData;
                
                // Parse pathData if it's a string, otherwise use it as-is
                let parsedPathData: { count?: number; paths?: string[] } | null = null;
                if (typeof pathFinderData === 'string') {
                  try {
                    parsedPathData = JSON.parse(pathFinderData);
                  } catch {
                    parsedPathData = null;
                  }
                } else if (typeof pathFinderData === 'object' && pathFinderData !== null) {
                  parsedPathData = pathFinderData as { count?: number; paths?: string[] };
                }
                
                const count = parsedPathData?.count || parsedPathData?.paths?.length || 0;
                return count > 0 ? (
                  <span className="font-medium text-foreground">
                    Found {count} relevant file
                    {count !== 1 ? "s" : ""}
                  </span>
                ) : (
                  <span className="font-medium text-foreground">Path finder completed</span>
                );
              })()}
            </div>
          )}

          {/* For regular jobs or those without special indicators, show response preview */}
          {job.response &&
            !(job.taskType === "path_finder" && JOB_STATUSES.COMPLETED.includes(job.status as JobStatus)) && (
              <div className="text-[10px] mt-2 border-t border-border/60 pt-2 text-muted-foreground break-words text-balance overflow-hidden">
                <div className="h-[40px] w-full overflow-y-auto overflow-x-hidden">
                  <div className="break-words whitespace-pre-wrap overflow-wrap-anywhere">
                    {getResponsePreview()}
                  </div>
                </div>
              </div>
            )}

          {/* Show error message if job failed or canceled */}
          {JOB_STATUSES.FAILED.includes(job.status as JobStatus) &&
            job.errorMessage && (
              <div className="text-[10px] mt-2 border-t border-border/60 pt-2 text-destructive break-words text-balance overflow-hidden">
                <div className="h-[40px] w-full overflow-y-auto overflow-x-hidden">
                  <div className="break-words whitespace-pre-wrap overflow-wrap-anywhere">
                    {getErrorPreview()}
                  </div>
                </div>
              </div>
            )}

          {/* Empty placeholder element when no special content is present, to maintain consistent height */}
          {/* All jobs now store output in the response field */}
          {!(job.taskType === "path_finder" && JOB_STATUSES.COMPLETED.includes(job.status as JobStatus)) &&
            !job.response &&
            !JOB_STATUSES.FAILED.includes(job.status as JobStatus) && (
              <div className="h-[42px]"></div>
            )}
        </div>
      </div>
    );
  }
);

// Add displayName for better debugging
JobCard.displayName = "JobCard";
