import {
  CheckCircle,
  AlertCircle,
  Clock,
  XCircle,
  Loader2,
  X,
  Trash2,
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
import { cn } from "@/utils/utils";

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
  onApplyFiles?: (job: BackgroundJob) => void;
  currentSessionId?: string;
}

/**
 * Custom hook for live progress updates
 * Updates progress every second for running jobs
 * Reflects accurate streamProgress from metadata
 */
const useLiveProgress = (
  metadata: any,
  startTime: number | null | undefined,
  taskType: string | undefined,
  isRunning: boolean
): number | undefined => {
  const [progress, setProgress] = useState<number | undefined>(() => 
    isRunning ? getStreamingProgressValue(metadata) : undefined
  );

  useEffect(() => {
    if (!isRunning) {
      setProgress(undefined);
      return;
    }

    const updateProgress = () => {
      const newProgress = getStreamingProgressValue(metadata);
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
  ({ job, handleCancel, handleDelete, isCancelling, isDeleting, onSelect, onApplyFiles, currentSessionId }: JobCardProps) => {
    
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
    
    // Memoize status-specific booleans for better performance
    const isCurrentJobCancelling = React.useMemo(() => Boolean(isCancelling?.[job.id]), [isCancelling, job.id]);
    const isCurrentJobDeleting = React.useMemo(() => Boolean(isDeleting?.[job.id]), [isDeleting, job.id]);

    // Use memoized helper functions with current job data
    const errorPreview = React.useMemo(() => getErrorPreview(job.errorMessage), [job.errorMessage]);
    
    // Determine if this job belongs to the current session
    const isCurrentSession = React.useMemo(() => 
      currentSessionId && job.sessionId === currentSessionId, 
      [currentSessionId, job.sessionId]
    );

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
        className={cn(
          "border border-border/60 bg-background/80 dark:bg-muted/30 p-2 rounded-lg text-xs text-foreground cursor-pointer transition-colors flex flex-col w-full max-w-full overflow-hidden shadow-soft backdrop-blur-sm min-w-0",
          {
            // Current session highlighting - very subtle for both light and dark modes
            "ring-1 ring-primary/20 border-primary/30 bg-primary/[0.02] dark:bg-muted/50": isCurrentSession,
            // Default hover state for non-current session
            "hover:bg-muted/50": !isCurrentSession,
            // Enhanced hover for current session - slightly more visible in dark mode
            "hover:ring-primary/30 hover:bg-primary/[0.04] dark:hover:bg-muted/80": isCurrentSession,
          }
        )}
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

        {/* Progress bar for active jobs */}
        {isJobRunning && (
          <div className="mt-2 mb-1">
            {(() => {
              // Show indeterminate progress if no accurate progress available
              const displayProgress = liveProgress;
              
              if (displayProgress !== undefined) {
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
              } else {
                // Show indeterminate progress when no progress data available
                return (
                  <>
                    <Progress
                      value={undefined}
                      className="h-1"
                    />
                    <div className="flex justify-between items-center min-w-0 overflow-hidden">
                      <p className="text-[9px] text-muted-foreground mt-0.5 text-right">
                        Processing...
                      </p>
                    </div>
                  </>
                );
              }
            })()
            }
          </div>
        )}

        {(!job.taskType || TaskTypeDetails[job.taskType as TaskType]?.requiresLlm !== false) && (
          <div className="text-muted-foreground text-[10px] mt-2 flex items-center justify-between min-h-[24px] w-full min-w-0">
            <div className="flex flex-col gap-0.5 max-w-[90%] overflow-hidden min-w-0 flex-1">
              {(() => {
                // Display token counts directly from job object (server-provided data)
                const tokensSent = Number(job.tokensSent || 0);
                const tokensReceived = Number(job.tokensReceived || 0);
                
                return (tokensSent > 0 || tokensReceived > 0) ? (
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
                    {modelUsed}
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

              return (
                <div className="text-[10px] mt-2 border-t border-border/60 pt-2">
                  <div className="flex items-center justify-between gap-2">
                    {/* Results Summary (left side) - Only show meaningful results */}
                    <div className="flex items-center gap-1.5 text-muted-foreground min-w-0 flex-1">
                      {(() => {
                        
                        // Handle all file-finding tasks that should show file counts
                        const fileFindingTasks = [
                          "extended_path_finder", 
                          "file_relevance_assessment",
                          "regex_file_filter"
                        ];
                        
                        if (fileFindingTasks.includes(job.taskType)) {
                          // Get file paths from structured job.metadata or job.response
                          let filePaths: string[] = [];
                          
                          // Check structured metadata first
                          if (parsedMeta?.verifiedPaths && Array.isArray(parsedMeta.verifiedPaths)) {
                            filePaths = parsedMeta.verifiedPaths;
                          } else if (parsedMeta?.relevantFiles && Array.isArray(parsedMeta.relevantFiles)) {
                            filePaths = parsedMeta.relevantFiles;
                          } else if (parsedMeta?.correctedPaths && Array.isArray(parsedMeta.correctedPaths)) {
                            filePaths = parsedMeta.correctedPaths;
                          }
                          
                          // If no paths in metadata, check response
                          if (filePaths.length === 0 && job.response) {
                            if (typeof job.response === 'object' && job.response !== null) {
                              // Handle path finder specific format with verified/unverified paths
                              if ('verifiedPaths' in job.response && 'unverifiedPaths' in job.response) {
                                const verifiedPaths = Array.isArray((job.response as any).verifiedPaths) ? (job.response as any).verifiedPaths : [];
                                const unverifiedPaths = Array.isArray((job.response as any).unverifiedPaths) ? (job.response as any).unverifiedPaths : [];
                                const verifiedCount = verifiedPaths.length;
                                const unverifiedCount = unverifiedPaths.length;
                                const totalCount = verifiedCount + unverifiedCount;
                                
                                if (totalCount > 0) {
                                  return (
                                    <span className="font-medium text-foreground">
                                      {verifiedCount} verified, {unverifiedCount} unverified
                                    </span>
                                  );
                                }
                              } else {
                                // Use standardized response format from backend
                                const responseObj = job.response as any;
                                
                                // Backend now standardizes all file-finding responses to have 'files' and 'count'
                                if (responseObj.files && Array.isArray(responseObj.files)) {
                                  filePaths = responseObj.files;
                                }
                                
                                // Use the standardized count field
                                if (typeof responseObj.count === 'number' && responseObj.count > 0) {
                                  const summary = responseObj.summary || `${responseObj.count} file${responseObj.count !== 1 ? "s" : ""} found`;
                                  return (
                                    <span className="font-medium text-foreground">
                                      {summary}
                                    </span>
                                  );
                                }
                              }
                            } else if (typeof job.response === 'string') {
                              try {
                                const parsed = JSON.parse(job.response);
                                if (Array.isArray(parsed)) {
                                  filePaths = parsed;
                                } else if (typeof parsed === 'object' && parsed !== null) {
                                  // Use standardized response format from backend
                                  if (parsed.files && Array.isArray(parsed.files)) {
                                    filePaths = parsed.files;
                                  }
                                  
                                  // Use the standardized count and summary if available
                                  if (typeof parsed.count === 'number' && parsed.count > 0) {
                                    const summary = parsed.summary || `${parsed.count} file${parsed.count !== 1 ? "s" : ""} found`;
                                    return (
                                      <span className="font-medium text-foreground">
                                        {summary}
                                      </span>
                                    );
                                  }
                                }
                              } catch {
                                // Ignore parsing errors
                              }
                            }
                          }
                          
                          // Display file count if any files found
                          if (filePaths.length > 0) {
                            const actionWord = job.taskType === "regex_file_filter" ? "filtered" :
                                             job.taskType === "file_relevance_assessment" ? "relevant" : "found";
                            return (
                              <span className="font-medium text-foreground">
                                {filePaths.length} {actionWord} file{filePaths.length !== 1 ? "s" : ""}
                              </span>
                            );
                          }
                          
                          // Check metadata before showing "No files found"
                          const count = (typeof parsedMeta?.finalVerifiedPaths === 'number') ? parsedMeta.finalVerifiedPaths : 
                                       (typeof parsedMeta?.taskData?.pathCount === 'number') ? parsedMeta.taskData.pathCount : 0;
                          if (count > 0) {
                            return (
                              <span className="font-medium text-foreground">
                                {count} file{count !== 1 ? "s" : ""} found
                              </span>
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
                            if (typeof job.response === 'string') {
                              try {
                                const parsed = JSON.parse(job.response);
                                
                                // Handle array responses (corrected paths) - legacy format
                                if (Array.isArray(parsed)) {
                                  const count = parsed.length;
                                  if (count > 0) {
                                    return (
                                      <span className="font-medium text-foreground">
                                        {count} corrected path{count !== 1 ? "s" : ""}
                                      </span>
                                    );
                                  }
                                }
                                // Use standardized response format from backend
                                else if (parsed && typeof parsed === 'object') {
                                  // Backend now standardizes to 'files' and 'count'
                                  if (parsed.files && Array.isArray(parsed.files) && parsed.count > 0) {
                                    const summary = parsed.summary || `${parsed.count} corrected path${parsed.count !== 1 ? "s" : ""}`;
                                    return (
                                      <span className="font-medium text-foreground">
                                        {summary}
                                      </span>
                                    );
                                  }
                                }
                              } catch {
                                // Fallback to metadata
                                const count = (typeof parsedMeta?.pathCount === 'number') ? parsedMeta.pathCount : 0;
                                if (count > 0) {
                                  return (
                                    <span className="font-medium text-foreground">
                                      {count} corrected path{count !== 1 ? "s" : ""}
                                    </span>
                                  );
                                }
                              }
                            } else if (typeof job.response === 'object' && job.response !== null) {
                              // Use standardized response format from backend
                              const responseObj = job.response as any;
                              
                              // Backend now standardizes to 'files' and 'count'
                              if (responseObj.files && Array.isArray(responseObj.files) && responseObj.count > 0) {
                                const summary = responseObj.summary || `${responseObj.count} corrected path${responseObj.count !== 1 ? "s" : ""}`;
                                return (
                                  <span className="font-medium text-foreground">
                                    {summary}
                                  </span>
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
                        
                        // Handle web search execution tasks
                        if (job.taskType === "web_search_execution") {
                          if (job.response) {
                            try {
                              let responseData: any;
                              if (typeof job.response === 'string') {
                                responseData = JSON.parse(job.response);
                              } else {
                                responseData = job.response;
                              }
                              
                              // Check for searchResults array
                              if (responseData.searchResults && Array.isArray(responseData.searchResults)) {
                                const count = responseData.searchResults.length;
                                if (count > 0) {
                                  return (
                                    <span className="font-medium text-foreground">
                                      {count} research finding{count !== 1 ? "s" : ""} ready
                                    </span>
                                  );
                                }
                              }
                            } catch (e) {
                              // Fall through to generic message
                            }
                          }
                          
                          return (
                            <span className="text-muted-foreground">
                              No research findings generated
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
                    
                    {/* Right side - Cost and Add Files button */}
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {(() => {
                        // Determine if we should show the Add Files button
                        const fileFindingTasks = [
                          "extended_path_finder", 
                          "file_relevance_assessment",
                          "path_correction",
                          "regex_file_filter"
                        ];
                        
                        const shouldShowAddFiles = onApplyFiles && (
                          // File finding tasks with results
                          (fileFindingTasks.includes(job.taskType) && (
                            // Check various response formats for file results
                            (job.response && (
                              (typeof job.response === 'object' && job.response !== null && 
                                ((job.response as any).files?.length > 0 || 
                                 (job.response as any).verifiedPaths?.length > 0 ||
                                 (job.response as any).unverifiedPaths?.length > 0)) ||
                              (typeof job.response === 'string' && job.response.length > 2)
                            )) ||
                            // Or metadata indicates files found
                            (parsedMeta && (
                              (parsedMeta.verifiedPaths as any)?.length > 0 ||
                              (parsedMeta.relevantFiles as any)?.length > 0 ||
                              (parsedMeta.correctedPaths as any)?.length > 0 ||
                              (parsedMeta.finalVerifiedPaths as any) > 0 ||
                              parsedMeta.taskData?.pathCount > 0
                            ))
                          )) ||
                          // Web search with results (only for current session)
                          (job.taskType === "web_search_execution" && 
                           job.sessionId === currentSessionId &&
                           job.response && 
                           ((typeof job.response === 'object' && (job.response as any).searchResults?.length > 0) ||
                            (typeof job.response === 'string' && job.response.includes('searchResults')))
                          )
                        );
                        
                        return (
                          <>
                            {shouldShowAddFiles && (
                              <Button
                                variant="outline"
                                size="xs"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onApplyFiles(job);
                                }}
                                aria-label={job.taskType === "web_search_execution" ? "Apply research findings" : "Add files to selection"}
                                className="text-[10px] h-6 px-2 py-0.5 font-medium border-primary/40 hover:border-primary hover:bg-primary/10"
                              >
                                {job.taskType === "web_search_execution" ? "Use Research" : "Use Files"}
                              </Button>
                            )}
                            {job.actualCost !== null && job.actualCost !== undefined && job.actualCost > 0 && (
                              <span className="font-mono text-[9px] text-foreground">
                                {formatUsdCurrencyPrecise(job.actualCost)}
                              </span>
                            )}
                          </>
                        );
                      })()}
                    </div>
                  </div>
                </div>
              );
            }
            
            // Failed/Cancelled jobs - show error and cost if any
            if ((job.status === "failed" || job.status === "canceled") && job.errorMessage) {
              return (
                <div className="text-[10px] mt-2 border-t border-border/60 pt-2">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className={`${job.status === "failed" ? "text-destructive" : "text-muted-foreground"} break-words text-balance overflow-hidden`}>
                        <div className="h-[40px] w-full overflow-y-auto overflow-x-hidden">
                          <div className="break-words whitespace-pre-wrap overflow-wrap-anywhere">
                            {errorPreview}
                          </div>
                        </div>
                      </div>
                    </div>
                    {job.actualCost !== null && job.actualCost !== undefined && job.actualCost > 0 && (
                      <div className="flex-shrink-0">
                        <span className="font-mono text-[9px] text-foreground">
                          {formatUsdCurrencyPrecise(job.actualCost)}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              );
            }
            
            // Status messages for other non-completed jobs with errorMessage
            if (!JOB_STATUSES.COMPLETED.includes(job.status as JobStatus) && job.errorMessage) {
              const textColorClass = "text-muted-foreground";
              
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
