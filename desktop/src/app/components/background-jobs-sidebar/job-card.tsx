import {
  CheckCircle,
  AlertCircle,
  Clock,
  XCircle,
  Loader2,
  X,
  FileCode,
  Trash2,
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
  handleDelete: (id: string) => Promise<void>;
  isCancelling: Record<string, boolean>;
  isDeleting: Record<string, boolean>;
  onSelect: (job: BackgroundJob) => void;
}

// Helper function to identify local/filesystem tasks
const isLocalTask = (taskType: string): boolean => {
  const localTaskTypes = [
    "local_file_filtering",
    "directory_tree_generation",
    "regex_generation"
  ];
  return localTaskTypes.includes(taskType);
};

// Helper functions for previews
const getResponsePreview = (job: BackgroundJob) => {
  if (
    job.taskType === "implementation_plan" &&
    JOB_STATUSES.COMPLETED.includes(job.status as JobStatus)
  ) {
    return "Implementation plan generated.";
  }

  if (job.response) {
    // Check if this is a path finder job with structured JSON response
    if (job.taskType === "path_finder" || 
        job.taskType === "initial_path_finding" || 
        job.taskType === "extended_path_finding" ||
        job.taskType === "file_finder_workflow") {
      try {
        const parsed = JSON.parse(job.response);
        // If it's structured data with paths, show a summary instead of raw JSON
        if (parsed && (parsed.paths || parsed.count !== undefined)) {
          const count = parsed.count || parsed.paths?.length || 0;
          return count > 0 ? `Found ${count} relevant file${count !== 1 ? "s" : ""}` : "Path finder completed";
        }
      } catch {
        // Fall through to regular preview if not valid JSON
      }
    }

    // Check for regex pattern generation - show meaningful summary instead of raw JSON
    if (job.taskType === "regex_pattern_generation" && JOB_STATUSES.COMPLETED.includes(job.status as JobStatus)) {
      try {
        const parsed = JSON.parse(job.response);
        if (parsed && parsed.primaryPattern) {
          return `Generated regex pattern: /${parsed.primaryPattern.pattern || 'pattern'}/`;
        }
      } catch {
        // Fall through to regular preview if not valid JSON
      }
    }

    const maxLength = 150; // Max characters for preview
    return job.response.length > maxLength
      ? `${job.response.substring(0, maxLength)}...`
      : job.response;
  }
  return "";
};

const getErrorPreview = (errorMessage?: string) => {
  if (!errorMessage) return "";
  const maxLength = 150; // Max characters for preview
  return errorMessage.length > maxLength
    ? `${errorMessage.substring(0, maxLength)}...`
    : errorMessage;
};

export const JobCard = React.memo(
  ({ job, handleCancel, handleDelete, isCancelling, isDeleting, onSelect }: JobCardProps) => {

    // Choose best timestamp for display
    // Priority: startTime > lastUpdate > createdAt
    const displayTime = job.startTime || job.lastUpdate || job.createdAt;

    // Format relative time with fallback for invalid date
    const timeAgo =
      displayTime && displayTime > 0
        ? formatTimeAgo(displayTime)
        : "Unknown time";

    // Determine if job can be canceled (only active/non-terminal jobs) - memoized for stability
    const canCancel = React.useMemo(() => JOB_STATUSES.ACTIVE.includes(job.status as JobStatus), [job.status]);
    
    // Memoize status-specific booleans for better performance
    const isCurrentJobCancelling = React.useMemo(() => Boolean(isCancelling?.[job.id]), [isCancelling, job.id]);
    const isCurrentJobDeleting = React.useMemo(() => Boolean(isDeleting?.[job.id]), [isDeleting, job.id]);

    // Use memoized helper functions with current job data
    const responsePreview = React.useMemo(() => getResponsePreview(job), [job.response, job.taskType, job.status]);
    const errorPreview = React.useMemo(() => getErrorPreview(job.errorMessage), [job.errorMessage]);

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
            {canCancel ? (
              <Button
                variant="ghost"
                size="icon-xs"
                onClick={(e: React.MouseEvent<HTMLButtonElement>) => {
                  e.stopPropagation(); // Prevent triggering the card's onClick
                  void handleCancel(job.id);
                }}
                isLoading={isCurrentJobCancelling}
                loadingIcon={<Loader2 className="h-3 w-3 animate-spin" />}
                aria-label="Cancel job"
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            ) : (
              <Button
                variant="ghost"
                size="icon-xs"
                onClick={(e: React.MouseEvent<HTMLButtonElement>) => {
                  e.stopPropagation(); // Prevent triggering the card's onClick
                  void handleDelete(job.id);
                }}
                isLoading={isCurrentJobDeleting}
                loadingIcon={<Loader2 className="h-3 w-3 animate-spin" />}
                aria-label="Delete job"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
        </div>

        <div className="text-muted-foreground text-[10px] mt-2">{timeAgo}</div>

        {/* Progress bar for running jobs */}
        {(job.status === "running" || job.status === "processing_stream") && (
          <div className="mt-2 mb-1">
            {(() => {
              // Use the centralized progress calculation for consistency
              const progressValue = getStreamingProgressValue(
                job.metadata,
                job.startTime,
                job.maxOutputTokens
              );
              
              return (
                <>
                  <Progress
                    value={progressValue}
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
                    {progressValue !== undefined && (
                      <p className="text-[9px] text-muted-foreground mt-0.5 text-right">
                        {Math.floor(progressValue)}%
                      </p>
                    )}
                  </div>
                </>
              );
            })()
            }
          </div>
        )}

        {/* Token count and model display - only for LLM jobs */}
        {job.apiType !== "filesystem" && !isLocalTask(job.taskType) && (
          <div className="text-muted-foreground text-[10px] mt-2 flex items-center justify-between min-h-[24px] w-full min-w-0">
            <div className="flex flex-col gap-0.5 max-w-[90%] overflow-hidden min-w-0 flex-1">
              {/* Display token counts with better formatting and fallback to metadata */}
              {(() => {
                const parsedMeta = getParsedMetadata(job.metadata);
                const tokensSent = (typeof job.tokensSent === 'number' ? job.tokensSent : 0) || (typeof parsedMeta?.tokensSent === 'number' ? parsedMeta.tokensSent : 0);
                const tokensReceived = (typeof job.tokensReceived === 'number' ? job.tokensReceived : 0) || (typeof parsedMeta?.tokensReceived === 'number' ? parsedMeta.tokensReceived : 0);
                const totalTokens = (typeof job.totalTokens === 'number' ? job.totalTokens : 0) || (typeof parsedMeta?.totalTokens === 'number' ? parsedMeta.totalTokens : 0) || (typeof parsedMeta?.tokensUsed === 'number' ? parsedMeta.tokensUsed : 0);
                
                return (tokensSent > 0 || tokensReceived > 0 || totalTokens > 0) ? (
                  <span className="flex items-center gap-1 overflow-hidden min-w-0">
                    <span className="text-[9px] text-muted-foreground flex-shrink-0">
                      Tokens:
                    </span>
                    <span className="font-mono text-foreground text-[9px] flex-shrink-0">
                      {formatTokenCount(tokensSent)}
                    </span>
                    <span className="text-[9px] text-muted-foreground flex-shrink-0">→</span>
                    <span className="font-mono text-foreground text-[9px] flex-shrink-0">
                      {formatTokenCount(tokensReceived)}
                    </span>
                    {totalTokens > 0 && totalTokens !== (tokensSent + tokensReceived) && (
                      <span className="font-mono text-[9px] ml-1 text-muted-foreground">
                        ({formatTokenCount(totalTokens)} total)
                      </span>
                    )}
                  </span>
                ) : (
                  <span className="h-3"></span> /* Empty placeholder to maintain height */
                );
              })()}
              
              {(() => {
                const parsedMeta = getParsedMetadata(job.metadata);
                const modelUsed = job.modelUsed ?? parsedMeta?.modelUsed;
                
                return modelUsed ? (
                  <span
                    className="text-[9px] text-muted-foreground truncate max-w-full"
                    title={modelUsed}
                  >
                    {modelUsed.includes("gemini")
                      ? modelUsed.replace("gemini-", "Gemini ")
                      : modelUsed.includes("claude")
                        ? modelUsed.replace(/-\d{8}$/, "")
                        : modelUsed}
                  </span>
                ) : (
                  <span className="h-3"></span> /* Empty placeholder to maintain height */
                );
              })()}
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
        )}

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

          {/* Workflow context display - prominently show workflow information */}
          {(() => {
            const parsedMeta = getParsedMetadata(job.metadata);
            
            // Display workflow context if job is part of a workflow
            if (parsedMeta?.workflowId) {
              return (
                <div className="text-[10px] mt-2 border-t border-primary/20 pt-2 flex items-center gap-1.5 text-muted-foreground bg-primary/5 rounded-md p-2">
                  <div className="w-2 h-2 bg-primary rounded-full flex-shrink-0"></div>
                  <div className="flex flex-col gap-0.5 min-w-0 flex-1">
                    <span className="font-medium text-primary text-[11px]">
                      Workflow: {parsedMeta.workflowId}
                    </span>
                    <span className="text-foreground text-[10px]">
                      Stage: {parsedMeta.workflowStage || formatTaskType(job.taskType)}
                    </span>
                  </div>
                </div>
              );
            }
            
            return null;
          })()}

          {/* Enhanced display for workflow stage jobs and path finder jobs */}
          {(job.taskType === "path_finder" || 
            job.taskType === "initial_path_finding" || 
            job.taskType === "extended_path_finding" ||
            job.taskType === "file_finder_workflow") && 
           JOB_STATUSES.COMPLETED.includes(job.status as JobStatus) && (
            <div className="text-[10px] mt-2 border-t border-border/60 pt-2 flex items-center gap-1.5 text-muted-foreground">
              {(() => {
                const parsedMeta = getParsedMetadata(job.metadata);
                
                // Skip workflow display here since it's handled above
                if (parsedMeta?.workflowId) {
                  return null;
                }
                
                // Handle path finder data - use multiple sources with preference order
                const pathFinderData = parsedMeta?.pathFinderData || parsedMeta?.pathData;
                let count = 0;
                
                // First try parsedMeta.pathCount if available (reliable count source)
                if (parsedMeta?.pathCount !== undefined) {
                  count = parsedMeta.pathCount;
                } else if (parsedMeta?.pathFinderData) {
                  // Use new structured pathFinderData
                  count = parsedMeta.pathFinderData.count || parsedMeta.pathFinderData.paths?.length || 0;
                } else if (typeof pathFinderData === 'string') {
                  // Legacy pathData handling
                  try {
                    const parsedPathData = JSON.parse(pathFinderData);
                    count = parsedPathData?.count || parsedPathData?.paths?.length || 0;
                  } catch {
                    count = 0;
                  }
                } else if (typeof pathFinderData === 'object' && pathFinderData !== null) {
                  // Legacy pathData as object
                  const pathData = pathFinderData as { count?: number; paths?: string[] };
                  count = pathData?.count || pathData?.paths?.length || 0;
                }
                return count > 0 ? (
                  <span className="font-medium text-foreground">
                    Found {count} relevant file
                    {count !== 1 ? "s" : ""}
                  </span>
                ) : (
                  <span className="font-medium text-foreground">
                    {job.taskType === "file_finder_workflow" ? "File finder completed" : "Path finder completed"}
                  </span>
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
                    {responsePreview}
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
                    {errorPreview}
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
