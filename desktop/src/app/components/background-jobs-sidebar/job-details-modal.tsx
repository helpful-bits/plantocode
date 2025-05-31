import { Loader2 } from "lucide-react";
import { type BackgroundJob, JOB_STATUSES, type JobStatus } from "@/types/session-types";
import { Button } from "@/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/ui/dialog";
import { formatJobDuration } from "@/utils/date-utils";
import { useExistingWorkflowTracker } from "@/hooks/use-workflow-tracker";
import { getParsedMetadata } from "./utils";
import { WorkflowVisualizer } from "@/components/workflow-visualizer";
import { retryWorkflowStageAction } from "@/actions/file-system/workflow-stage.actions";
import { useState } from "react";


// Import component sections
import { JobDetailsAdditionalInfoSection } from "./_components/job-details/JobDetailsAdditionalInfoSection";
import { JobDetailsErrorSection } from "./_components/job-details/JobDetailsErrorSection";
import { JobDetailsMetadataSection } from "./_components/job-details/JobDetailsMetadataSection";
import { JobDetailsModelConfigSection } from "./_components/job-details/JobDetailsModelConfigSection";
import { JobDetailsPromptSection } from "./_components/job-details/JobDetailsPromptSection";
import { JobDetailsSystemPromptSection } from "./_components/job-details/JobDetailsSystemPromptSection";
import { JobDetailsResponseSection } from "./_components/job-details/JobDetailsResponseSection";
import { JobDetailsStatusSection } from "./_components/job-details/JobDetailsStatusSection";
import { JobDetailsTimingSection } from "./_components/job-details/JobDetailsTimingSection";
import { JobDetailsCostUsageSection } from "./_components/job-details/JobDetailsCostUsageSection";

interface JobDetailsModalProps {
  job: BackgroundJob | null;
  onClose: () => void;
}

interface WorkflowStagesProps {
  job: BackgroundJob;
}

function WorkflowStages({ job }: WorkflowStagesProps) {
  const [retryingStage, setRetryingStage] = useState<string | null>(null);
  const parsedMeta = getParsedMetadata(job.metadata);
  const workflowId = parsedMeta?.workflowId;
  
  // Get workflow state if this is a workflow job
  const { workflowState, error } = useExistingWorkflowTracker(
    workflowId || '',
    job.sessionId || '',
    {
      pollInterval: 2000, // Poll every 2 seconds for live updates
    }
  );

  const handleRetryStage = async (stageJobId: string) => {
    if (!workflowId) {
      console.warn('Cannot retry stage: no workflow ID available');
      return;
    }
    
    setRetryingStage(stageJobId);
    try {
      const result = await retryWorkflowStageAction(workflowId, stageJobId);
      if (!result.isSuccess) {
        console.error('Failed to retry stage:', result.error);
        // Could show a toast notification here
      } else {
        console.log(`Successfully retried stage ${stageJobId} in workflow ${workflowId}`);
      }
    } catch (error) {
      console.error('Error retrying stage:', error);
    } finally {
      setRetryingStage(null);
    }
  };

  if (!workflowId) {
    return null;
  }

  if (error) {
    return (
      <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
        <div className="text-sm text-red-800 dark:text-red-200">
          Failed to load workflow details: {error.message}
        </div>
      </div>
    );
  }

  if (!workflowState) {
    return (
      <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-4">
        <div className="flex items-center gap-2">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span className="text-sm">Loading workflow details...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="border border-border rounded-lg p-4">
        <h3 className="text-lg font-semibold mb-3">Workflow Stages</h3>
        
        {/* Stage Jobs List */}
        <div className="space-y-3">
          {workflowState.stageJobs.map((stageJob) => {
            const isRetrying = retryingStage === stageJob.jobId;
            const canRetry = stageJob.status === 'failed' && !isRetrying && stageJob.jobId;
            
            return (
              <div
                key={stageJob.jobId || stageJob.stage}
                className="border border-border rounded-lg p-3 bg-white dark:bg-gray-800"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className={`w-3 h-3 rounded-full ${
                      stageJob.status === 'completed' || stageJob.status === 'completed_by_tag'
                        ? 'bg-green-500'
                        : stageJob.status === 'failed'
                        ? 'bg-red-500'
                        : ['running', 'preparing', 'processing_stream', 'acknowledged_by_worker', 'preparing_input', 'generating_stream'].includes(stageJob.status)
                        ? 'bg-blue-500 animate-pulse'
                        : 'bg-gray-300'
                    }`} />
                    <div>
                      <div className="font-medium text-sm">
                        {stageJob.stage.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, l => l.toUpperCase())}
                      </div>
                      <div className="text-xs text-gray-500">
                        {stageJob.jobId ? `Job ID: ${stageJob.jobId}` : 'No job ID available'}
                      </div>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-2">
                    {stageJob.executionTimeMs && (
                      <span className="text-xs text-gray-500">
                        {Math.round(stageJob.executionTimeMs / 1000)}s
                      </span>
                    )}
                    <span className={`text-xs px-2 py-1 rounded-full ${
                      stageJob.status === 'completed' || stageJob.status === 'completed_by_tag'
                        ? 'bg-green-100 text-green-800 dark:bg-green-900/20 dark:text-green-200'
                        : stageJob.status === 'failed'
                        ? 'bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-200'
                        : ['running', 'preparing', 'processing_stream', 'acknowledged_by_worker', 'preparing_input', 'generating_stream'].includes(stageJob.status)
                        ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-200'
                        : 'bg-gray-100 text-gray-800 dark:bg-gray-900/20 dark:text-gray-200'
                    }`}>
                      {stageJob.status}
                    </span>
                    
                    {canRetry && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleRetryStage(stageJob.jobId!)}
                        disabled={isRetrying || !stageJob.jobId}
                        title={!stageJob.jobId ? 'Cannot retry: No job ID available' : 'Retry failed stage'}
                      >
                        {isRetrying ? (
                          <>
                            <Loader2 className="h-3 w-3 animate-spin mr-1" />
                            Retrying...
                          </>
                        ) : (
                          'Retry'
                        )}
                      </Button>
                    )}
                  </div>
                </div>
                
                {stageJob.errorMessage && (
                  <div className="mt-2 text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 rounded p-2">
                    {stageJob.errorMessage}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
      
      {/* Workflow Visualizer */}
      <WorkflowVisualizer
        workflowState={workflowState}
        showDetails={false}
        showTiming={true}
        className="border-0"
      />
    </div>
  );
}

export function JobDetailsModal({ job, onClose }: JobDetailsModalProps) {
  // File-based content loading has been removed
  // All job output content is now stored directly in the job.response field

  // Format JSON data for display
  const formatMetadata = (metadata: string | Record<string, unknown> | null | undefined) => {
    try {
      if (!metadata) return "None";

      // Parse metadata string if needed
      const parsedMetadata = getParsedMetadata(metadata);
      if (!parsedMetadata) {
        return typeof metadata === "string" ? metadata : "Invalid metadata";
      }

      // Filter out keys that are already shown in the UI
      // or don't provide useful information
      const filteredMetadata = { ...parsedMetadata };
      const keysToRemove = [
        "modelUsed",
        "maxOutputTokens",
        "temperature",
        "tokensSent",
        "tokensReceived",
        "tokensTotal",
        "lastUpdateTime", // This is redundant with the updatedAt field
        "outputFilePath", // This is shown separately in the UI
        "regexData", // This will be displayed separately if present
      ];

      keysToRemove.forEach((key) => {
        if (key in filteredMetadata) {
          delete filteredMetadata[key];
        }
      });

      // Format the object for display
      return JSON.stringify(filteredMetadata, null, 2);
    } catch (_e) {
      return "Invalid metadata";
    }
  };

  // Format regex patterns for display
  const formatRegexPatterns = (regexDataInput: string | Record<string, unknown> | null | undefined): string | null => {
    if (!regexDataInput) return null;

    try {
      let regexData: Record<string, unknown>;
      
      // If it's a string, try to parse it as JSON
      if (typeof regexDataInput === "string") {
        try {
          regexData = JSON.parse(regexDataInput) as Record<string, unknown>;
        } catch (_e) {
          return regexDataInput;
        }
      } else {
        regexData = regexDataInput;
      }

      // Cast to any for flexible access to the data structure from Rust backend
      const data = regexData as any;
      const patternsOutput: string[] = [];
      
      // Extract primary pattern
      const primaryPattern = data?.primaryPattern?.pattern;
      if (primaryPattern) {
        patternsOutput.push(`Primary: /${primaryPattern}/`);
      }

      // Extract alternative patterns
      const alternatives = data?.alternativePatterns;
      if (Array.isArray(alternatives)) {
        alternatives.forEach((alt: any, index: number) => {
          const altPattern = alt?.pattern;
          if (altPattern) {
            patternsOutput.push(`Alt ${index + 1}: /${altPattern}/`);
          }
        });
      }

      // Extract flags
      const flags = data?.flags;
      if (Array.isArray(flags) && flags.length > 0) {
        patternsOutput.push(`Flags: ${flags.join("")}`);
      }

      // Return structured output if we found patterns
      if (patternsOutput.length > 0) {
        return patternsOutput.join("\n");
      }

      // Fallback: try the old structure for backward compatibility
      const regexPatternsTyped = data as Record<string, string>;
      const fallbackPatterns = [
        regexPatternsTyped.titleRegex && `Title: ${regexPatternsTyped.titleRegex}`,
        regexPatternsTyped.contentRegex && `Content: ${regexPatternsTyped.contentRegex}`,
        regexPatternsTyped.negativeTitleRegex &&
          `Negative Title: ${regexPatternsTyped.negativeTitleRegex}`,
        regexPatternsTyped.negativeContentRegex &&
          `Negative Content: ${regexPatternsTyped.negativeContentRegex}`,
      ].filter(Boolean);

      if (fallbackPatterns.length > 0) {
        return fallbackPatterns.join("\n");
      }

      // Final fallback
      return "No regex patterns found in metadata.";
    } catch (_e) {
      return JSON.stringify(regexDataInput, null, 2);
    }
  };

  if (!job) return null;

  // Get job duration if possible, using startTime and endTime if available
  const jobDuration = job.startTime
    ? formatJobDuration(job.startTime, job.endTime, job.status)
    : "N/A";

  // Determine which content to show as the prompt
  const promptContent = job.prompt || "No prompt data available";

  const getResponseContent = () => {
    // For Content View - show EXACTLY what would be copied with the copy button
    if (
      job.taskType === "implementation_plan" &&
      getParsedMetadata(job.metadata)?.showPureContent === true
    ) {
      // Always return the raw response for implementation plans in content view
      // This is EXACTLY what gets copied by the copy button
      return job.response || "No content available yet.";
    }

    // Standard streaming response handling for details view
    if (
      job.taskType === "implementation_plan" &&
      (job.status === "running" || job.status === "processing_stream") &&
      getParsedMetadata(job.metadata)?.isStreaming === true
    ) {
      if (job.response) {
        return job.response;
      } else {
        return "Waiting for implementation plan content to stream...";
      }
    }

    // Standard completed response handling for details view
    if (job.taskType === "implementation_plan" && JOB_STATUSES.COMPLETED.includes(job.status as JobStatus)) {
      if (job.response) {
        return job.response;
      }

      return "Implementation plan job completed, but no content is available.";
    }

    // Handle structured JSON responses for specific task types
    if (JOB_STATUSES.COMPLETED.includes(job.status as JobStatus) && job.response) {
      const structuredJsonTaskTypes = [
        "path_finder", 
        "regex_pattern_generation",
        "regex_summary_generation",
        "guidance_generation"
      ];
      
      if (structuredJsonTaskTypes.includes(job.taskType)) {
        try {
          const parsed = JSON.parse(job.response);
          return JSON.stringify(parsed, null, 2);
        } catch {
          // Not valid JSON, continue with existing logic
        }
      }
    }

    // Enhanced handling for path finder and workflow stage jobs
    if ((job.taskType === "path_finder" || 
         job.taskType === "initial_path_finding" || 
         job.taskType === "extended_path_finding" ||
         job.taskType === "file_finder_workflow") && 
        JOB_STATUSES.COMPLETED.includes(job.status as JobStatus)) {
      
      const parsedMeta = getParsedMetadata(job.metadata);

      // Handle workflow metadata first
      if (parsedMeta?.workflowId) {
        const workflowInfo = `Workflow ID: ${parsedMeta.workflowId}\nStage: ${parsedMeta.workflowStage || job.taskType}`;
        
        if (job.response) {
          // Try to format JSON response nicely for path finder workflow stages
          try {
            const parsed = JSON.parse(job.response);
            if (parsed && (parsed.paths || parsed.count !== undefined)) {
              return `${workflowInfo}\n\nStage Output:\n${JSON.stringify(parsed, null, 2)}`;
            }
          } catch {
            // Not JSON, return as-is
          }
          return `${workflowInfo}\n\nStage Output:\n${job.response}`;
        }
        return `${workflowInfo}\n\nWorkflow stage completed successfully.`;
      }

      // Handle structured pathFinderData from metadata
      if (parsedMeta?.pathFinderData) {
        const pathData = parsedMeta.pathFinderData;
        let displayContent = "";
        
        if (pathData.count !== undefined || pathData.paths?.length) {
          const count = pathData.count || pathData.paths?.length || 0;
          displayContent += `Found ${count} relevant file${count !== 1 ? "s" : ""}`;
          
          if (pathData.searchTerm) {
            displayContent += ` for search term: "${pathData.searchTerm}"`;
          }
          displayContent += "\n\n";
          
          if (pathData.paths && pathData.paths.length > 0) {
            displayContent += pathData.paths.join("\n");
          }
          
          if (pathData.unverifiedPaths && pathData.unverifiedPaths.length > 0) {
            displayContent += "\n\nUnverified paths:\n" + pathData.unverifiedPaths.join("\n");
          }
          
          return displayContent;
        }
      }

      // Handle legacy pathData from metadata
      if (parsedMeta?.pathData && typeof parsedMeta.pathData === 'string') {
        try {
          const pathDataParsed = JSON.parse(parsedMeta.pathData) as { paths?: string[]; allFiles?: string[]; count?: number };
          const pathsArray = pathDataParsed?.allFiles || pathDataParsed?.paths;
          const count = pathDataParsed?.count || pathsArray?.length || 0;
          
          if (Array.isArray(pathsArray) && pathsArray.every(p => typeof p === 'string')) {
            return `Found ${count} relevant file${count !== 1 ? "s" : ""}:\n\n${pathsArray.join("\n")}`;
          }
        } catch (e) {
          console.warn("Failed to parse pathData from metadata for path_finder job:", e);
        }
      }

      // Fallback to job.response, format JSON if possible
      if (job.response) {
        try {
          const parsed = JSON.parse(job.response);
          if (parsed && (parsed.paths || parsed.count !== undefined)) {
            const count = parsed.count || parsed.paths?.length || 0;
            return `Found ${count} relevant file${count !== 1 ? "s" : ""}:\n\n${JSON.stringify(parsed, null, 2)}`;
          }
        } catch {
          // Not JSON, handle as text
          const count = parsedMeta?.pathCount ?? job.response.split('\n').filter(Boolean).length;
          return `Found ${count} relevant file${count !== 1 ? "s" : ""}:\n\n${job.response}`;
        }
      }
      
      return `${job.taskType === "file_finder_workflow" ? "File finder" : "Path finder"} job completed, but no path data found.`;
    }

    // Streaming jobs special handling - for jobs with isStreaming flag
    if ((job.status === "running" || job.status === "processing_stream") && getParsedMetadata(job.metadata)?.isStreaming === true) {
      if (job.response) {
        // For streaming jobs, show the response with a note that it's streaming
        return `${job.response}\n\n[Streaming in progress...]`;
      } else {
        return "Waiting for streaming content to begin...";
      }
    }

    // Handle standard response case with JSON detection
    if (job.response) {
      // Check if response is JSON and format it nicely if so
      if (
        job.response.trim().startsWith("{") ||
        job.response.trim().startsWith("[")
      ) {
        try {
          const parsedResponse = JSON.parse(job.response) as unknown;
          return JSON.stringify(parsedResponse, null, 2);
        } catch (_e) {
          // Not valid JSON, continue to return as-is
        }
      }

      // Not JSON or parsing failed, return as is
      return job.response;
    }

    // Customize the fallback based on job status
    if (JOB_STATUSES.COMPLETED.includes(job.status as JobStatus)) {
      return "Job completed but no response data is available.";
    } else if (job.status === "failed") {
      return (
        job.errorMessage || "Job failed but no error details are available."
      );
    } else if (job.status === "canceled") {
      return job.errorMessage || "Job was canceled by the user.";
    } else if (job.status === "running" || job.status === "processing_stream") {
      return job.statusMessage || "Job is currently processing...";
    } else if (["preparing", "queued", "created", "acknowledged_by_worker", "preparing_input", "generating_stream"].includes(job.status)) {
      return job.statusMessage || "Job is preparing to run...";
    } else if (job.status === "idle") {
      return "Job is waiting to start...";
    } else {
      return "No response data available";
    }
  };

  // Get response content using the helper function
  const responseContent = getResponseContent();

  return (
    <Dialog open={!!job} onOpenChange={(open: boolean) => !open && onClose()}>
      <DialogContent className="max-w-6xl max-h-[90vh] flex flex-col text-foreground !bg-card rounded-xl shadow-lg !backdrop-blur-none">
        <DialogHeader>
          <DialogTitle
            className={`${job.taskType === "implementation_plan" ? "text-xl" : ""} text-foreground`}
          >
            {(() => {
              const parsedMeta = getParsedMetadata(job.metadata);

              // Show workflow context prominently in title
              if (parsedMeta?.workflowId) {
                return (
                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 bg-primary rounded-full"></div>
                      <span>Workflow: {parsedMeta.workflowId}</span>
                    </div>
                    {(job.status === "running" || job.status === "processing_stream") && (
                      <Loader2 className="h-4 w-4 animate-spin text-primary" />
                    )}
                  </div>
                );
              }

              if (
                job.taskType === "implementation_plan" &&
                parsedMeta?.showPureContent === true
              ) {
                return (
                  <div className="flex items-center gap-2">
                    <span>Implementation Plan Content</span>
                    {(job.status === "running" || job.status === "processing_stream") && parsedMeta?.isStreaming && (
                      <Loader2 className="h-4 w-4 animate-spin text-primary" />
                    )}
                  </div>
                );
              } else if (
                job.taskType === "implementation_plan" &&
                parsedMeta?.sessionName
              ) {
                return <>Implementation Plan: {parsedMeta.sessionName}</>;
              } else {
                return <>Job Details</>;
              }
            })()}
          </DialogTitle>
          <DialogDescription className="text-balance text-muted-foreground">
            {(() => {
              const parsedMeta = getParsedMetadata(job.metadata);

              // Show workflow stage in description
              if (parsedMeta?.workflowId && parsedMeta?.workflowStage) {
                return (
                  <div className="flex items-center gap-2">
                    <span>Stage: {parsedMeta.workflowStage}</span>
                    <span className="text-xs bg-primary/10 text-primary px-2 py-1 rounded-full">
                      Job ID: {job.id}
                    </span>
                  </div>
                );
              }

              if (parsedMeta?.showPureContent === true) {
                if ((job.status === "running" || job.status === "processing_stream") && parsedMeta?.isStreaming) {
                  return <>Live updates in progress</>;
                } else {
                  return <>Content View</>;
                }
              } else {
                return <>Details for job ID: {job.id}</>;
              }
            })()}
          </DialogDescription>
        </DialogHeader>
        <div
          className="flex flex-col space-y-4 overflow-y-auto pr-2 mt-4 w-full"
          style={{ maxHeight: "calc(90vh - 150px)" }}
        >
          {/* Main job information cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <JobDetailsStatusSection job={job} />
            <JobDetailsModelConfigSection job={job} />
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <JobDetailsTimingSection job={job} jobDuration={jobDuration} />
            <JobDetailsCostUsageSection job={job} />
          </div>

          <JobDetailsAdditionalInfoSection job={job} />
          
          <JobDetailsErrorSection job={job} />
          
          {/* Workflow Stages Section - show for any job that's part of a workflow */}
          {(() => {
            const parsedMeta = getParsedMetadata(job.metadata);
            return parsedMeta?.workflowId ? <WorkflowStages job={job} /> : null;
          })()}

          {/* Content sections */}
          <div className="space-y-4">
            <JobDetailsSystemPromptSection job={job} />
            <JobDetailsPromptSection promptContent={promptContent} />
            <JobDetailsResponseSection
              job={job}
              responseContent={responseContent}
            />
            <JobDetailsMetadataSection
              job={job}
              formatMetadata={formatMetadata}
              formatRegexPatterns={formatRegexPatterns}
            />
          </div>
        </div>
        <DialogFooter className="mt-6">
          <Button 
            onClick={onClose} 
            variant="outline"
          >
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
