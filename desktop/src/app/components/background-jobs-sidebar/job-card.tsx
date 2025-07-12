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
  job: BackgroundJob,
  isRunning: boolean
): number | undefined => {
  const [progress, setProgress] = useState<number | undefined>(() => 
    isRunning ? getStreamingProgressValue(job.metadata, job.startTime) : undefined
  );

  useEffect(() => {
    if (!isRunning) {
      setProgress(undefined);
      return;
    }

    const updateProgress = () => {
      // First check if job has progressPercentage field (for workflow jobs)
      if (job.progressPercentage !== undefined && job.progressPercentage !== null) {
        setProgress(job.progressPercentage);
        return;
      }

      // Check for stream progress from metadata
      const streamProgress = getStreamingProgressValue(job.metadata, job.startTime);
      if (streamProgress !== undefined) {
        setProgress(streamProgress);
        return;
      }

      // Fall back to time-based progress animation with different durations per task type
      if (job.startTime || job.createdAt) {
        const elapsed = Date.now() - new Date(job.startTime || job.createdAt).getTime();
        let estimatedDuration = 30000; // Default 30 seconds
        
        const taskDurations: Record<string, number> = {
          'extended_path_finder': 20000,
          'file_relevance_assessment': 20000,
          'regex_file_filter': 20000,
          'path_correction': 20000,
          'implementation_plan': 90000,
          'implementation_plan_merge': 90000,
          'web_search_prompts_generation': 30000,
          'web_search_execution': 120000,
          'text_improvement': 45000,
          'task_refinement': 30000,
          'generic_llm_stream': 60000,
        };
        
        estimatedDuration = taskDurations[job.taskType] || estimatedDuration;
        const progress = Math.min(90, (elapsed / estimatedDuration) * 90);
        setProgress(Math.round(progress));
      }
    };

    // Update immediately
    updateProgress();

    // Set up interval to update every 500ms for smoother animation
    const interval = setInterval(updateProgress, 500);

    return () => clearInterval(interval);
  }, [job, isRunning]);

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
    
    // Hide workflow orchestrator jobs
    const isWorkflowJob = ['file_finder_workflow', 'web_search_workflow'].includes(job.taskType);
    if (isWorkflowJob) {
      return null;
    }
    
    // Determine if job is running for live progress updates  
    const isJobRunning = ["running", "processingStream", "generatingStream", "preparing", "preparing_input"].includes(job.status);
    
    // Use live progress hook for running jobs
    const liveProgress = useLiveProgress(job, isJobRunning);
    
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
                      {job.subStatusMessage ? (
                        <p className="text-[9px] text-muted-foreground mt-0.5 truncate">
                          {job.subStatusMessage}
                        </p>
                      ) : null}
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
                      {job.subStatusMessage ? (
                        <p className="text-[9px] text-muted-foreground mt-0.5 truncate">
                          {job.subStatusMessage}
                        </p>
                      ) : null}
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
                const cacheReadTokens = Number(job.cacheReadTokens || 0);
                const cacheWriteTokens = Number(job.cacheWriteTokens || 0);
                
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
                    {(cacheReadTokens > 0 || cacheWriteTokens > 0) && (
                      <>
                        <span className="text-[9px] text-muted-foreground flex-shrink-0 ml-1">
                          (cache:
                        </span>
                        {cacheReadTokens > 0 && (
                          <span className="font-mono text-teal-600 dark:text-teal-400 text-[9px] flex-shrink-0">
                            R{formatTokenCount(cacheReadTokens)}
                          </span>
                        )}
                        {cacheWriteTokens > 0 && (
                          <>
                            {cacheReadTokens > 0 && <span className="text-[9px] text-muted-foreground flex-shrink-0">/</span>}
                            <span className="font-mono text-amber-600 dark:text-amber-400 text-[9px] flex-shrink-0">
                              W{formatTokenCount(cacheWriteTokens)}
                            </span>
                          </>
                        )}
                        <span className="text-[9px] text-muted-foreground flex-shrink-0">)</span>
                      </>
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
                          // Use standardized response format from backend
                          if (job.response) {
                            try {
                              let responseObj: any;
                              if (typeof job.response === 'string') {
                                responseObj = JSON.parse(job.response);
                              } else {
                                responseObj = job.response;
                              }
                              
                              // Backend standardizes all file-finding responses to have 'files' and 'count'
                              if (typeof responseObj.count === 'number') {
                                const summary = responseObj.summary || `${responseObj.count} file${responseObj.count !== 1 ? "s" : ""} found`;
                                return (
                                  <span className="font-medium text-foreground">
                                    {summary}
                                  </span>
                                );
                              }
                            } catch (e) {
                              // Fall through to "No files found"
                            }
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
                          // Use standardized response format from backend
                          if (job.response) {
                            try {
                              let responseObj: any;
                              if (typeof job.response === 'string') {
                                responseObj = JSON.parse(job.response);
                              } else {
                                responseObj = job.response;
                              }
                              
                              // Backend standardizes to 'files' and 'count'
                              if (typeof responseObj.count === 'number' && responseObj.count > 0) {
                                const summary = responseObj.summary || `${responseObj.count} corrected path${responseObj.count !== 1 ? "s" : ""}`;
                                return (
                                  <span className="font-medium text-foreground">
                                    {summary}
                                  </span>
                                );
                              }
                            } catch (e) {
                              // Fall through to "No paths corrected"
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
                          (fileFindingTasks.includes(job.taskType) && 
                            job.response && (() => {
                              try {
                                let responseData: any;
                                if (typeof job.response === 'string') {
                                  responseData = JSON.parse(job.response);
                                } else {
                                  responseData = job.response;
                                }
                                return responseData.count > 0;
                              } catch (e) {
                                return false;
                              }
                            })()
                          ) ||
                          // Web search with results
                          (job.taskType === "web_search_execution" && 
                           job.response && (() => {
                             try {
                               let responseData: any;
                               if (typeof job.response === 'string') {
                                 responseData = JSON.parse(job.response);
                               } else {
                                 responseData = job.response;
                               }
                               
                               // Check for searchResults array with actual results
                               return responseData.searchResults && 
                                      Array.isArray(responseData.searchResults) && 
                                      responseData.searchResults.length > 0;
                             } catch (e) {
                               return false;
                             }
                           })()
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
