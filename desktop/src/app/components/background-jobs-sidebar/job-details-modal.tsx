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
import { useState, useMemo, useCallback } from "react";
import { useNotification } from "@/contexts/notification-context";
import { WorkflowUtils } from "@/utils/workflow-utils";


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
import { JobDetailsContextProvider } from "./_contexts/job-details-context";

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
  const { showError, showSuccess } = useNotification();
  
  // Get workflow state if this is a workflow job
  const { workflowState, error, refreshState } = useExistingWorkflowTracker(
    workflowId || '',
    job.sessionId || '',
    {
      pollInterval: 2000, // Poll every 2 seconds for live updates
    }
  );

  const handleRetryStage = async (stageJobId: string) => {
    if (!workflowId) {
      console.error('Cannot retry stage: workflowId is undefined');
      showError(new Error('Cannot retry stage: Workflow ID is missing'), 'Stage Retry');
      return;
    }
    
    if (!stageJobId) {
      console.error('Cannot retry stage: stageJobId is undefined');
      setRetryingStage(null);
      showError(new Error('Cannot retry stage: Stage job ID is missing'), 'Stage Retry');
      return;
    }
    
    setRetryingStage(stageJobId);
    try {
      const result = await retryWorkflowStageAction(workflowId, stageJobId);
      if (!result.isSuccess) {
        showError(
          result.error || 'Failed to retry workflow stage', 
          'Stage Retry', 
          `Failed to retry stage ${stageJobId}`
        );
      } else {
        showSuccess(
          `Stage retry has been initiated and will appear shortly`, 
          'Stage Retry Started'
        );
        // Force a refresh of workflow state to see the retried stage immediately
        if (refreshState) {
          await refreshState();
        }
      }
    } catch (error) {
      showError(error, 'Stage Retry', `Error retrying stage ${stageJobId}`);
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
      <div className="bg-card border border-border rounded-lg p-4">
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
            const canRetry = stageJob.status === 'failed' && !isRetrying && !!stageJob.jobId;
            
            return (
              <div
                key={stageJob.jobId || stageJob.stage}
                className="border border-border rounded-lg p-3 bg-card"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className={`w-3 h-3 rounded-full ${
                      stageJob.status === 'completed' || stageJob.status === 'completed_by_tag'
                        ? 'bg-green-500'
                        : stageJob.status === 'failed'
                        ? 'bg-red-500'
                        : stageJob.status === 'canceled'
                        ? 'bg-orange-500'
                        : ['running', 'preparing', 'processing_stream', 'acknowledged_by_worker', 'preparing_input', 'generating_stream'].includes(stageJob.status)
                        ? 'bg-blue-500 animate-pulse'
                        : ['idle', 'queued', 'created'].includes(stageJob.status)
                        ? 'bg-gray-400'
                        : 'bg-gray-300'
                    }`} />
                    <div>
                      <div className="font-medium text-sm">
                        {WorkflowUtils.getStageName(stageJob.stage)}
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
                        : stageJob.status === 'canceled'
                        ? 'bg-orange-100 text-orange-800 dark:bg-orange-900/20 dark:text-orange-200'
                        : ['running', 'preparing', 'processing_stream', 'acknowledged_by_worker', 'preparing_input', 'generating_stream'].includes(stageJob.status)
                        ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-200'
                        : ['idle', 'queued', 'created'].includes(stageJob.status)
                        ? 'bg-gray-100 text-gray-600 dark:bg-gray-700/20 dark:text-gray-300'
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
                        title={!stageJob.jobId ? 'Retry unavailable: Stage job ID missing' : 'Retry failed stage'}
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
  const formatMetadata = useCallback((metadata: string | Record<string, unknown> | null | undefined) => {
    try {
      if (!metadata) return "None";

      // Parse metadata string if needed
      const parsedMetadata = getParsedMetadata(metadata);
      if (!parsedMetadata) {
        return typeof metadata === "string" ? metadata : "Invalid metadata";
      }

      // Filter out additionalParams fields that are already shown in the UI
      // Start with additionalParams since most custom metadata is there now
      const additionalParams = parsedMetadata.additionalParams || {};
      const filteredAdditionalParams = { ...additionalParams };
      
      const keysToRemove = [
        "modelUsed",
        "maxOutputTokens",
        "temperature",
        "tokensSent",
        "tokensReceived",
        "tokensTotal",
        "lastUpdateTime", // This is redundant with the updatedAt field
        "outputPath", // This is shown separately in AdditionalInfoSection
        "parsedJsonData", // This is displayed separately in MetadataSection  
        "jsonValid", // This is displayed separately in MetadataSection
        "planData", // This is displayed separately in MetadataSection
        "pathFinderData", // Task-specific data shown in response
        "fileFinderData", // Task-specific data shown in response
        "guidanceData", // Task-specific data shown in response
        "implementationPlanData", // Task-specific data shown in response
        "textImprovementData", // Task-specific data shown in response
        "taskEnhancementData", // Task-specific data shown in response
        "targetField", // This is shown separately in MetadataSection
        // Streaming fields already displayed in progress section
        "isStreaming",
        "streamProgress",
        "lastStreamUpdateTime",
        "streamStartTime",
        "responseLength",
        "estimatedTotalLength",
        "showPureContent",
        // Error handling fields displayed in ErrorSection
        "errorCode",
        "errorType",
        "errorCategory",
      ];

      keysToRemove.forEach((key) => {
        if (key in filteredAdditionalParams) {
          delete filteredAdditionalParams[key];
        }
      });

      // Create final filtered metadata object with core fields and filtered additionalParams
      const filteredMetadata = {
        // Include top-level fields that aren't already shown elsewhere
        ...(parsedMetadata.jobTypeForWorker && { jobTypeForWorker: parsedMetadata.jobTypeForWorker }),
        ...(parsedMetadata.workflowId && { workflowId: parsedMetadata.workflowId }),
        ...(parsedMetadata.workflowStage && { workflowStage: parsedMetadata.workflowStage }),
        // Include filtered additionalParams
        ...filteredAdditionalParams,
      };

      // Format the object for display
      return JSON.stringify(filteredMetadata, null, 2);
    } catch (_e) {
      return "Invalid metadata";
    }
  }, []);

  // Format regex patterns for display
  // The parsedJsonDataInput parameter contains parsedJsonData from RegexPatternGenerationProcessor
  const formatRegexPatterns = useCallback((parsedJsonDataInput: string | Record<string, unknown> | null | undefined): string | null => {
    if (!parsedJsonDataInput) return null;

    try {
      let data: Record<string, any>; // Use 'any' for flexible field access

      // If parsedJsonData is already an object (parsed by backend), use it directly
      if (typeof parsedJsonDataInput === "string") {
        try {
          data = JSON.parse(parsedJsonDataInput) as Record<string, any>;
        } catch (_e) {
          return "Regex data not available or not valid JSON.";
        }
      } else if (parsedJsonDataInput && typeof parsedJsonDataInput === "object") {
        // parsedJsonData is already a parsed object from the backend
        data = parsedJsonDataInput as Record<string, any>;
      } else {
        return "Regex data not available or not valid JSON.";
      }

      const patternsOutput: string[] = [];

      // Expected structure from RegexPatternGenerationProcessor:
      // { primaryPattern: { pattern: "...", flags: ["g", "i"] }, alternativePatterns: [...], flags: [...] }
      // Or fallback structure: { titleRegex: "...", contentRegex: "..." }
      
      // Directly access fields on 'data' which is the parsed JSON payload
      const primaryPattern = data?.primaryPattern?.pattern;
      if (primaryPattern && typeof primaryPattern === 'string') {
        const primaryFlags = data?.primaryPattern?.flags;
        const flagsStr = Array.isArray(primaryFlags) && primaryFlags.length > 0 ? primaryFlags.join("") : "";
        patternsOutput.push(`Primary: /${primaryPattern}/${flagsStr}`);
      }

      const alternatives = data?.alternativePatterns;
      if (Array.isArray(alternatives)) {
        alternatives.forEach((alt: any, index: number) => {
          const altPattern = alt?.pattern;
          if (altPattern && typeof altPattern === 'string') {
            const altFlags = alt?.flags;
            const flagsStr = Array.isArray(altFlags) && altFlags.length > 0 ? altFlags.join("") : "";
            patternsOutput.push(`Alt ${index + 1}: /${altPattern}/${flagsStr}`);
          }
        });
      }

      // Global flags at the top level
      const globalFlags = data?.flags;
      if (Array.isArray(globalFlags) && globalFlags.length > 0) {
        patternsOutput.push(`Global Flags: ${globalFlags.join("")}`);
      }

      if (patternsOutput.length > 0) {
        return patternsOutput.join("\n");
      }

      // Fallback for old structure (titleRegex, contentRegex, etc.)
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

      return "No displayable regex patterns found.";
    } catch (e) {
      console.error("Error formatting regex patterns:", e);
      return "Regex data not available or not valid JSON.";
    }
  }, []);

  // Create context value with useMemo (must be called before any conditional returns)
  const contextValue = useMemo(() => {
    if (!job) return null;

    // Get job duration if possible, using startTime and endTime if available
    const jobDuration = job.startTime
      ? formatJobDuration(job.startTime, job.endTime, job.status)
      : "N/A";

    // Determine which content to show as the prompt
    const promptContent = job.prompt || "No prompt data available";

    // Helper function to format JSON responses consistently
    const formatJsonResponse = (jsonString: string): string => {
      try {
        const parsed = JSON.parse(jsonString);
        return JSON.stringify(parsed, null, 2);
      } catch {
        return jsonString; // Return as-is if not valid JSON
      }
    };

    // Helper function to check if response should be treated as structured data
    const hasStructuredResponse = (taskType: string): boolean => {
      const structuredTaskTypes = [
        // Path-related tasks
        "path_finder", "initial_path_finding", "extended_path_finding", "extended_path_finder",
        "local_file_filtering", "path_correction", "extended_path_correction", "initial_path_correction",
        "file_finder_workflow",
        // Other structured JSON tasks
        "regex_pattern_generation", "regex_summary_generation", "guidance_generation",
        "task_enhancement", "text_improvement", "text_correction"
      ];
      return structuredTaskTypes.includes(taskType);
    };

    const getResponseContent = () => {
      const parsedMeta = getParsedMetadata(job.metadata);
      
      // For implementation_plan with showPureContent === true (raw XML content for copying)
      if (
        job.taskType === "implementation_plan" &&
        parsedMeta?.additionalParams?.showPureContent === true
      ) {
        return job.response || "No content available yet.";
      }

      // For implementation_plan streaming
      if (
        job.taskType === "implementation_plan" &&
        (job.status === "running" || job.status === "processing_stream")
      ) {
        return job.response || "Waiting for implementation plan content to stream...";
      }

      // Handle job response content
      if (job.response) {
        // For workflow stage jobs, always attempt to format JSON if possible
        if (parsedMeta?.workflowId) {
          const workflowInfo = `Workflow ID: ${parsedMeta.workflowId}\nStage: ${parsedMeta.workflowStage || job.taskType}`;
          
          // Try to pretty-print JSON for workflow stage outputs
          let formattedResponse: string;
          try {
            const parsed = JSON.parse(job.response);
            formattedResponse = JSON.stringify(parsed, null, 2);
          } catch {
            // If JSON parsing fails, display the raw string
            formattedResponse = job.response;
          }
          
          return `${workflowInfo}\n\nStage Output:\n${formattedResponse}`;
        }
        
        // For structured tasks, format as JSON
        if (hasStructuredResponse(job.taskType)) {
          return formatJsonResponse(job.response);
        }
        
        // For any response that appears to be JSON, attempt to pretty-print
        if (
          job.response.trim().startsWith("{") ||
          job.response.trim().startsWith("[")
        ) {
          try {
            const parsed = JSON.parse(job.response);
            return JSON.stringify(parsed, null, 2);
          } catch {
            // If JSON parsing fails, display as plain text
            return job.response;
          }
        }

        // For streaming jobs, add streaming indicator
        if ((job.status === "running" || job.status === "processing_stream") && parsedMeta?.additionalParams?.isStreaming === true) {
          return `${job.response}\n\n[Streaming in progress...]`;
        }

        // Return job.response as-is for plain text responses
        return job.response;
      }

      // Fallback messages based on job status when no response is available
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

    // Calculate derived values for context
    const parsedMetadata = getParsedMetadata(job.metadata);
    const isStreaming = (job.status === "running" || job.status === "processing_stream") && parsedMetadata?.additionalParams?.isStreaming === true;
    const progress = isStreaming && parsedMetadata?.additionalParams?.streamProgress ? parsedMetadata.additionalParams.streamProgress : undefined;

    return {
      job,
      parsedMetadata,
      isStreaming,
      progress,
      jobDuration,
      responseContent,
      promptContent,
      formatMetadata,
      formatRegexPatterns,
    };
  }, [job, formatMetadata, formatRegexPatterns]);

  if (!job || !contextValue) return null;

  return (
    <Dialog open={!!job} onOpenChange={(open: boolean) => !open && onClose()}>
      <DialogContent className="max-w-6xl max-h-[90vh] !flex !flex-col !gap-0 text-foreground !bg-card rounded-xl shadow-lg !backdrop-blur-none">
        <DialogHeader>
          <DialogTitle
            className={`${job.taskType === "implementation_plan" ? "text-xl" : ""} text-foreground`}
          >
            {(() => {
              const parsedMeta = contextValue.parsedMetadata;

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
                parsedMeta?.additionalParams?.showPureContent === true
              ) {
                return (
                  <div className="flex items-center gap-2">
                    <span>Implementation Plan Content</span>
                    {(job.status === "running" || job.status === "processing_stream") && parsedMeta?.additionalParams?.isStreaming && (
                      <Loader2 className="h-4 w-4 animate-spin text-primary" />
                    )}
                  </div>
                );
              } else if (
                job.taskType === "implementation_plan" &&
                parsedMeta?.additionalParams?.sessionName
              ) {
                return <>Implementation Plan: {parsedMeta.additionalParams.sessionName}</>;
              } else {
                return <>Job Details</>;
              }
            })()}
          </DialogTitle>
          <DialogDescription className="text-balance text-muted-foreground">
            {(() => {
              const parsedMeta = contextValue.parsedMetadata;

              // Show workflow stage in description
              if (parsedMeta?.workflowId && parsedMeta?.workflowStage) {
                // Format stage name to be more human-readable (e.g., "DirectoryTreeGeneration" -> "Directory Tree Generation")
                const formattedStageName = parsedMeta.workflowStage
                  .replace(/([A-Z])/g, ' $1')
                  .trim()
                  .replace(/^./, str => str.toUpperCase());
                
                return (
                  <div className="flex items-center gap-2">
                    <span>Stage: {formattedStageName}</span>
                    <span className="text-xs bg-primary/10 text-primary px-2 py-1 rounded-full">
                      Job ID: {job.id}
                    </span>
                  </div>
                );
              }

              if (parsedMeta?.additionalParams?.showPureContent === true) {
                if ((job.status === "running" || job.status === "processing_stream") && parsedMeta?.additionalParams?.isStreaming) {
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
        <JobDetailsContextProvider value={contextValue}>
          <div
            className="flex-1 flex flex-col space-y-4 overflow-y-auto pr-2 mt-4 w-full min-h-0"
            style={{ maxHeight: "calc(90vh - 150px)" }}
          >
            {/* Main job information cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <JobDetailsStatusSection />
              <JobDetailsModelConfigSection />
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <JobDetailsTimingSection />
              <JobDetailsCostUsageSection />
            </div>

            <JobDetailsAdditionalInfoSection />
            
            <JobDetailsErrorSection />
            
            {/* Workflow Stages Section - show for any job that's part of a workflow */}
            {(() => {
              const parsedMeta = contextValue.parsedMetadata;
              return parsedMeta?.workflowId ? <WorkflowStages job={job} /> : null;
            })()}

            {/* Content sections */}
            <div className="space-y-4">
              <JobDetailsSystemPromptSection />
              <JobDetailsPromptSection />
              <JobDetailsResponseSection />
              <JobDetailsMetadataSection />
            </div>
          </div>
        </JobDetailsContextProvider>
        <DialogFooter className="mt-6 flex-shrink-0">
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
