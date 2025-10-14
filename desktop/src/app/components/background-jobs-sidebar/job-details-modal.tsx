import { Loader2 } from "lucide-react";
import { type BackgroundJob } from "@/types/session-types";
import { Button } from "@/ui/button";
import { Card } from "@/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/ui/dialog";
import { getParsedMetadata } from "./utils";
import { useState, useMemo, useCallback, useEffect, lazy, Suspense } from "react";
import { type TaskModelSettings } from "@/types/task-settings-types";
import { getProjectTaskModelSettings } from "@/actions/project-settings.actions";
import { useSessionStateContext } from "@/contexts/session";
import { useLiveDuration } from "@/hooks/use-live-duration";
import { normalizeJobResponse } from '@/utils/response-utils';
import { JobDetailsContextProvider } from "./_contexts/job-details-context";

// Lazy load component sections
const JobDetailsAdditionalInfoSection = lazy(() => 
  import("./_components/job-details/JobDetailsAdditionalInfoSection").then(module => ({ 
    default: module.JobDetailsAdditionalInfoSection 
  }))
);

const JobDetailsErrorSection = lazy(() => 
  import("./_components/job-details/JobDetailsErrorSection").then(module => ({ 
    default: module.JobDetailsErrorSection 
  }))
);

const JobDetailsMetadataSection = lazy(() => 
  import("./_components/job-details/JobDetailsMetadataSection").then(module => ({ 
    default: module.JobDetailsMetadataSection 
  }))
);

const JobDetailsModelConfigSection = lazy(() => 
  import("./_components/job-details/JobDetailsModelConfigSection").then(module => ({ 
    default: module.JobDetailsModelConfigSection 
  }))
);

const JobDetailsPromptSection = lazy(() => 
  import("./_components/job-details/JobDetailsPromptSection").then(module => ({ 
    default: module.JobDetailsPromptSection 
  }))
);

const JobDetailsResponseSection = lazy(() => 
  import("./_components/job-details/JobDetailsResponseSection").then(module => ({ 
    default: module.JobDetailsResponseSection 
  }))
);

const JobDetailsStatusSection = lazy(() => 
  import("./_components/job-details/JobDetailsStatusSection").then(module => ({ 
    default: module.JobDetailsStatusSection 
  }))
);

const JobDetailsTimingSection = lazy(() => 
  import("./_components/job-details/JobDetailsTimingSection").then(module => ({ 
    default: module.JobDetailsTimingSection 
  }))
);

const JobDetailsCostUsageSection = lazy(() => 
  import("./_components/job-details/JobDetailsCostUsageSection").then(module => ({ 
    default: module.JobDetailsCostUsageSection 
  }))
);

const JobDetailsSystemPromptSection = lazy(() => 
  import("./_components/job-details/JobDetailsSystemPromptSection").then(module => ({ 
    default: module.JobDetailsSystemPromptSection 
  }))
);

const JobDetailsVideoSection = lazy(() => 
  import("./_components/job-details/JobDetailsVideoSection").then(module => ({ 
    default: module.JobDetailsVideoSection 
  }))
);

// Loading component for sections
function SectionLoader() {
  return (
    <div className="flex items-center justify-center p-4 min-h-[100px]">
      <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
    </div>
  );
}

interface JobDetailsModalProps {
  job: BackgroundJob | null;
  onClose: () => void;
}


export function JobDetailsModal({ job, onClose }: JobDetailsModalProps) {
  // Handle null job case - don't render modal when no job is selected
  if (!job) {
    return null;
  }

  // File-based content loading has been removed
  // All job output content is now stored directly in the job.response field

  // State for job task settings
  const [jobTaskSettings, setJobTaskSettings] = useState<TaskModelSettings | null>(null);
  
  // Get current session context for project directory
  const { currentSession } = useSessionStateContext();

  // Get live duration that updates every second for running jobs
  const liveDuration = useLiveDuration(job?.startTime, job?.endTime, job?.status || '');

  // Load task settings when job changes
  useEffect(() => {
    const loadTaskSettings = async () => {
      if (!job || !currentSession?.projectDirectory) {
        setJobTaskSettings(null);
        return;
      }

      try {
        const settingsResult = await getProjectTaskModelSettings(currentSession.projectDirectory);
        
        if (settingsResult.isSuccess && settingsResult.data && job.taskType) {
          // Extract settings for specific job taskType
          const toCamelCase = (s: string) => s.replace(/(_\w)/g, m => m[1].toUpperCase());
          let taskKey = toCamelCase(job.taskType) as keyof typeof settingsResult.data;
          
          // For implementation_plan_merge, use implementation_plan settings (especially for copy buttons)
          if (taskKey === 'implementationPlanMerge') {
            taskKey = 'implementationPlan';
          }
          
          const taskSettings = settingsResult.data[taskKey];
          setJobTaskSettings(taskSettings || null);
        } else {
          setJobTaskSettings(null);
        }
      } catch (error) {
        console.error('Failed to load task settings:', error);
        setJobTaskSettings(null);
      }
    };

    loadTaskSettings();
  }, [job, currentSession?.projectDirectory]);


  const displayJob = job;

  // Early return if no job to avoid null checks throughout
  if (!displayJob) return null;

  // Format metadata for display
  const formatMetadata = useCallback((metadata: any): string => {
    if (!metadata) return "No metadata available";
    
    try {
      if (typeof metadata === "string") {
        return JSON.stringify(JSON.parse(metadata), null, 2);
      } else if (typeof metadata === "object") {
        return JSON.stringify(metadata, null, 2);
      } else {
        return String(metadata);
      }
    } catch (e) {
      return typeof metadata === "string" ? metadata : String(metadata);
    }
  }, []);

  // Format structured response data for display based on task type
  const formatStructuredResponse = useCallback((job: BackgroundJob): React.ReactNode | null => {
    if (!job.response) return null;

    try {
      const response = typeof job.response === 'string' ? JSON.parse(job.response) : job.response;

      switch (job.taskType) {
        case 'video_analysis':
          // Let the default response section handle video analysis with copy button
          return null;

        case 'root_folder_selection':
          // Display root directories as a simple list
          if (response.root_directories && Array.isArray(response.root_directories)) {
            return (
              <div className="space-y-1">
                {response.root_directories.map((dir: string, index: number) => (
                  <div key={index} className="text-sm font-mono bg-muted p-2 rounded">
                    {dir}
                  </div>
                ))}
              </div>
            );
          }
          break;

        case 'regex_file_filter':
        case 'file_relevance_assessment':
        case 'extended_path_finder':
          if (response.files && Array.isArray(response.files)) {
            // Check if this is an empty result with a message
            if (response.isEmptyResult && response.message) {
              return (
                <div className="space-y-2">
                  <div className="text-amber-600 dark:text-amber-400 font-medium">
                    No files found
                  </div>
                  <div className="text-sm text-muted-foreground whitespace-pre-wrap">
                    {response.message}
                  </div>
                </div>
              );
            }
            
            // Normal case with files
            return (
              <div className="space-y-2">
                <div className="font-semibold">{response.summary || `${response.count || 0} files found`}</div>
                <div className="max-h-96 overflow-y-auto space-y-1">
                  {response.files.map((file: string, index: number) => (
                    <div key={index} className="text-sm font-mono bg-muted p-2 rounded">
                      {file}
                    </div>
                  ))}
                </div>
              </div>
            );
          }
          break;
          
        case 'web_search_execution': {
          try {
            const data = typeof response === 'string' ? JSON.parse(response) : response;
            if (data.searchResults && Array.isArray(data.searchResults)) {
              return (
                <div className="space-y-4">
                  <div className="text-sm text-muted-foreground mb-2">
                    Found {data.searchResults.length} results
                  </div>
                  {data.searchResults.map((result: any, index: number) => (
                    <Card key={index} className="p-4">
                      <h3 className="font-medium text-lg mb-2">{result.title}</h3>
                      {result.findings && (
                        <div className="prose prose-sm max-w-none">
                          <pre className="whitespace-pre-wrap text-sm">{result.findings}</pre>
                        </div>
                      )}
                    </Card>
                  ))}
                </div>
              );
            }
          } catch (e) {
            console.error('Failed to parse search execution response:', e);
          }
          return <pre className="whitespace-pre-wrap">{response}</pre>;
        }
          
        case 'web_search_prompts_generation': {
          try {
            const data = typeof response === 'string' ? JSON.parse(response) : response;
            if (data.prompts && Array.isArray(data.prompts)) {
              return (
                <div className="space-y-4">
                  <div className="text-sm text-muted-foreground mb-2">
                    Generated {data.prompts.length} research prompts
                  </div>
                  {data.queries && data.queries.length > 0 && (
                    <div className="mb-4">
                      <h4 className="text-sm font-medium mb-2">Search Queries:</h4>
                      <div className="space-y-2">
                        {data.queries.map((query: string, index: number) => (
                          <div key={index} className="p-2 bg-muted rounded-md text-sm">
                            {query}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  <div>
                    <h4 className="text-sm font-medium mb-2">Full Research Prompts:</h4>
                    <div className="space-y-3">
                      {data.prompts.map((prompt: string, index: number) => (
                        <Card key={index} className="p-4">
                          <pre className="whitespace-pre-wrap text-sm">{prompt}</pre>
                        </Card>
                      ))}
                    </div>
                  </div>
                </div>
              );
            }
          } catch (e) {
            console.error('Failed to parse prompts generation response:', e);
          }
          return <pre className="whitespace-pre-wrap">{response}</pre>;
        }
          
        case 'task_refinement':
          if (response.refinedTask) {
            return (
              <div className="space-y-4">
                <div>
                  <div className="font-semibold mb-2">Refined Task:</div>
                  <div className="whitespace-pre-wrap">{response.refinedTask}</div>
                </div>
                {response.analysis && (
                  <div className="text-sm text-muted-foreground">{response.analysis}</div>
                )}
              </div>
            );
          }
          break;
          
        // Add other task types as needed
      }
    } catch (e) {
      // If parsing fails, return null to use default display
    }
    
    return null;
  }, []);

  // Create context value with useMemo (must be called before any conditional returns)
  const contextValue = useMemo(() => {
    if (!displayJob) return null;

    // Use live duration from hook that updates every second for running jobs
    const jobDuration = liveDuration;

    // Calculate derived values for context
    const parsedMetadata = getParsedMetadata(displayJob.metadata);
    const isStreaming = (displayJob.status === "running" || displayJob.status === "processingStream") && parsedMetadata?.taskData?.isStreaming === true;
    const progress = isStreaming && parsedMetadata?.taskData?.streamProgress ? parsedMetadata.taskData.streamProgress : undefined;

    // Determine which content to show as the prompt
    // For merge jobs, check if we have the full prompt content in metadata
    let promptContent = displayJob.prompt || "No prompt data available";
    if (displayJob.taskType === "implementation_plan_merge" && parsedMetadata?.fullPromptContent) {
      promptContent = String(parsedMetadata.fullPromptContent);
    }

    // Extract the appropriate content based on task type
    let responseContent = normalizeJobResponse(displayJob.response).content;
    
    // For video analysis, extract just the analysis text
    if (displayJob.taskType === 'video_analysis' && typeof displayJob.response === 'string') {
      try {
        const videoResponse = JSON.parse(displayJob.response);
        responseContent = videoResponse.analysis || responseContent;
      } catch (e) {
        // Keep the original content if parsing fails
      }
    }

    return {
      job: displayJob,
      parsedMetadata,
      isStreaming,
      progress,
      jobDuration,
      responseContent,
      promptContent,
      formatMetadata,
      formatStructuredResponse,
      copyButtons: jobTaskSettings?.copyButtons || [],
    };
  }, [displayJob, formatMetadata, formatStructuredResponse, jobTaskSettings, liveDuration]);

  if (!contextValue) return null;

  return (
    <Dialog open={!!job} onOpenChange={(open: boolean) => !open && onClose()}>
      <DialogContent className="max-w-6xl h-[95vh] !flex !flex-col !gap-0 text-foreground !bg-background rounded-xl shadow-lg !backdrop-blur-none">
        <DialogHeader>
          <DialogTitle
            className={`${(displayJob?.taskType === "implementation_plan" || displayJob?.taskType === "implementation_plan_merge") ? "text-xl" : ""} text-foreground`}
          >
            {(() => {
              const parsedMeta = contextValue.parsedMetadata;

              if (
                (displayJob?.taskType === "implementation_plan" || displayJob?.taskType === "implementation_plan_merge") &&
                parsedMeta?.taskData?.showPureContent === true
              ) {
                return (
                  <div className="flex items-center gap-2">
                    <span>Implementation Plan Content</span>
                    {(displayJob?.status === "running" || displayJob?.status === "processingStream") && parsedMeta?.taskData?.isStreaming && (
                      <Loader2 className="h-4 w-4 animate-spin text-primary" />
                    )}
                  </div>
                );
              } else if (
                (displayJob?.taskType === "implementation_plan" || displayJob?.taskType === "implementation_plan_merge") &&
                parsedMeta?.taskData?.sessionName
              ) {
                return <>Implementation Plan: {parsedMeta.taskData.sessionName}</>;
              } else {
                return <>Job Details</>;
              }
            })()}
          </DialogTitle>
          <DialogDescription className="text-balance text-muted-foreground">
            {(() => {
              const parsedMeta = contextValue.parsedMetadata;

              if (parsedMeta?.taskData?.showPureContent === true) {
                if ((displayJob?.status === "running" || displayJob?.status === "processingStream") && parsedMeta?.taskData?.isStreaming) {
                  return <>Live updates in progress</>;
                } else {
                  return <>Content View</>;
                }
              } else {
                return <>Details for job ID: {displayJob?.id}</>;
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
              <Suspense fallback={<SectionLoader />}>
                <JobDetailsStatusSection />
              </Suspense>
              <Suspense fallback={<SectionLoader />}>
                <JobDetailsModelConfigSection />
              </Suspense>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Suspense fallback={<SectionLoader />}>
                <JobDetailsTimingSection />
              </Suspense>
              <Suspense fallback={<SectionLoader />}>
                <JobDetailsCostUsageSection />
              </Suspense>
            </div>

            <Suspense fallback={<SectionLoader />}>
              <JobDetailsSystemPromptSection />
            </Suspense>

            <Suspense fallback={<SectionLoader />}>
              <JobDetailsVideoSection />
            </Suspense>

            <Suspense fallback={<SectionLoader />}>
              <JobDetailsAdditionalInfoSection />
            </Suspense>
            
            <Suspense fallback={<SectionLoader />}>
              <JobDetailsErrorSection />
            </Suspense>
            
            {/* Content sections */}
            <div className="space-y-4">
              <Suspense fallback={<SectionLoader />}>
                <JobDetailsPromptSection />
              </Suspense>
              <Suspense fallback={<SectionLoader />}>
                <JobDetailsResponseSection />
              </Suspense>
              <Suspense fallback={<SectionLoader />}>
                <JobDetailsMetadataSection />
              </Suspense>
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
