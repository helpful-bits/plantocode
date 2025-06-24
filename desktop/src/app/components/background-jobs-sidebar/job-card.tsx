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
import { TaskTypeDetails, type TaskType } from "@/types/task-type-defs";
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
import { WorkflowUtils } from "@/utils/workflow-utils";

export interface JobCardProps {
  job: BackgroundJob;
  handleCancel: (id: string) => Promise<void>;
  handleDelete: (id: string) => Promise<void>;
  isCancelling: Record<string, boolean>;
  isDeleting: Record<string, boolean>;
  onSelect: (job: BackgroundJob) => void;
}



// Helper functions for previews
const getResponsePreview = (job: BackgroundJob) => {
  // Primary source of displayable response is job.response
  if (!job.response) {
    return "";
  }

  // PRIMARY PATH: Task type specific previews (consolidated logic based on job.taskType)
  switch (job.taskType) {
    case "implementation_plan":
      return "Implementation plan generated.";

    case "regex_file_filter":
      try {
        const parsed = JSON.parse(job.response);
        if (parsed && parsed.primaryPattern) {
          return `Generated regex pattern: /${parsed.primaryPattern.pattern || 'pattern'}/`;
        } else if (parsed && Array.isArray(parsed)) {
          return `Generated ${parsed.length} regex patterns.`;
        }
      } catch {
        // Fall through to generic message
      }
      return "Regex patterns generated.";

    case "path_finder":
    case "extended_path_finder":
      try {
        const parsed = JSON.parse(job.response);
        if (parsed && typeof parsed === 'object') {
          // First priority: summary field from processors
          if (typeof parsed.summary === 'string' && parsed.summary.trim()) {
            return parsed.summary;
          }
          
          // Second priority: verifiedPaths and unverifiedPaths structure
          if (Array.isArray(parsed.verifiedPaths) || Array.isArray(parsed.unverifiedPaths)) {
            const verifiedCount = Array.isArray(parsed.verifiedPaths) ? parsed.verifiedPaths.length : 0;
            const unverifiedCount = Array.isArray(parsed.unverifiedPaths) ? parsed.unverifiedPaths.length : 0;
            
            return `Found ${verifiedCount} verified, ${unverifiedCount} unverified files`;
          }
          
          // Third priority: count field fallback
          if (typeof parsed.count === 'number' && parsed.count >= 0) {
            return `Found ${parsed.count} files`;
          }
        }
      } catch {
        // Fall through to generic fallback messages
      }
      
      return job.taskType === "extended_path_finder" ? "Extended path finding completed" : "Path finder completed";

    case "file_finder_workflow":
      try {
        const parsed = JSON.parse(job.response);
        // Handle Vec<String> format (array of strings)
        if (Array.isArray(parsed)) {
          const count = parsed.length;
          return count > 0 ? `Found ${count} file${count !== 1 ? "s" : ""}` : "Path finder completed";
        }
      } catch {
        // Fall through to generic message
      }
      return "Path finder completed";

    default:
      // For tasks without specific handling, continue to secondary logic
      break;
  }

  // SECONDARY PATH: Generic workflow stage messages (fallback for unknown task types)
  const parsedMeta = getParsedMetadata(job.metadata);
  if (parsedMeta?.workflowId && parsedMeta?.workflowStage) {
    const stageName = WorkflowUtils.getStageName(String(parsedMeta.workflowStage));
    if (JOB_STATUSES.COMPLETED.includes(job.status as JobStatus)) {
      return `Stage ${stageName} completed`;
    } else if (job.status === "running" || job.status === "processingStream") {
      return `Running stage: ${stageName}`;
    }
  }

  // FALLBACK: Show truncated job.response for all other cases
  const maxLength = 150;
  return job.response.length > maxLength
    ? `${job.response.substring(0, maxLength)}...`
    : job.response;
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
    // Priority: startTime > updatedAt > createdAt
    const displayTime = job.startTime || job.updatedAt || job.createdAt;

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
    const errorPreview = React.useMemo(() => getErrorPreview(job.errorMessage), [job.errorMessage]);

    // Render the appropriate status icon
    const renderStatusIcon = (status: JobStatus) => {
      if (JOB_STATUSES.COMPLETED.includes(status)) {
        return <CheckCircle className={getStatusIconClass(status)} />;
      }
      if (status === "failed") {
        return <AlertCircle className={getStatusIconClass(status)} />;
      }
      if (status === "running" || status === "processingStream") {
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
      if (job.status === "running" || job.status === "processingStream") {
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
        {(job.status === "running" || job.status === "processingStream") && (
          <div className="mt-2 mb-1">
            {(() => {
              // Use the centralized progress calculation for consistency
              const progressValue = getStreamingProgressValue(
                job.metadata,
                job.startTime
              );
              
              return (
                <>
                  <Progress
                    value={progressValue}
                    className="h-0.5"
                  />
                  <div className="flex justify-between items-center min-w-0 overflow-hidden">
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

        {(!job.taskType || TaskTypeDetails[job.taskType as TaskType]?.requiresLlm !== false) && (
          <div className="text-muted-foreground text-[10px] mt-2 flex items-center justify-between min-h-[24px] w-full min-w-0">
            <div className="flex flex-col gap-0.5 max-w-[90%] overflow-hidden min-w-0 flex-1">
              {(() => {
                const parsedMeta = getParsedMetadata(job.metadata);
                
                const tokensSent = Number(job.tokensSent || parsedMeta?.taskData?.tokensSent || 0);
                const tokensReceived = Number(job.tokensReceived || parsedMeta?.taskData?.tokensReceived || 0);
                const totalTokens = Number((tokensSent + tokensReceived) || parsedMeta?.taskData?.totalTokens || parsedMeta?.taskData?.tokensUsed || 0);
                
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
                  <span className="h-3"></span>
                );
              })()}
              
              {(() => {
                const parsedMeta = getParsedMetadata(job.metadata);
                const modelUsed = job.modelUsed ?? parsedMeta?.taskData?.modelUsed;
                
                return modelUsed ? (
                  <span
                    className="text-[9px] text-muted-foreground truncate max-w-full"
                    title={modelUsed}
                  >
                    {modelUsed.includes("gemini")
                      ? modelUsed.replace("gemini-", "Google Gemini ")
                      : modelUsed.includes("claude")
                        ? modelUsed.replace(/-\d{8}$/, "")
                        : modelUsed}
                  </span>
                ) : (
                  <span className="h-3"></span>
                );
              })()}
            </div>

            {job.endTime && job.startTime ? (
              <span className="text-[9px] text-muted-foreground flex-shrink-0 ml-1">
                {Math.round((job.endTime - job.startTime) / 1000)}s
              </span>
            ) : (
              <span className="h-3 flex-shrink-0"></span>
            )}
          </div>
        )}

        <div className="flex-1 flex flex-col justify-end">
          {/* Bottom section - Only show unique information not already displayed */}
          {JOB_STATUSES.COMPLETED.includes(job.status as JobStatus) && (
            <div className="text-[10px] mt-2 border-t border-border/60 pt-2">
              <div className="flex items-center justify-between gap-2">
                {/* Results Summary (left side) - Only show meaningful results */}
                <div className="flex items-center gap-1.5 text-muted-foreground min-w-0 flex-1">
                  {(() => {
                    const parsedMeta = getParsedMetadata(job.metadata);
                    
                    // Handle all tasks that can produce file results
                    const fileProducingTasks = [
                      "path_finder", 
                      "extended_path_finder", 
                      "file_finder_workflow",
                      "regex_file_filter",
                      "file_relevance_assessment"
                    ];
                    
                    if (fileProducingTasks.includes(job.taskType)) {
                      if (job.response) {
                        try {
                          const parsed = JSON.parse(job.response);
                          
                          // Handle path_finder specific format with verified/unverified paths
                          if (job.taskType === "path_finder" && parsed && typeof parsed === 'object' && 'paths' in parsed && 'unverified_paths' in parsed) {
                            const verifiedCount = Array.isArray(parsed.paths) ? parsed.paths.length : 0;
                            const unverifiedCount = Array.isArray(parsed.unverified_paths) ? parsed.unverified_paths.length : 0;
                            const totalCount = verifiedCount + unverifiedCount;
                            
                            if (totalCount > 0) {
                              return (
                                <span className="font-medium text-foreground">
                                  {verifiedCount} verified, {unverifiedCount} unverified
                                </span>
                              );
                            }
                          }
                          // Handle array responses (most common format)
                          else if (Array.isArray(parsed)) {
                            const count = parsed.length;
                            if (count > 0) {
                              return (
                                <span className="font-medium text-foreground">
                                  {count} file{count !== 1 ? "s" : ""} found
                                </span>
                              );
                            }
                          }
                          // Handle object responses with file arrays
                          else if (parsed && typeof parsed === 'object') {
                            // Check for common patterns in workflow responses
                            const filePaths = parsed.filePaths || parsed.paths || parsed.files;
                            if (Array.isArray(filePaths)) {
                              const count = filePaths.length;
                              if (count > 0) {
                                return (
                                  <span className="font-medium text-foreground">
                                    {count} file{count !== 1 ? "s" : ""} found
                                  </span>
                                );
                              }
                            }
                          }
                        } catch {
                          // Fallback to metadata count
                          const count = (typeof parsedMeta?.taskData?.pathCount === 'number') ? parsedMeta.taskData.pathCount : 0;
                          if (count > 0) {
                            return (
                              <span className="font-medium text-foreground">
                                {count} file{count !== 1 ? "s" : ""} found
                              </span>
                            );
                          }
                        }
                      }
                      
                      return null; // Don't show generic completion message for file tasks
                    }
                    
                    // For implementation plans and other tasks, don't show redundant info
                    return null;
                  })()}
                </div>
                
                {/* Cost (right side) - Only show if meaningful */}
                <div className="flex-shrink-0">
                  {job.actualCost && job.actualCost > 0 ? (
                    <span className="font-mono text-[9px] text-foreground">
                      ${job.actualCost.toFixed(4)}
                    </span>
                  ) : null}
                </div>
              </div>
            </div>
          )}

          {/* Error messages for failed jobs */}
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

          {/* Spacer for non-completed jobs without errors */}
          {!JOB_STATUSES.COMPLETED.includes(job.status as JobStatus) &&
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
