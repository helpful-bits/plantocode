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
import { useState, useMemo, useCallback, useEffect } from "react";
import { type TaskModelSettings } from "@/types/task-settings-types";
import { getProjectTaskModelSettings } from "@/actions/project-settings.actions";
import { useSessionStateContext } from "@/contexts/session";
import { useLiveDuration } from "@/hooks/use-live-duration";
import { normalizeJobResponse } from '@/utils/response-utils';
import { invoke } from '@tauri-apps/api/core';


// Import component sections
import { JobDetailsAdditionalInfoSection } from "./_components/job-details/JobDetailsAdditionalInfoSection";
import { JobDetailsErrorSection } from "./_components/job-details/JobDetailsErrorSection";
import { JobDetailsMetadataSection } from "./_components/job-details/JobDetailsMetadataSection";
import { JobDetailsModelConfigSection } from "./_components/job-details/JobDetailsModelConfigSection";
import { JobDetailsPromptSection } from "./_components/job-details/JobDetailsPromptSection";
import { JobDetailsResponseSection } from "./_components/job-details/JobDetailsResponseSection";
import { JobDetailsStatusSection } from "./_components/job-details/JobDetailsStatusSection";
import { JobDetailsTimingSection } from "./_components/job-details/JobDetailsTimingSection";
import { JobDetailsCostUsageSection } from "./_components/job-details/JobDetailsCostUsageSection";
import { JobDetailsSystemPromptSection } from "./_components/job-details/JobDetailsSystemPromptSection";
import { JobDetailsContextProvider } from "./_contexts/job-details-context";

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
  
  // State for full job details (with prompt, response, etc.)
  const [fullJobDetails, setFullJobDetails] = useState<BackgroundJob | null>(null);
  const [isLoadingFullDetails, setIsLoadingFullDetails] = useState(false);
  
  // Get current session context for project directory
  const { currentSession } = useSessionStateContext();

  // Get live duration that updates every second for running jobs
  const liveDuration = useLiveDuration(job?.startTime, job?.endTime, job?.status || '');
  
  // Fetch full job details when job changes
  useEffect(() => {
    const fetchFullJobDetails = async () => {
      if (!job) {
        setFullJobDetails(null);
        return;
      }
      
      setIsLoadingFullDetails(true);
      try {
        const result = await invoke<BackgroundJob | null>('get_background_job_by_id_command', {
          jobId: job.id
        });
        
        if (result) {
          setFullJobDetails(result);
        } else {
          // Fallback to the provided job if fetch fails
          setFullJobDetails(job);
        }
      } catch (error) {
        console.error('Failed to fetch full job details:', error);
        // Fallback to the provided job if fetch fails
        setFullJobDetails(job);
      } finally {
        setIsLoadingFullDetails(false);
      }
    };
    
    fetchFullJobDetails();
  }, [job?.id]); // Only re-fetch when job ID changes

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
          const taskKey = toCamelCase(job.taskType) as keyof typeof settingsResult.data;
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


  // Use fullJobDetails if available, but merge with the live job prop to get updates
  const displayJob = useMemo(() => {
    if (!fullJobDetails) {
      return job;
    }
    // Merge the live job over the fetched details to ensure updates are reflected
    return { ...fullJobDetails, ...job };
  }, [fullJobDetails, job]);

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
        case 'regex_file_filter':
          // Parse standardized format from backend (files, count, summary)
          if (response.files || response.filteredFiles) {
            const files = response.files || response.filteredFiles;
            const count = response.count || files.length;
            const summary = response.summary;
            
            return (
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <div className="text-sm font-medium">Filtered Files</div>
                  <div className="text-xs text-muted-foreground bg-muted px-2 py-1 rounded">
                    {count} files
                  </div>
                </div>
                
                {summary && (
                  <div className="text-sm text-muted-foreground bg-muted/50 p-2 rounded">
                    {summary}
                  </div>
                )}
                
                <div className="max-h-64 overflow-y-auto">
                  <ul className="space-y-0.5">
                    {files.map((file: string, idx: number) => (
                      <li key={idx} className="text-sm font-mono text-foreground bg-muted/30 px-2 py-1 rounded">
                        {file}
                      </li>
                    ))}
                  </ul>
                </div>
                
                {response.groupResults && Object.keys(response.groupResults).length > 0 && (
                  <div className="mt-4 border-t pt-3">
                    <div className="text-sm font-medium mb-2">Group Results:</div>
                    <div className="space-y-3">
                      {Object.entries(response.groupResults).map(([groupName, files]: [string, any]) => (
                        <div key={groupName} className="border-l-2 border-muted pl-3">
                          <div className="text-sm font-medium text-muted-foreground mb-1">{groupName}:</div>
                          <ul className="space-y-0.5">
                            {(files as string[]).map((file: string, idx: number) => (
                              <li key={idx} className="text-xs font-mono text-foreground bg-muted/20 px-2 py-1 rounded">
                                {file}
                              </li>
                            ))}
                          </ul>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          }
          break;
          
        case 'file_relevance_assessment':
          // Parse standardized format from backend (files, count, summary, metadata)
          if (response.files || response.relevantFiles) {
            const files = response.files || response.relevantFiles;
            const count = response.count || files.length;
            const summary = response.summary;
            const metadata = response.metadata;
            
            return (
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <div className="text-sm font-medium">Relevant Files</div>
                  <div className="text-xs text-muted-foreground bg-muted px-2 py-1 rounded">
                    {count} files
                  </div>
                  {metadata?.tokenCount && (
                    <div className="text-xs text-muted-foreground bg-muted px-2 py-1 rounded">
                      {metadata.tokenCount} tokens
                    </div>
                  )}
                </div>
                
                {summary && (
                  <div className="text-sm text-muted-foreground bg-muted/50 p-2 rounded">
                    {summary}
                  </div>
                )}
                
                <div className="max-h-64 overflow-y-auto">
                  <ul className="space-y-0.5">
                    {files.map((file: string, idx: number) => (
                      <li key={idx} className="text-sm font-mono text-foreground bg-muted/30 px-2 py-1 rounded">
                        {file}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            );
          }
          break;
          
        case 'extended_path_finder':
          // Parse standardized format from backend (files, count, summary, metadata)  
          if (response.files || response.directories) {
            const files = response.files || [];
            const directories = response.directories || [];
            const count = response.count || files.length;
            const summary = response.summary;
            const metadata = response.metadata;
            
            return (
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <div className="text-sm font-medium">Found Paths</div>
                  <div className="text-xs text-muted-foreground bg-muted px-2 py-1 rounded">
                    {count} total
                  </div>
                  {metadata?.verifiedCount !== undefined && (
                    <div className="text-xs text-muted-foreground bg-muted px-2 py-1 rounded">
                      {metadata.verifiedCount} verified
                    </div>
                  )}
                  {metadata?.unverifiedCount !== undefined && (
                    <div className="text-xs text-muted-foreground bg-muted px-2 py-1 rounded">
                      {metadata.unverifiedCount} unverified
                    </div>
                  )}
                </div>
                
                {summary && (
                  <div className="text-sm text-muted-foreground bg-muted/50 p-2 rounded">
                    {summary}
                  </div>
                )}
                
                <div className="max-h-64 overflow-y-auto space-y-3">
                  {directories.length > 0 && (
                    <div>
                      <div className="text-sm font-medium text-muted-foreground mb-2">
                        Directories ({directories.length})
                      </div>
                      <ul className="space-y-0.5">
                        {directories.map((dir: string, idx: number) => (
                          <li key={idx} className="text-sm font-mono text-foreground bg-muted/30 px-2 py-1 rounded">
                            {dir}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  
                  {files.length > 0 && (
                    <div>
                      <div className="text-sm font-medium text-muted-foreground mb-2">
                        Files ({files.length})
                      </div>
                      <ul className="space-y-0.5">
                        {files.map((file: string, idx: number) => (
                          <li key={idx} className="text-sm font-mono text-foreground bg-muted/30 px-2 py-1 rounded">
                            {file}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              </div>
            );
          }
          break;
          
        case 'path_correction':
          // Parse PathCorrectionResponse
          if (response.correctedPaths) {
            return (
              <div className="space-y-2">
                <div className="text-sm font-medium">Corrected Paths ({response.correctedPaths.length}):</div>
                <ul className="list-disc list-inside space-y-1">
                  {response.correctedPaths.map((path: string, idx: number) => (
                    <li key={idx} className="text-sm">{path}</li>
                  ))}
                </ul>
                {response.summary && (
                  <div className="mt-4">
                    <div className="text-sm font-medium">Summary:</div>
                    <p className="text-sm text-muted-foreground">{response.summary}</p>
                  </div>
                )}
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
          // Parse TaskRefinementResponse
          if (response.refinedTask || response.analysis) {
            return (
              <div className="space-y-4">
                {response.analysis && (
                  <div>
                    <div className="text-sm font-medium">Analysis:</div>
                    <p className="text-sm text-muted-foreground">{response.analysis}</p>
                  </div>
                )}
                {response.refinedTask && (
                  <div>
                    <div className="text-sm font-medium">Refined Task:</div>
                    <p className="text-sm">{response.refinedTask}</p>
                  </div>
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

    const responseContent = normalizeJobResponse(displayJob.response).content;

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

  if (!job || !contextValue) return null;

  return (
    <Dialog open={!!job} onOpenChange={(open: boolean) => !open && onClose()}>
      <DialogContent className="max-w-6xl h-[95vh] !flex !flex-col !gap-0 text-foreground !bg-background rounded-xl shadow-lg !backdrop-blur-none">
        <DialogHeader>
          <DialogTitle
            className={`${displayJob.taskType === "implementation_plan" ? "text-xl" : ""} text-foreground`}
          >
            {(() => {
              const parsedMeta = contextValue.parsedMetadata;

              if (
                displayJob.taskType === "implementation_plan" &&
                parsedMeta?.taskData?.showPureContent === true
              ) {
                return (
                  <div className="flex items-center gap-2">
                    <span>Implementation Plan Content</span>
                    {(displayJob.status === "running" || displayJob.status === "processingStream") && parsedMeta?.taskData?.isStreaming && (
                      <Loader2 className="h-4 w-4 animate-spin text-primary" />
                    )}
                  </div>
                );
              } else if (
                displayJob.taskType === "implementation_plan" &&
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
                if ((displayJob.status === "running" || displayJob.status === "processingStream") && parsedMeta?.taskData?.isStreaming) {
                  return <>Live updates in progress</>;
                } else {
                  return <>Content View</>;
                }
              } else {
                return <>Details for job ID: {displayJob.id}</>;
              }
            })()}
          </DialogDescription>
        </DialogHeader>
        {isLoadingFullDetails && (
          <div className="absolute inset-0 bg-background/50 backdrop-blur-sm flex items-center justify-center z-10">
            <div className="flex flex-col items-center gap-2">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <p className="text-sm text-muted-foreground">Loading job details...</p>
            </div>
          </div>
        )}
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

            <JobDetailsSystemPromptSection />

            <JobDetailsAdditionalInfoSection />
            
            <JobDetailsErrorSection />
            
            {/* Content sections */}
            <div className="space-y-4">
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
