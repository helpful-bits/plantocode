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

    case "regex_pattern_generation":
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
    if (JOB_STATUSES.COMPLETED.includes(job.status as JobStatus)) {
      return `Stage ${parsedMeta.workflowStage} completed`;
    } else if (job.status === "running" || job.status === "processing_stream") {
      return `Running stage: ${parsedMeta.workflowStage}`;
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

        {/* Workflow context in header for better visibility */}
        {(() => {
          const parsedMeta = getParsedMetadata(job.metadata);
          if (parsedMeta?.workflowId) {
            // Use workflowStage from parsedMeta if available, with consistent fallback handling
            let displayStageName = parsedMeta.workflowStage || formatTaskType(job.taskType);
            
            // Use WorkflowUtils to get proper display name if it's a workflow stage
            if (parsedMeta.workflowStage) {
              const stageEnum = WorkflowUtils.mapStageNameToEnum(parsedMeta.workflowStage);
              if (stageEnum) {
                displayStageName = WorkflowUtils.getStageName(stageEnum);
              }
            }
            
            const displayWorkflowId = parsedMeta.workflowId.length > 12
              ? `${parsedMeta.workflowId.substring(0, 8)}...`
              : parsedMeta.workflowId;
            return (
              <div className="text-[10px] text-muted-foreground mt-1 w-full min-w-0 overflow-hidden">
                <span className="font-medium">Workflow:</span> {displayWorkflowId}
                <br />
                <span className="font-medium">Stage:</span> <span className="truncate">{displayStageName}</span>
              </div>
            );
          }
          return null;
        })()}

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
        {job.apiType !== "filesystem" && (!job.taskType || TaskTypeDetails[job.taskType as TaskType]?.requiresLlm !== false) && (
          <div className="text-muted-foreground text-[10px] mt-2 flex items-center justify-between min-h-[24px] w-full min-w-0">
            <div className="flex flex-col gap-0.5 max-w-[90%] overflow-hidden min-w-0 flex-1">
              {/* Display token counts with better formatting and fallback to metadata */}
              {(() => {
                const parsedMeta = getParsedMetadata(job.metadata);
                
                // Priority order: job fields > parsed metadata fields
                const tokensSent = Number(job.tokensSent || parsedMeta?.additionalParams?.tokensSent || 0);
                const tokensReceived = Number(job.tokensReceived || parsedMeta?.additionalParams?.tokensReceived || 0);
                const totalTokens = Number(job.totalTokens || parsedMeta?.additionalParams?.totalTokens || parsedMeta?.additionalParams?.tokensUsed || 0);
                
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
                const modelUsed = job.modelUsed ?? parsedMeta?.additionalParams?.modelUsed;
                
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
                    return parsedMeta?.additionalParams?.sessionName
                      ? `Plan: ${parsedMeta.additionalParams.sessionName}`
                      : "Implementation plan in database";
                  })()}
                </span>
              </div>
            )}

          {/* File output handling deprecated */}

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
                      Stage: {(() => {
                        let stageName = parsedMeta.workflowStage || formatTaskType(job.taskType);
                        if (parsedMeta.workflowStage) {
                          const stageEnum = WorkflowUtils.mapStageNameToEnum(parsedMeta.workflowStage);
                          if (stageEnum) {
                            stageName = WorkflowUtils.getStageName(stageEnum);
                          }
                        }
                        return stageName;
                      })()}
                    </span>
                    {/* Show additional workflow context if available */}
                    {parsedMeta?.additionalParams?.outputPath && (
                      <span className="text-[9px] text-muted-foreground truncate">
                        Output: {parsedMeta.additionalParams.outputPath}
                      </span>
                    )}
                  </div>
                </div>
              );
            }
            
            return null;
          })()}

          {/* Enhanced display for workflow stage jobs and path finder jobs */}
          {(job.taskType === "path_finder" || 
            job.taskType === "extended_path_finder" ||
            job.taskType === "file_finder_workflow") && 
           JOB_STATUSES.COMPLETED.includes(job.status as JobStatus) && (
            <div className="text-[10px] mt-2 border-t border-border/60 pt-2 flex items-center gap-1.5 text-muted-foreground">
              {(() => {
                const parsedMeta = getParsedMetadata(job.metadata);
                
                // Skip workflow display here since it's handled above
                if (parsedMeta?.workflowId) {
                  return null;
                }
                
                // Primary source: Parse job.response for final paths
                let displayText = "";
                if (job.response) {
                  try {
                    const parsed = JSON.parse(job.response);
                    
                    // For path_finder tasks, try PathFinderResult format first
                    if (job.taskType === "path_finder" && parsed && typeof parsed === 'object' && 'paths' in parsed && 'unverified_paths' in parsed) {
                      const verifiedCount = Array.isArray(parsed.paths) ? parsed.paths.length : 0;
                      const unverifiedCount = Array.isArray(parsed.unverified_paths) ? parsed.unverified_paths.length : 0;
                      const totalCount = verifiedCount + unverifiedCount;
                      
                      if (totalCount > 0) {
                        displayText = `Found ${verifiedCount} verified, ${unverifiedCount} unverified file${totalCount !== 1 ? "s" : ""}`;
                      } else {
                        displayText = "Path finder completed";
                      }
                    }
                    // For other path-related tasks, use Vec<String> format
                    else if (Array.isArray(parsed)) {
                      const count = parsed.length;
                      displayText = count > 0 ? `Found ${count} file${count !== 1 ? "s" : ""}` : "Path finder completed";
                    }
                  } catch {
                    // Fallback to metadata if job.response isn't valid JSON
                    const parsedMeta = getParsedMetadata(job.metadata);
                    const count = (typeof parsedMeta?.additionalParams?.pathCount === 'number') ? parsedMeta.additionalParams.pathCount : 0;
                    displayText = count > 0 ? `Found ${count} file${count !== 1 ? "s" : ""}` : "Path finder completed";
                  }
                }
                
                if (!displayText) {
                  displayText = job.taskType === "file_finder_workflow" ? "File finder completed" : "Path finder completed";
                }
                
                return (
                  <span className="font-medium text-foreground">
                    {displayText}
                  </span>
                );
              })()}
            </div>
          )}

          {/* For regular jobs or those without special indicators, show response preview */}
          {job.response &&
            !((job.taskType === "path_finder" || 
               job.taskType === "extended_path_finder" ||
               job.taskType === "file_finder_workflow") && JOB_STATUSES.COMPLETED.includes(job.status as JobStatus)) && (
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
