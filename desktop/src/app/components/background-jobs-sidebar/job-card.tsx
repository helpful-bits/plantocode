import {
  CheckCircle,
  AlertCircle,
  Clock,
  XCircle,
  Loader2,
  X,
  Trash2,
  RotateCcw,
  Import,
} from "lucide-react";
import React, { useState, useEffect } from "react";

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
  getTextImprovementOriginalText,
} from "./utils";
import { formatUsdCurrencyPrecise } from "@/utils/currency-utils";
import { useLiveDuration } from "@/hooks/use-live-duration";

export interface JobCardProps {
  job: BackgroundJob;
  handleCancel: (id: string) => Promise<void>;
  handleDelete: (id: string) => Promise<void>;
  isCancelling: Record<string, boolean>;
  isDeleting: Record<string, boolean>;
  onSelect: (job: BackgroundJob) => void;
  handleRetry?: (workflowId: string, jobId: string) => Promise<void>;
  isRetrying?: Record<string, boolean>;
  onApplyFiles?: (job: BackgroundJob) => void;
}

/**
 * Custom hook for live progress updates
 * Updates progress every second for running jobs
 */
const useLiveProgress = (
  metadata: any,
  startTime: number | null | undefined,
  taskType: string | undefined,
  isRunning: boolean
): number | undefined => {
  const [progress, setProgress] = useState<number | undefined>(() => 
    isRunning ? getStreamingProgressValue(metadata, startTime, taskType) : undefined
  );

  useEffect(() => {
    if (!isRunning) {
      setProgress(undefined);
      return;
    }

    const updateProgress = () => {
      const newProgress = getStreamingProgressValue(metadata, startTime, taskType);
      setProgress(newProgress);
    };

    // Update immediately
    updateProgress();

    // Set up interval to update every second
    const interval = setInterval(updateProgress, 1000);

    return () => clearInterval(interval);
  }, [metadata, startTime, taskType, isRunning]);

  return progress;
};


const getErrorPreview = (errorMessage?: string) => {
  if (!errorMessage) return "";
  const maxLength = 150; // Max characters for preview
  return errorMessage.length > maxLength
    ? `${errorMessage.substring(0, maxLength)}...`
    : errorMessage;
};

export const JobCard = React.memo(
  ({ job, handleCancel, handleDelete, isCancelling, isDeleting, onSelect, handleRetry, isRetrying, onApplyFiles }: JobCardProps) => {
    
    // Determine if job is running for live progress updates  
    const isJobRunning = ["running", "processingStream", "generatingStream", "preparing", "preparing_input"].includes(job.status);
    
    // Use live progress hook for running jobs
    const liveProgress = useLiveProgress(job.metadata, job.startTime, job.taskType, isJobRunning);
    
    // Use live duration hook for real-time duration updates
    const liveDuration = useLiveDuration(job.startTime, job.endTime, job.status);

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
    
    // Parse job metadata to check for workflowId
    const parsedMetadata = React.useMemo(() => getParsedMetadata(job.metadata), [job.metadata]);
    
    // Determine if the job is a failed workflow stage and can be retried
    const canRetry = React.useMemo(() => {
      return job.status === "failed" && parsedMetadata?.workflowId;
    }, [job.status, parsedMetadata?.workflowId]);
    
    // Memoize status-specific booleans for better performance
    const isCurrentJobCancelling = React.useMemo(() => Boolean(isCancelling?.[job.id]), [isCancelling, job.id]);
    const isCurrentJobDeleting = React.useMemo(() => Boolean(isDeleting?.[job.id]), [isDeleting, job.id]);
    const isCurrentJobRetrying = React.useMemo(() => Boolean(isRetrying?.[job.id]), [isRetrying, job.id]);

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
            ) : canRetry && handleRetry ? (
              <Button
                variant="ghost"
                size="icon-xs"
                onClick={(e: React.MouseEvent<HTMLButtonElement>) => {
                  e.stopPropagation(); // Prevent triggering the card's onClick
                  if (parsedMetadata?.workflowId) {
                    void handleRetry(parsedMetadata.workflowId, job.id);
                  }
                }}
                isLoading={isCurrentJobRetrying}
                loadingIcon={<Loader2 className="h-3 w-3 animate-spin" />}
                aria-label="Retry job"
              >
                <RotateCcw className="h-3.5 w-3.5" />
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

        {/* Progress bar for active jobs */}
        {isJobRunning && (
          <div className="mt-2 mb-1">
            {(() => {
              // Use live progress for real-time updates
              const displayProgress = liveProgress !== undefined ? liveProgress : 10;
              
              return (
                <>
                  <Progress
                    value={displayProgress}
                    className="h-1"
                  />
                  <div className="flex justify-between items-center min-w-0 overflow-hidden">
                    <p className="text-[9px] text-muted-foreground mt-0.5 text-right">
                      {Math.round(displayProgress)}%
                    </p>
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

            {(job.startTime || isJobRunning) ? (
              <span className="text-[9px] text-muted-foreground flex-shrink-0 ml-1 self-end">
                {liveDuration}
              </span>
            ) : (
              <span className="h-3 flex-shrink-0"></span>
            )}
          </div>
        )}

        <div className="flex-1 flex flex-col justify-end">
          {/* Bottom section - Consolidated rendering logic */}
          {(() => {
            // Completion info for completed jobs
            if (JOB_STATUSES.COMPLETED.includes(job.status as JobStatus)) {
              const parsedMeta = getParsedMetadata(job.metadata);
              const cost = job.actualCost ?? parsedMeta?.taskData?.actualCost;

              return (
                <div className="text-[10px] mt-2 border-t border-border/60 pt-2">
                  <div className="flex items-center justify-between gap-2">
                    {/* Results Summary (left side) - Only show meaningful results */}
                    <div className="flex items-center gap-1.5 text-muted-foreground min-w-0 flex-1">
                      {(() => {
                        // Handle all file-finding tasks that should show file counts
                        const fileFindingTasks = [
                          "extended_path_finder", 
                          "file_finder_workflow",
                          "regex_file_filter",
                          "file_relevance_assessment"
                        ];
                        
                        if (fileFindingTasks.includes(job.taskType)) {
                          if (job.response) {
                            try {
                              const parsed = JSON.parse(job.response);
                              
                              // Handle path finder specific format with verified/unverified paths
                              if (parsed && typeof parsed === 'object' && 'verifiedPaths' in parsed && 'unverifiedPaths' in parsed) {
                                const verifiedCount = Array.isArray(parsed.verifiedPaths) ? parsed.verifiedPaths.length : 0;
                                const unverifiedCount = Array.isArray(parsed.unverifiedPaths) ? parsed.unverifiedPaths.length : 0;
                                const totalCount = verifiedCount + unverifiedCount;
                                
                                if (totalCount > 0) {
                                  return (
                                    <>
                                      <span className="font-medium text-foreground">
                                        {verifiedCount} verified, {unverifiedCount} unverified
                                      </span>
                                      {onApplyFiles && (
                                        <Button
                                          variant="ghost"
                                          size="icon-xs"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            onApplyFiles(job);
                                          }}
                                          aria-label="Apply files to selection"
                                          className="ml-2"
                                        >
                                          <Import className="h-3 w-3" />
                                        </Button>
                                      )}
                                    </>
                                  );
                                }
                              }
                              // Handle array responses (most common format)
                              else if (Array.isArray(parsed)) {
                                const count = parsed.length;
                                if (count > 0) {
                                  return (
                                    <>
                                      <span className="font-medium text-foreground">
                                        {count} file{count !== 1 ? "s" : ""} found
                                      </span>
                                      {onApplyFiles && (
                                        <Button
                                          variant="ghost"
                                          size="icon-xs"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            onApplyFiles(job);
                                          }}
                                          aria-label="Apply files to selection"
                                          className="ml-2"
                                        >
                                          <Import className="h-3 w-3" />
                                        </Button>
                                      )}
                                    </>
                                  );
                                }
                              }
                              // Handle object responses with file arrays
                              else if (parsed && typeof parsed === 'object') {
                                // Check for all possible field names used by different task types
                                const filePaths = parsed.filePaths || parsed.paths || parsed.files || 
                                                 parsed.filteredFiles || parsed.relevantFiles;
                                
                                // For file_relevance_assessment, use the count field if available
                                if (job.taskType === "file_relevance_assessment" && typeof parsed.count === 'number') {
                                  const count = parsed.count;
                                  if (count > 0) {
                                    return (
                                      <>
                                        <span className="font-medium text-foreground">
                                          {count} relevant file{count !== 1 ? "s" : ""} found
                                        </span>
                                        {onApplyFiles && (
                                          <Button
                                            variant="ghost"
                                            size="icon-xs"
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              onApplyFiles(job);
                                            }}
                                            aria-label="Apply files to selection"
                                            className="ml-2"
                                          >
                                            <Import className="h-3 w-3" />
                                          </Button>
                                        )}
                                      </>
                                    );
                                  }
                                }
                                
                                if (Array.isArray(filePaths)) {
                                  const count = filePaths.length;
                                  if (count > 0) {
                                    // Show task-specific messaging
                                    const actionWord = job.taskType === "regex_file_filter" ? "filtered" :
                                                     job.taskType === "file_relevance_assessment" ? "relevant" : "found";
                                    return (
                                      <>
                                        <span className="font-medium text-foreground">
                                          {count} {actionWord} file{count !== 1 ? "s" : ""}
                                        </span>
                                        {onApplyFiles && (
                                          <Button
                                            variant="ghost"
                                            size="icon-xs"
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              onApplyFiles(job);
                                            }}
                                            aria-label="Apply files to selection"
                                            className="ml-2"
                                          >
                                            <Import className="h-3 w-3" />
                                          </Button>
                                        )}
                                      </>
                                    );
                                  }
                                }
                              }
                            } catch {
                              // Fallback to metadata count
                              const count = (typeof parsedMeta?.finalVerifiedPaths === 'number') ? parsedMeta.finalVerifiedPaths : 
                                           (typeof parsedMeta?.taskData?.pathCount === 'number') ? parsedMeta.taskData.pathCount : 0;
                              if (count > 0) {
                                return (
                                  <>
                                    <span className="font-medium text-foreground">
                                      {count} file{count !== 1 ? "s" : ""} found
                                    </span>
                                    {onApplyFiles && (
                                      <Button
                                        variant="ghost"
                                        size="icon-xs"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          onApplyFiles(job);
                                        }}
                                        aria-label="Apply files to selection"
                                        className="ml-2"
                                      >
                                        <Import className="h-3 w-3" />
                                      </Button>
                                    )}
                                  </>
                                );
                              }
                            }
                          }
                          
                          // Check metadata before showing "No files found"
                          const count = (typeof parsedMeta?.finalVerifiedPaths === 'number') ? parsedMeta.finalVerifiedPaths : 
                                       (typeof parsedMeta?.taskData?.pathCount === 'number') ? parsedMeta.taskData.pathCount : 0;
                          if (count > 0) {
                            return (
                              <>
                                <span className="font-medium text-foreground">
                                  {count} file{count !== 1 ? "s" : ""} found
                                </span>
                                {onApplyFiles && (
                                  <Button
                                    variant="ghost"
                                    size="icon-xs"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      onApplyFiles(job);
                                    }}
                                    aria-label="Apply files to selection"
                                    className="ml-2"
                                  >
                                    <Import className="h-3 w-3" />
                                  </Button>
                                )}
                              </>
                            );
                          }
                          
                          // Show "No files found" for all file finding tasks
                          return (
                            <span className="text-muted-foreground">
                              No files found
                            </span>
                          );
                        }
                        
                        // Handle implementation plans
                        if (job.taskType === "implementation_plan") {
                          const sessionName = parsedMeta?.taskData?.sessionName;
                          return (
                            <span className="font-medium text-foreground">
                              {sessionName ? `Plan: ${sessionName}` : "Plan generated"}
                            </span>
                          );
                        }
                        
                        // Handle text improvement tasks
                        if (job.taskType === "text_improvement") {
                          const originalText = getTextImprovementOriginalText(parsedMeta);
                          return (
                            <div className="space-y-2">
                              <span className="font-medium text-foreground">
                                Text improved
                              </span>
                              {originalText && (
                                <div className="bg-muted/50 p-2 rounded text-[9px] max-h-16 overflow-y-auto">
                                  <div className="text-muted-foreground mb-1">Original transcription:</div>
                                  <div className="text-foreground line-clamp-3 whitespace-pre-wrap">
                                    {originalText}
                                  </div>
                                </div>
                              )}
                            </div>
                          );
                        }
                        
                        // Handle path correction tasks
                        if (job.taskType === "path_correction") {
                          if (job.response) {
                            try {
                              const parsed = JSON.parse(job.response);
                              
                              // Handle array responses (corrected paths)
                              if (Array.isArray(parsed)) {
                                const count = parsed.length;
                                if (count > 0) {
                                  return (
                                    <>
                                      <span className="font-medium text-foreground">
                                        {count} corrected path{count !== 1 ? "s" : ""}
                                      </span>
                                      {onApplyFiles && (
                                        <Button
                                          variant="ghost"
                                          size="icon-xs"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            onApplyFiles(job);
                                          }}
                                          aria-label="Use corrected paths"
                                          className="ml-2"
                                        >
                                          <Import className="h-3 w-3" />
                                        </Button>
                                      )}
                                    </>
                                  );
                                }
                              }
                              // Handle object responses with corrected paths
                              else if (parsed && typeof parsed === 'object') {
                                const correctedPaths = parsed.correctedPaths || parsed.paths || parsed.files;
                                
                                if (Array.isArray(correctedPaths)) {
                                  const count = correctedPaths.length;
                                  if (count > 0) {
                                    return (
                                      <>
                                        <span className="font-medium text-foreground">
                                          {count} corrected path{count !== 1 ? "s" : ""}
                                        </span>
                                        {onApplyFiles && (
                                          <Button
                                            variant="ghost"
                                            size="icon-xs"
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              onApplyFiles(job);
                                            }}
                                            aria-label="Use corrected paths"
                                            className="ml-2"
                                          >
                                            <Import className="h-3 w-3" />
                                          </Button>
                                        )}
                                      </>
                                    );
                                  }
                                }
                              }
                            } catch {
                              // Fallback to metadata
                              const count = (typeof parsedMeta?.pathCount === 'number') ? parsedMeta.pathCount : 0;
                              if (count > 0) {
                                return (
                                  <>
                                    <span className="font-medium text-foreground">
                                      {count} corrected path{count !== 1 ? "s" : ""}
                                    </span>
                                    {onApplyFiles && (
                                      <Button
                                        variant="ghost"
                                        size="icon-xs"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          onApplyFiles(job);
                                        }}
                                        aria-label="Use corrected paths"
                                        className="ml-2"
                                      >
                                        <Import className="h-3 w-3" />
                                      </Button>
                                    )}
                                  </>
                                );
                              }
                            }
                          }
                          
                          // Show "No paths corrected" for path correction tasks with no results
                          return (
                            <span className="text-muted-foreground">
                              No paths corrected
                            </span>
                          );
                        }
                        
                        // Handle workflow context
                        if (parsedMeta?.workflowId) {
                          return (
                            <span className="font-medium text-primary">
                              Workflow completed
                            </span>
                          );
                        }
                        
                        // For other tasks, show generic completion
                        return (
                          <span className="text-muted-foreground">
                            Task completed
                          </span>
                        );
                      })()}
                    </div>
                    
                    {/* Cost (right side) - Only show if meaningful */}
                    <div className="flex-shrink-0">
                      {cost && Number(cost) > 0 ? (
                        <span className="font-mono text-[9px] text-foreground">
                          {formatUsdCurrencyPrecise(cost)}
                        </span>
                      ) : null}
                    </div>
                  </div>
                </div>
              );
            }
            
            // Status messages for non-completed jobs with errorMessage
            if (!JOB_STATUSES.COMPLETED.includes(job.status as JobStatus) && job.errorMessage) {
              const textColorClass = (job.status === "failed" || job.status === "canceled") 
                ? "text-destructive" 
                : "text-muted-foreground";
              
              return (
                <div className={`text-[10px] mt-2 border-t border-border/60 pt-2 ${textColorClass} break-words text-balance overflow-hidden`}>
                  <div className="h-[40px] w-full overflow-y-auto overflow-x-hidden">
                    <div className="break-words whitespace-pre-wrap overflow-wrap-anywhere">
                      {errorPreview}
                    </div>
                  </div>
                </div>
              );
            }
            
            // Spacer for non-completed jobs without messages
            return <div className="h-[42px]"></div>;
          })()}
        </div>
      </div>
    );
  }
);

// Add displayName for better debugging
JobCard.displayName = "JobCard";
