import {
  CheckCircle,
  AlertCircle,
  Clock,
  XCircle,
  Loader2,
  X,
  Trash2,
  PlayCircle,
  Check,
} from "lucide-react";
import React, { useState } from "react";

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
import { useNotification } from "@/contexts/notification-context";
import { extractFilesFromResponse, hasFilesInResponse } from "@/utils/response-utils";

import {
  getStatusIconClass,
  formatTaskType,
  formatTimeAgo,
  formatTokenCount,
  getParsedMetadata,
  getTextImprovementOriginalText,
  getJobDisplayName,
} from "./utils";
import { formatUsdCurrencyPrecise } from "@/utils/currency-utils";
import { useLiveDuration } from "@/hooks/use-live-duration";
import { useLiveProgress } from "@/hooks/use-live-progress";

export interface JobCardProps {
  job: BackgroundJob;
  handleCancel: (id: string) => Promise<void>;
  handleDelete: (id: string) => Promise<void>;
  isCancelling: Record<string, boolean>;
  isDeleting: Record<string, boolean>;
  onSelect: (job: BackgroundJob) => void;
  onApplyFiles?: (job: BackgroundJob) => Promise<void>;
  onContinueWorkflow?: (job: BackgroundJob) => Promise<void>;
  currentSessionId?: string;
  hasContinuationJob?: boolean; // Whether a web_search_execution job already exists for this job
  isWorkflowActive?: boolean; // Whether this job's workflow is still active
  webSearchSystemPrompt?: string; // Pre-fetched system prompt for web search execution
}

const getErrorPreview = (errorMessage?: string) => {
  if (!errorMessage) return "";
  const maxLength = 150; // Max characters for preview
  return errorMessage.length > maxLength
    ? `${errorMessage.substring(0, maxLength)}...`
    : errorMessage;
};

const CopyPromptButton = ({ prompt, systemPrompt, index, showNotification }: { prompt: string, systemPrompt: string, index: number, showNotification: (args: any) => void }) => {
  const [isCopied, setIsCopied] = useState(false);

  const handleCopy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    const instruction = `\n\nIMPORTANT: After executing this search and receiving the results, wrap your final answer with the following XML tag:\n<research_finding_${index + 1}>\n[Your research findings here]\n</research_finding_${index + 1}>`;
    const textToCopy = systemPrompt ? `${systemPrompt}\n\n${prompt}${instruction}` : `${prompt}${instruction}`;
    try {
      await navigator.clipboard.writeText(textToCopy);
      setIsCopied(true);
      showNotification({ title: 'Prompt copied', message: `Prompt #${index + 1} copied to clipboard.`, type: 'success' });
      setTimeout(() => setIsCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy prompt:', err);
      showNotification({ title: 'Copy failed', message: 'Could not copy prompt to clipboard.', type: 'error' });
    }
  };

  return (
    <Button
      size="xs"
      variant="outline"
      onClick={handleCopy}
      className={cn("h-6 w-6 p-0 text-xs", isCopied && "bg-green-500/20 text-green-600 border-green-500/50")}
      title={`Copy prompt ${index + 1}`}
    >
      {isCopied ? <Check className="h-3 w-3" /> : (index + 1)}
    </Button>
  );
};

export const JobCard = React.memo(
  ({ job, handleCancel, handleDelete, isCancelling, isDeleting, onSelect, onApplyFiles, onContinueWorkflow, currentSessionId, hasContinuationJob = false, isWorkflowActive = false, webSearchSystemPrompt = '' }: JobCardProps) => {
    const { showNotification } = useNotification();
    
    // Hide workflow orchestrator jobs
    const isWorkflowJob = ['file_finder_workflow', 'web_search_workflow'].includes(job.taskType);
    if (isWorkflowJob) {
      return null;
    }
    
    // Determine if job is running for live progress updates  
    const isJobRunning = ["running", "processingStream", "generatingStream", "preparing", "preparing_input"].includes(job.status);
    
    // Use live progress hook for real-time progress updates
    const progress = useLiveProgress(job);
    
    // Use live duration hook for real-time duration updates (keep this for now but optimize later)
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
    const errorPreview = React.useMemo(() => {
      // If we have detailed error information, show a more informative preview
      if (job.errorDetails) {
        const { code, message } = job.errorDetails;
        const codeLabel = code.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
        const formattedMessage = `${codeLabel}: ${message}`;
        const maxLength = 150; // Max characters for preview
        return formattedMessage.length > maxLength
          ? `${formattedMessage.substring(0, maxLength)}...`
          : formattedMessage;
      }
      return getErrorPreview(job.errorMessage);
    }, [job.errorMessage, job.errorDetails]);
    
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
            <span className="truncate text-foreground">{getJobDisplayName(job) || getStatusDisplay()}</span>
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


        <div className="text-muted-foreground text-[10px] mt-2 flex items-center justify-between">
          <span>{timeAgo}</span>
          {job.taskType === "web_search_prompts_generation" && 
           job.status === "completed" && 
           onContinueWorkflow && 
           !hasContinuationJob && 
           !isWorkflowActive && (
            <Button
              variant="outline" 
              size="xs"
              onClick={async (e) => {
                e.stopPropagation();
                try {
                  await onContinueWorkflow(job);
                } catch (error) {
                  console.error('Failed to continue workflow:', error);
                }
              }}
              className="text-[10px] h-5 px-2 py-0 font-medium border-primary/40 hover:border-primary hover:bg-primary/10 flex items-center gap-1"
              aria-label="Continue research workflow"
            >
              <PlayCircle className="h-3 w-3" />
              Continue Research
            </Button>
          )}
        </div>

        {/* Progress bar for active jobs */}
        {isJobRunning && (
          <div className="mt-2 mb-1">
            {progress !== undefined ? (
              <>
                <Progress
                  value={progress}
                  className="h-1"
                />
                <div className="flex justify-between items-center min-w-0 overflow-hidden">
                  {job.subStatusMessage ? (
                    <p className="text-[9px] text-muted-foreground mt-0.5 truncate">
                      {job.subStatusMessage}
                    </p>
                  ) : null}
                  <p className="text-[9px] text-muted-foreground mt-0.5 text-right">
                    {Math.round(progress)}%
                  </p>
                </div>
              </>
            ) : (
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
            )}
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
                          "regex_file_filter",
                          "path_correction"
                        ];
                        
                        if (fileFindingTasks.includes(job.taskType)) {
                          if (job.response) {
                            try {
                              let responseObj: any;
                              if (typeof job.response === 'string') {
                                responseObj = JSON.parse(job.response);
                              } else {
                                responseObj = job.response;
                              }
                              
                              // First check if backend summary exists and render it
                              if (responseObj.summary) {
                                return (
                                  <span className="font-medium text-foreground">
                                    {responseObj.summary}
                                  </span>
                                );
                              }
                              
                              // Use centralized extraction for consistent file count
                              const files = extractFilesFromResponse(job.response);
                              const count = files.length;
                              return (
                                <span className="font-medium text-foreground">
                                  {count > 0 ? `${count} file${count !== 1 ? 's' : ''} found` : 'No files found'}
                                </span>
                              );
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
                        if (job.taskType === "implementation_plan" || job.taskType === "implementation_plan_merge") {
                          const sessionName = parsedMeta?.taskData?.sessionName;
                          return (
                            <span className="font-medium text-foreground">
                              {sessionName ? `Plan: ${sessionName}` : "Plan generated"}
                            </span>
                          );
                        }
                        
                        // Handle video analysis tasks
                        if (job.taskType === "video_analysis") {
                          const videoPath = parsedMeta?.taskData?.videoPath || 
                                          parsedMeta?.jobPayloadForWorker?.VideoAnalysis?.video_path ||
                                          parsedMeta?.jobPayloadForWorker?.videoAnalysis?.video_path;
                          
                          if (videoPath && typeof videoPath === 'string') {
                            const pathParts = videoPath.split(/[/\\]/);
                            const fileName = pathParts[pathParts.length - 1] || 'video';
                            return (
                              <span className="font-medium text-foreground">
                                Video analyzed: {fileName}
                              </span>
                            );
                          }
                          
                          return (
                            <span className="font-medium text-foreground">
                              Video analysis completed
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
                        
                        
                        // Handle web search prompts generation
                        if (job.taskType === "web_search_prompts_generation") {
                          let prompts: string[] = [];
                          let summary = 'No prompts generated';
                          try {
                            if (job.response) {
                              const responseData = typeof job.response === 'string' ? JSON.parse(job.response) : job.response;
                              if (Array.isArray(responseData.prompts)) {
                                prompts = responseData.prompts;
                              }
                              const count = prompts.length;
                              summary = responseData?.summary || (count > 0 ? `${count} search prompt${count !== 1 ? 's' : ''} generated` : 'No prompts generated');
                            }
                          } catch (e) {
                            console.error("Failed to parse job response for prompts", e);
                          }

                          const MAX_BUTTONS = 20;

                          return (
                            <div className="flex flex-col gap-2">
                              <span className="font-medium text-foreground">
                                {summary}
                              </span>
                              {prompts.length > 0 && (
                                <div className="flex flex-wrap gap-1.5">
                                  {prompts.slice(0, MAX_BUTTONS).map((prompt, index) => (
                                    <CopyPromptButton
                                      key={index}
                                      prompt={prompt}
                                      systemPrompt={webSearchSystemPrompt}
                                      index={index}
                                      showNotification={showNotification}
                                    />
                                  ))}
                                  {prompts.length > MAX_BUTTONS && (
                                    <Badge variant="secondary" className="text-xs h-6">
                                      +{prompts.length - MAX_BUTTONS} more
                                    </Badge>
                                  )}
                                </div>
                              )}
                            </div>
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
                              
                              // First check if backend summary exists and render it
                              if (responseData.summary) {
                                return (
                                  <span className="font-medium text-foreground">
                                    {responseData.summary}
                                  </span>
                                );
                              }
                              
                              // Keep existing logic as fallback for older jobs
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
                        
                        // Handle task refinement
                        if (job.taskType === "task_refinement") {
                          if (job.response) {
                            try {
                              let responseObj: any;
                              if (typeof job.response === 'string') {
                                responseObj = JSON.parse(job.response);
                              } else {
                                responseObj = job.response;
                              }
                              
                              // Check for and render backend summary
                              if (responseObj.summary) {
                                return (
                                  <span className="font-medium text-foreground">
                                    {responseObj.summary}
                                  </span>
                                );
                              }
                            } catch (e) {
                              // Fall through to generic message
                            }
                          }
                          
                          return (
                            <span className="text-muted-foreground">
                              Task refined
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
                          // File finding tasks - show button only if files were found
                          (fileFindingTasks.includes(job.taskType) && 
                            job.status === "completed" && 
                            hasFilesInResponse(job.response)
                          ) ||
                          // Video analysis with completed results
                          (job.taskType === "video_analysis" && 
                            job.status === "completed" && 
                            job.response
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
                                onClick={async (e) => {
                                  e.stopPropagation();
                                  try {
                                    await onApplyFiles(job);
                                  } catch (error) {
                                    console.error('Failed to apply files from job:', error);
                                  }
                                }}
                                aria-label={
                                  job.taskType === "web_search_execution" ? "Apply research findings" : 
                                  job.taskType === "video_analysis" ? "Apply video analysis findings" :
                                  "Add files to selection"
                                }
                                className="text-[10px] h-6 px-2 py-0.5 font-medium border-primary/40 hover:border-primary hover:bg-primary/10"
                              >
                                {
                                  job.taskType === "web_search_execution" ? "Use Research" : 
                                  job.taskType === "video_analysis" ? "Use findings" :
                                  "Use Files"
                                }
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
