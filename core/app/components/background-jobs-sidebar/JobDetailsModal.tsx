import React, { useState, useEffect, useCallback } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { formatTimestamp, formatJobDuration } from '@/lib/utils/date-utils';
import { BackgroundJob } from '@/types/session-types';
import { formatTokenCount } from './utils';
import { Loader2, AlertCircle, RefreshCw, FileCode, ClipboardCopy } from 'lucide-react';
import { toast } from '@/components/ui/use-toast';
import { useProject } from '@/lib/contexts/project-context';

interface JobDetailsModalProps {
  job: BackgroundJob | null;
  onClose: () => void;
}

export function JobDetailsModal({ job, onClose }: JobDetailsModalProps) {
  // State for file content loading
  const [fileContent, setFileContent] = useState<string | null>(null);
  const [isLoadingFile, setIsLoadingFile] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);
  const { projectDirectory } = useProject();
  
  // Enhanced function to load file content with better error handling and retry logic
  const loadFileContent = useCallback(async (filePath: string) => {
    if (!filePath) {
      setFileError("Missing file path");
      return;
    }

    if (!projectDirectory) {
      setFileError("Project directory not configured");
      return;
    }

    setIsLoadingFile(true);
    setFileError(null);

    // Create an AbortController to manage timeouts
    const controller = new AbortController();
    const signal = controller.signal;

    // Set a timeout of 10 seconds
    const timeoutId = setTimeout(() => controller.abort(), 10000);

    try {
      // Make the file path relative to the project directory if it's absolute
      const relativePath = filePath.startsWith(projectDirectory)
        ? filePath.substring(projectDirectory.length).replace(/^\/+/, '') // Remove leading slashes
        : filePath;
        
      const apiUrl = `/api/read-file-content?path=${encodeURIComponent(relativePath)}&projectDirectory=${encodeURIComponent(projectDirectory)}`;
      console.log(`[JobDetailsModal] Loading file content from: ${relativePath} (using project dir: ${projectDirectory})`);

      // First attempt with abort signal
      let response = await fetch(apiUrl, {
        method: 'GET',
        headers: {
          'Cache-Control': 'no-cache', // Prevent browser caching
        },
        signal: signal
      });

      // Retry once if first attempt fails
      if (!response.ok) {
        console.warn(`[JobDetailsModal] First attempt to load file failed (${response.status}), retrying...`);

        // Short delay before retry
        await new Promise(resolve => setTimeout(resolve, 500));

        // Second attempt
        response = await fetch(apiUrl, {
          method: 'GET',
          headers: {
            'Cache-Control': 'no-cache', // Prevent browser caching
            'X-Retry': 'true' // Marker for retry attempt
          },
          signal: signal
        });
      }

      // Handle errors
      if (!response.ok) {
        // Try to parse error data
        let errorMessage;
        try {
          const errorData = await response.json();
          errorMessage = errorData.error || `HTTP Error ${response.status}: ${response.statusText}`;
        } catch (e) {
          // If can't parse JSON, use status
          errorMessage = `HTTP Error ${response.status}: ${response.statusText}`;
        }

        throw new Error(errorMessage);
      }

      // Parse and store content
      const data = await response.json();

      if (!data.content && data.content !== '') {
        throw new Error("Received empty response from server");
      }

      console.log(`[JobDetailsModal] Successfully loaded ${filePath} (${data.content.length} chars)`);
      setFileContent(data.content);
    } catch (error) {
      console.error('[JobDetailsModal] Error loading file content:', error);

      // Check if this was an abort error
      if (error instanceof Error && error.name === 'AbortError') {
        setFileError('Request timed out. The file may be too large or the server is busy.');
      } else {
        setFileError(error instanceof Error ? error.message : 'Failed to load file content');
      }

      setFileContent(null);
    } finally {
      // Clear the timeout
      clearTimeout(timeoutId);
      setIsLoadingFile(false);
    }
  }, []);

  useEffect(() => {
    if (job &&
        job.status === 'completed' &&
        job.outputFilePath) {

      if (job.taskType === 'implementation_plan') {
        return;
      }

      const hasOutputFileReference = job.response &&
                                    job.response.includes('Content stored in file') &&
                                    job.outputFilePath;

      if (hasOutputFileReference) {
        console.log(`[JobDetailsModal] Auto-loading file content from: ${job.outputFilePath}`);

        const loadWithRetry = async () => {
          try {
            await loadFileContent(job.outputFilePath!);
          } catch (error) {
            console.error('[JobDetailsModal] Initial file load failed, retrying once:', error);

            setTimeout(async () => {
              try {
                await loadFileContent(job.outputFilePath!);
              } catch (retryError) {
                console.error('[JobDetailsModal] Retry file load also failed:', retryError);
              }
            }, 1000);
          }
        };

        loadWithRetry();

        return () => {
          setIsLoadingFile(false);
          console.log('[JobDetailsModal] Cleaning up file loading on unmount');
        };
      }
    }

    setFileContent(null);
    setFileError(null);

  }, [job, loadFileContent, projectDirectory]);
  
  // Format JSON data for display
  const formatMetadata = (metadata: any) => {
    try {
      if (!metadata) return 'None';

      // If it's a string, try to parse it as JSON
      if (typeof metadata === 'string') {
        try {
          metadata = JSON.parse(metadata);
        } catch (e) {
          return metadata;
        }
      }

      // Filter out keys that are already shown in the UI
      // or don't provide useful information
      const filteredMetadata = {...metadata};
      const keysToRemove = [
        'modelUsed', 'maxOutputTokens', 'temperature',
        'tokensSent', 'tokensReceived', 'tokensTotal',
        'lastUpdateTime', // This is redundant with the updatedAt field
        'outputFilePath', // This is shown separately in the UI
        'regexPatterns' // This will be displayed separately if present
      ];

      keysToRemove.forEach(key => {
        if (key in filteredMetadata) {
          delete filteredMetadata[key];
        }
      });

      // Format the object for display
      return JSON.stringify(filteredMetadata, null, 2);
    } catch (e) {
      return 'Invalid metadata';
    }
  };

  // Format regex patterns for display
  const formatRegexPatterns = (regexPatterns: any) => {
    if (!regexPatterns) return null;

    try {
      // If it's a string, try to parse it as JSON
      if (typeof regexPatterns === 'string') {
        try {
          regexPatterns = JSON.parse(regexPatterns);
        } catch (e) {
          return regexPatterns;
        }
      }

      // Create a nicely formatted section for regex patterns
      const patterns = [
        regexPatterns.titleRegex && `Title: ${regexPatterns.titleRegex}`,
        regexPatterns.contentRegex && `Content: ${regexPatterns.contentRegex}`,
        regexPatterns.negativeTitleRegex && `Negative Title: ${regexPatterns.negativeTitleRegex}`,
        regexPatterns.negativeContentRegex && `Negative Content: ${regexPatterns.negativeContentRegex}`
      ].filter(Boolean);

      return patterns.join('\n');
    } catch (e) {
      return JSON.stringify(regexPatterns, null, 2);
    }
  };
  
  if (!job) return null;

  // Get job duration if possible, using startTime and endTime if available
  const jobDuration = job.startTime ? formatJobDuration(
    job.startTime, 
    job.endTime, 
    job.status
  ) : 'N/A';

  // Determine which content to show as the prompt
  const promptContent = job.prompt || 'No prompt data available';

  const getResponseContent = () => {
    if (job.taskType === 'implementation_plan' && job.status === 'running' && job.metadata?.isStreaming === true) {
      if (job.response) {
        return `${job.response}\n\n[Streaming implementation plan content...]`;
      } else {
        return 'Waiting for implementation plan content to stream...';
      }
    }
    
    if (job.taskType === 'implementation_plan' && job.status === 'completed') {
      if (job.response) {
        return job.response;
      }
      
      return 'Implementation plan job completed, but no content is available.';
    }

    // Path finder job handling - improved structured data display
    if (job.taskType === 'pathfinder' && job.status === 'completed') {
      // Try to get structured data from metadata first (prioritize this for better formatting)
      if (job.metadata?.pathData) {
        try {
          // Parse the JSON stored in metadata
          const pathData = JSON.parse(job.metadata.pathData);

          // Display paths in a formatted way with count
          if (Array.isArray(pathData.paths)) {
            const pathCount = pathData.paths.length;
            return `Found ${pathCount} relevant file${pathCount !== 1 ? 's' : ''}:\n\n${pathData.paths.join('\n')}`;
          }

          // If nested under 'result' or other field
          if (pathData.result && Array.isArray(pathData.result.paths)) {
            const pathCount = pathData.result.paths.length;
            return `Found ${pathCount} relevant file${pathCount !== 1 ? 's' : ''}:\n\n${pathData.result.paths.join('\n')}`;
          }
        } catch (e) {
          console.warn('Could not parse pathData from metadata:', e);
          // Fall back to response string below
        }
      }

      // If metadata parsing failed, but we have path count, use that with response
      if (job.metadata?.pathCount && job.response) {
        const count = job.metadata.pathCount;
        return `Found ${count} relevant file${count !== 1 ? 's' : ''}:\n\n${job.response}`;
      }
    }

    // Streaming jobs special handling - for jobs with isStreaming flag
    if (job.status === 'running' && job.metadata?.isStreaming === true) {
      if (job.response) {
        // For streaming jobs, show the response with a note that it's streaming
        return `${job.response}\n\n[Streaming in progress...]`;
      } else {
        return 'Waiting for streaming content to begin...';
      }
    }

    // Handle standard response case with JSON detection
    if (job.response) {
      // Check if response is JSON and format it nicely if so
      if (job.response.trim().startsWith('{') || job.response.trim().startsWith('[')) {
        try {
          const parsedResponse = JSON.parse(job.response);
          return JSON.stringify(parsedResponse, null, 2);
        } catch (e) {
          // Not valid JSON, continue to return as-is
        }
      }

      // Not JSON or parsing failed, return as is
      return job.response;
    }

    // Customize the fallback based on job status
    switch (job.status) {
      case 'completed':
        return 'Job completed but no response data is available.';
      case 'failed':
        return job.errorMessage || 'Job failed but no error details are available.';
      case 'canceled':
        return job.errorMessage || 'Job was canceled by the user.';
      case 'running':
        return job.statusMessage || 'Job is currently processing...';
      case 'preparing':
      case 'queued':
      case 'created':
      case 'acknowledged_by_worker':
        return job.statusMessage || 'Job is preparing to run...';
      case 'idle':
        return 'Job is waiting to start...';
      default:
        return 'No response data available';
    }
  };
  
  // Get response content using the helper function
  const responseContent = getResponseContent();

  return (
    <Dialog open={!!job} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-6xl max-h-[90vh] flex flex-col p-6">
        <DialogHeader>
          <DialogTitle>
            {job.taskType === 'implementation_plan' && job.metadata?.sessionName ? (
              <>Implementation Plan: {job.metadata.sessionName}</>
            ) : (
              <>Job Details</>
            )}
          </DialogTitle>
          <DialogDescription className="text-balance">
            Details for job ID: {job.id}
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col space-y-6 overflow-y-auto pr-2 mt-4 w-full" style={{ maxHeight: 'calc(90vh - 150px)' }}>

            <div className="grid grid-cols-1 gap-4 py-4">
              {/* Job Status Section */}
              <div className="col-span-1">
                <div className="p-4 bg-gray-50 dark:bg-muted/10 rounded-md mb-2">
                  <h4 className="font-semibold mb-2 text-xs text-muted-foreground uppercase">Job Status</h4>
                  <div className="grid grid-cols-5 gap-6">
                    <div>
                      <h5 className="text-xs text-muted-foreground mb-1">Status</h5>
                      <p className="text-sm font-medium">{job.status}</p>
                    </div>
                    <div>
                      <h5 className="text-xs text-muted-foreground mb-1">API</h5>
                      <p className="text-sm font-medium">{job.apiType}</p>
                    </div>
                    <div>
                      <h5 className="text-xs text-muted-foreground mb-1">Task</h5>
                      <p className="text-sm font-medium">{job.taskType}</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Model Configuration Section */}
              <div className="col-span-1">
                <div className="p-4 bg-gray-50 dark:bg-muted/10 rounded-md mb-2">
                  <h4 className="font-semibold mb-2 text-xs text-muted-foreground uppercase">Model Configuration</h4>
                  <div className="grid grid-cols-5 gap-6">
                    <div>
                      <h5 className="text-xs text-muted-foreground mb-1">Model</h5>
                      <p className="text-sm font-medium">{job.modelUsed || job.metadata?.modelUsed || 'Default'}</p>
                    </div>
                    <div>
                      <h5 className="text-xs text-muted-foreground mb-1">Temperature</h5>
                      <p className="text-sm font-medium">{job.temperature !== undefined ? job.temperature : 'Default'}</p>
                    </div>
                    <div>
                      <h5 className="text-xs text-muted-foreground mb-1">Max Output Tokens</h5>
                      <p className="text-sm font-medium">{job.maxOutputTokens ? job.maxOutputTokens.toLocaleString() : 'Default'}</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Timing Information Section */}
              <div className="col-span-1">
                <div className="p-4 bg-gray-50 dark:bg-muted/10 rounded-md mb-2">
                  <h4 className="font-semibold mb-2 text-xs text-muted-foreground uppercase">Timing</h4>
                  <div className="grid grid-cols-5 gap-6">
                    <div>
                      <h5 className="text-xs text-muted-foreground mb-1">Created</h5>
                      <p className="text-sm font-medium">{formatTimestamp(job.createdAt && job.createdAt > 0 ? job.createdAt : Date.now())}</p>
                    </div>
                    <div>
                      <h5 className="text-xs text-muted-foreground mb-1">Completed</h5>
                      <p className="text-sm font-medium">{job.endTime && job.endTime > 0 ? formatTimestamp(job.endTime) : 'Not completed'}</p>
                    </div>
                    <div>
                      <h5 className="text-xs text-muted-foreground mb-1">Duration</h5>
                      <p className="text-sm font-medium">{jobDuration}</p>
                      {job.status === 'running' && job.startTime && (
                        <div className="mt-2">
                          <Progress
                            value={
                              // Calculate progress with improved handling for implementation plans
                              job.taskType === 'implementation_plan' && job.metadata?.isStreaming === true
                                ? // For implementation plans with streaming
                                  typeof job.metadata.streamProgress === 'number'
                                    ? Math.min(job.metadata.streamProgress, 98)
                                    : typeof job.metadata.responseLength === 'number' && 
                                      typeof job.metadata.estimatedTotalLength === 'number' && 
                                      job.metadata.estimatedTotalLength > 0
                                      ? Math.min((job.metadata.responseLength / job.metadata.estimatedTotalLength) * 100, 98)
                                      : Math.min(Math.floor((Date.now() - job.startTime) / 200), 95)
                                // For other streaming jobs
                                : job.metadata?.isStreaming
                                  ? job.metadata.responseLength && job.metadata.estimatedTotalLength
                                    ? Math.min((job.metadata.responseLength / job.metadata.estimatedTotalLength) * 100, 98)
                                    : job.metadata.streamProgress || Math.min(Math.floor((Date.now() - job.startTime) / 200), 95)
                                  : Math.min(Math.floor((Date.now() - job.startTime) / 300), 90)
                            }
                            className="h-1 w-full animate-pulse"
                          />
                          <p className="text-xs text-muted-foreground mt-1">Running...</p>
                          {typeof job.metadata?.streamProgress === 'number' && (
                            <p className="text-[10px] text-muted-foreground mt-0.5 text-right">
                              {Math.floor(job.metadata.streamProgress)}%
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              <div className="col-span-1">
                <div className="p-4 bg-gray-50 dark:bg-muted/10 rounded-md mb-2">
                  <h4 className="font-semibold mb-2 text-xs text-muted-foreground uppercase">Token Usage</h4>
                  <div className="grid grid-cols-5 gap-6">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <div className="w-2 h-2 rounded-full bg-blue-500"></div>
                        <h5 className="text-xs text-muted-foreground">Input</h5>
                      </div>
                      <p className="text-sm font-mono font-medium">{job.tokensSent?.toLocaleString() || 0}</p>
                    </div>
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <div className="w-2 h-2 rounded-full bg-green-500"></div>
                        <h5 className="text-xs text-muted-foreground">Output</h5>
                      </div>
                      <p className="text-sm font-mono font-medium">{job.tokensReceived?.toLocaleString() || 0}</p>
                    </div>
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <div className="w-2 h-2 rounded-full bg-purple-500"></div>
                        <h5 className="text-xs text-muted-foreground">Total</h5>
                      </div>
                      <p className="text-sm font-mono font-medium">
                        {((job.tokensSent || 0) + (job.tokensReceived || 0)).toLocaleString()}
                      </p>
                    </div>
                  </div>

                  {job.status === 'running' && job.metadata?.maxOutputTokens && job.tokensReceived && (
                    <div className="mt-3">
                      <div className="flex justify-between items-center text-xs text-muted-foreground mb-1">
                        <span>Output Tokens Used</span>
                        <span>{job.tokensReceived} / {job.metadata.maxOutputTokens}</span>
                      </div>
                      <Progress
                        value={Math.min((job.tokensReceived / job.metadata.maxOutputTokens) * 100, 100)}
                        className="h-1"
                      />
                    </div>
                  )}
                </div>
              </div>

              {(job.outputFilePath || job.statusMessage) && (
                <div className="col-span-1">
                  <div className="p-4 bg-gray-50 dark:bg-muted/10 rounded-md mb-2">
                    <h4 className="font-semibold mb-3 text-xs text-muted-foreground uppercase">Additional Information</h4>

                    {job.outputFilePath && (
                      <div className="mb-3">
                        <h5 className="text-xs text-muted-foreground mb-1">File Output</h5>
                        <div className="flex items-center gap-2">
                          <FileCode className="h-4 w-4 text-muted-foreground" />
                          <p className="text-sm font-medium truncate text-balance" title={job.outputFilePath || ""}>
                            {job.outputFilePath}
                          </p>
                        </div>
                      </div>
                    )}

                    {job.statusMessage && (
                      <div>
                        <h5 className="text-xs text-muted-foreground mb-1">Status Message</h5>
                        <div className="text-sm font-medium text-balance max-h-[100px] overflow-auto">
                          {job.statusMessage}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            {job.errorMessage && (
              <div className="mb-6">
                <div className="p-5 bg-red-50 dark:bg-destructive/10 rounded-md mb-2">
                  <h4 className="font-semibold mb-3 text-xs text-red-800 dark:text-red-400 uppercase flex items-center gap-2">
                    <AlertCircle className="h-4 w-4" />
                    Error Information
                  </h4>
                  <pre className="whitespace-pre-wrap text-balance text-sm text-red-800 dark:text-red-400 w-full">{job.errorMessage}</pre>
                </div>
              </div>
            )}

            <div className="flex flex-col space-y-6 w-full">
              <div className="p-5 bg-gray-50 dark:bg-muted/10 rounded-md">
                <h4 className="font-semibold mb-3 text-xs text-muted-foreground uppercase">Prompt</h4>
                <pre className="whitespace-pre-wrap font-mono text-xs text-balance w-full">{promptContent}</pre>
              </div>

              <div className="p-5 bg-gray-50 dark:bg-muted/10 rounded-md">
                <div className="flex justify-between items-center mb-2">
                  <h4 className="font-semibold text-xs text-muted-foreground uppercase">Response</h4>
                  {job.taskType === 'implementation_plan' && job.response && (
                    <Button 
                      size="sm" 
                      variant="outline" 
                      className="text-xs h-7 px-2 py-1 flex items-center gap-1"
                      onClick={() => {
                        navigator.clipboard.writeText(job.response || "");
                        toast({
                          title: "Copied to clipboard",
                          description: "Implementation plan content copied to clipboard",
                          duration: 2000
                        });
                      }}
                    >
                      <ClipboardCopy className="h-3 w-3 mr-1" />
                      Copy content
                    </Button>
                  )}
                </div>

                {/* Show progress bar for streaming jobs */}
                {job.status === 'running' && job.metadata?.isStreaming && (
                  <div className="mb-3">
                    <Progress
                      value={
                        // Calculate progress with improved handling for implementation plans
                        job.taskType === 'implementation_plan'
                          ? typeof job.metadata.streamProgress === 'number'
                            ? Math.min(job.metadata.streamProgress, 97)
                            : typeof job.metadata.responseLength === 'number' && 
                              typeof job.metadata.estimatedTotalLength === 'number' && 
                              job.metadata.estimatedTotalLength > 0
                              ? Math.min((job.metadata.responseLength / job.metadata.estimatedTotalLength) * 100, 97)
                              : Math.min(Math.floor((Date.now() - (job.startTime || Date.now())) / 150), 90)
                          : job.metadata.responseLength && job.metadata.estimatedTotalLength
                            ? Math.min((job.metadata.responseLength / job.metadata.estimatedTotalLength) * 100, 97)
                            : Math.min(Math.floor((Date.now() - (job.startTime || Date.now())) / 150), 90)
                      }
                      className="h-1 mb-2"
                    />
                    <div className="flex justify-between items-center text-xs text-muted-foreground">
                      <span>Streaming in progress...</span>
                      <div className="flex items-center gap-2">
                        {job.metadata.responseLength && (
                          <span>{Math.floor(job.metadata.responseLength / 1024)} KB received</span>
                        )}
                        {typeof job.metadata.streamProgress === 'number' && (
                          <span>{Math.floor(job.metadata.streamProgress)}% complete</span>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {/* Display with improved formatting for file references */}
                {responseContent && responseContent.includes('file:') && job.outputFilePath ? (
                  <div className="space-y-3">
                    {/* When we have both content and file reference, display content first */}
                    <pre className="whitespace-pre-wrap font-mono text-xs text-balance w-full">
                      {/* Display content part before the file reference */}
                      {responseContent.split(/file:.*$/m)[0].trim()}
                    </pre>

                    {/* Show file reference separately with better styling */}
                    <div className="mt-3 p-3 border rounded-md bg-muted/20 text-xs flex flex-col gap-2">
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <FileCode className="h-4 w-4" />
                        <span>Complete content available in file:</span>
                      </div>
                      <code className="text-xs bg-muted/30 p-1 rounded font-mono">
                        {job.outputFilePath}
                      </code>
                    </div>
                  </div>
                ) : (
                  <pre className={`whitespace-pre-wrap font-mono text-balance w-full ${job.taskType === 'implementation_plan' ? 'text-xs p-4 bg-muted/20 rounded-md' : 'text-xs'}`}>
                    {responseContent}
                  </pre>
                )}
              </div>

              {job.metadata && Object.keys(typeof job.metadata === 'object' ? job.metadata : {}).length > 0 && (
                <div className="p-5 bg-gray-50 dark:bg-muted/10 rounded-md">
                  <h4 className="font-semibold mb-3 text-xs text-muted-foreground uppercase">Metadata</h4>
                  {job.metadata.targetField && (
                    <div className="mb-3">
                      <h5 className="text-xs text-muted-foreground mb-1">Target Field</h5>
                      <p className="text-sm font-medium">{job.metadata.targetField}</p>
                    </div>
                  )}

                  {/* Display regex patterns separately if they exist */}
                  {job.metadata.regexPatterns && (
                    <div className="mb-3">
                      <h5 className="text-xs text-muted-foreground mb-1">Regex Patterns</h5>
                      <pre className="whitespace-pre-wrap font-mono text-xs text-balance w-full p-2 bg-muted/20 rounded-md">
                        {formatRegexPatterns(job.metadata.regexPatterns)}
                      </pre>
                    </div>
                  )}

                  {/* Other metadata */}
                  <pre className="whitespace-pre-wrap font-mono text-xs text-balance w-full">{formatMetadata(job.metadata)}</pre>
                </div>
              )}
            </div>
        </div>
        <DialogFooter className="mt-4">
          <Button onClick={onClose} size="sm" variant="outline" className="h-9">Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}