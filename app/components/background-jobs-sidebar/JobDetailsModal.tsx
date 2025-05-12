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
import { ScrollArea } from '@/components/ui/scroll-area';
import { Progress } from '@/components/ui/progress';
import { formatTimestamp, formatJobDuration } from '@/lib/utils/date-utils';
import { BackgroundJob } from '@/types/session-types';
import { formatTokenCount } from './utils';
import { Loader2, AlertCircle, RefreshCw, FileCode } from 'lucide-react';

interface JobDetailsModalProps {
  job: BackgroundJob | null;
  onClose: () => void;
}

export function JobDetailsModal({ job, onClose }: JobDetailsModalProps) {
  // State for file content loading
  const [fileContent, setFileContent] = useState<string | null>(null);
  const [isLoadingFile, setIsLoadingFile] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);
  
  // Enhanced function to load file content with better error handling and retry logic
  const loadFileContent = useCallback(async (filePath: string) => {
    if (!filePath) {
      setFileError("Missing file path");
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
      const apiUrl = `/api/read-file-content?path=${encodeURIComponent(filePath)}`;
      console.log(`[JobDetailsModal] Loading file content from: ${filePath}`);

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

  // Enhanced file loading logic with better error handling and automatic retry
  useEffect(() => {
    // Only load if job exists, modal is open, and the file should be loaded
    if (job &&
        job.status === 'completed' &&
        job.outputFilePath) {

      // Implementation plans always load from file
      const shouldLoadFile = job.taskType === 'implementation_plan';

      // For other job types, check if they have an output file that needs loading
      const hasOutputFileReference = job.response &&
                                    job.response.includes('Content stored in file') &&
                                    job.outputFilePath;

      if (shouldLoadFile || hasOutputFileReference) {
        console.log(`[JobDetailsModal] Auto-loading file content from: ${job.outputFilePath}`);

        // Load file content with retry mechanism
        const loadWithRetry = async () => {
          try {
            await loadFileContent(job.outputFilePath!);
          } catch (error) {
            console.error('[JobDetailsModal] Initial file load failed, retrying once:', error);

            // Add a small delay before retry
            setTimeout(async () => {
              try {
                await loadFileContent(job.outputFilePath!);
              } catch (retryError) {
                console.error('[JobDetailsModal] Retry file load also failed:', retryError);
                // Don't attempt further retries automatically - user can click reload
              }
            }, 1000);
          }
        };

        loadWithRetry();

        // Return cleanup function to cancel any in-progress loads when the modal closes
        return () => {
          setIsLoadingFile(false);
          console.log('[JobDetailsModal] Cleaning up file loading on unmount');
        };
      }
    }

    // Reset state if not loading from file
    setFileContent(null);
    setFileError(null);

  }, [job, loadFileContent]);
  
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
        'outputFilePath' // This is shown separately in the UI
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
  
  if (!job) return null;

  // Get job duration if possible, using startTime and endTime if available
  const jobDuration = job.startTime ? formatJobDuration(
    job.startTime, 
    job.endTime, 
    job.status
  ) : 'N/A';

  // Determine which content to show as the prompt
  const promptContent = job.prompt || 'No prompt data available';

  // Enhanced function to get response content with better handling of special cases
  const getResponseContent = () => {
    // Implementation plans handling - prioritize file content
    if (job.taskType === 'implementation_plan' && job.status === 'completed') {
      // If we have the file content loaded, prioritize showing it
      if (fileContent) {
        return fileContent;
      }

      // If we're loading the file, show loading indicator
      if (isLoadingFile) {
        return 'Loading implementation plan from file...';
      }

      // If there was an error loading the file, show error with details
      if (fileError) {
        return `Error loading implementation plan: ${fileError}\n\nYou can try clicking the Reload button.`;
      }

      // If we have an output file path but no content loaded yet
      if (job.outputFilePath) {
        // Check if response contains the "Content stored in file" message
        if (job.response && job.response.includes("Content stored in file")) {
          return 'Loading plan content from file...';
        }

        // If we have a outputFilePath but no file loading has started, prompt the user
        return `Implementation plan is stored in file: ${job.outputFilePath}\n\nFile content will be loaded automatically.`;
      }

      // Fallback for implementation plans without file path but with response content
      if (job.response && job.response.trim() !== '') {
        return job.response;
      }

      return 'Implementation plan job completed, but no content is available. This may indicate the file is missing or was moved.';
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
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>Job Details</DialogTitle>
          <DialogDescription className="text-balance">
            Details for job ID: {job.id}
          </DialogDescription>
        </DialogHeader>
        
        <div className="grid grid-cols-2 gap-4 py-4">
          <div className="col-span-2 md:col-span-1">
            <h4 className="font-semibold mb-1.5">Status</h4>
            <p className="text-sm">{job.status}</p>
          </div>
          
          <div className="col-span-2 md:col-span-1">
            <h4 className="font-semibold mb-1.5">API</h4>
            <p className="text-sm">{job.apiType}</p>
          </div>
          
          <div className="col-span-2 md:col-span-1">
            <h4 className="font-semibold mb-1.5">Task</h4>
            <p className="text-sm">{job.taskType}</p>
          </div>
          
          <div className="col-span-2 md:col-span-1">
            <h4 className="font-semibold mb-1.5">Model</h4>
            <p className="text-sm">
              {job.modelUsed || 'Not specified'}
              {job.temperature !== undefined && (
                <span className="ml-1.5 text-xs text-muted-foreground">
                  (temp: {job.temperature})
                </span>
              )}
            </p>
          </div>
          
          {job.maxOutputTokens && (
            <div className="col-span-2 md:col-span-1">
              <h4 className="font-semibold mb-1.5">Max Output Tokens</h4>
              <p className="text-sm">{job.maxOutputTokens.toLocaleString()}</p>
            </div>
          )}
          
          <div className="col-span-2 md:col-span-1">
            <h4 className="font-semibold mb-1.5">Created</h4>
            <p className="text-sm">{formatTimestamp(job.createdAt && job.createdAt > 0 ? job.createdAt : Date.now())}</p>
          </div>
          
          <div className="col-span-2 md:col-span-1">
            <h4 className="font-semibold mb-1.5">Completed</h4>
            <p className="text-sm">{job.endTime && job.endTime > 0 ? formatTimestamp(job.endTime) : 'Not completed'}</p>
          </div>
          
          <div className="col-span-2 md:col-span-1">
            <h4 className="font-semibold mb-1.5">Duration</h4>
            <p className="text-sm">{jobDuration}</p>
            {job.status === 'running' && job.startTime && (
              <div className="mt-2">
                <Progress
                  value={
                    // Calculate progress for long-running jobs, more granular for streaming jobs
                    job.metadata?.isStreaming
                      ? job.metadata.responseLength && job.metadata.estimatedTotalLength
                        ? Math.min((job.metadata.responseLength / job.metadata.estimatedTotalLength) * 100, 98)
                        : job.metadata.streamProgress || Math.min(Math.floor((Date.now() - job.startTime) / 200), 95)
                      : Math.min(Math.floor((Date.now() - job.startTime) / 300), 90)
                  }
                  className="h-1 w-full animate-pulse"
                />
                <p className="text-xs text-muted-foreground mt-1">Running...</p>
              </div>
            )}
          </div>

          <div className="col-span-2 md:col-span-1">
            <h4 className="font-semibold mb-1.5">Tokens</h4>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <span className="text-xs text-muted-foreground">Input:</span>
                <p className="text-sm font-mono">{job.tokensSent?.toLocaleString() || 0}</p>
              </div>
              <div>
                <span className="text-xs text-muted-foreground">Output:</span>
                <p className="text-sm font-mono">{job.tokensReceived?.toLocaleString() || 0}</p>
              </div>
              {(job.tokensSent || job.tokensReceived) && (
                <div className="col-span-2">
                  <span className="text-xs text-muted-foreground">Total:</span>
                  <p className="text-sm font-mono">
                    {((job.tokensSent || 0) + (job.tokensReceived || 0)).toLocaleString()} tokens
                  </p>
                  {job.status === 'running' && job.metadata?.maxOutputTokens && job.tokensReceived && (
                    <div className="mt-1 w-full">
                      <Progress
                        value={Math.min((job.tokensReceived / job.metadata.maxOutputTokens) * 100, 100)}
                        className="h-1"
                      />
                      <p className="text-xs text-muted-foreground mt-1">
                        {job.tokensReceived} / {job.metadata.maxOutputTokens} output tokens
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
          
          {job.outputFilePath && (
            <div className="col-span-2">
              <h4 className="font-semibold mb-1.5">File Output</h4>
              <p className="text-sm truncate text-balance" title={job.outputFilePath || ""}>
                {job.outputFilePath}
              </p>
            </div>
          )}

          {job.statusMessage && (
            <div className="col-span-2">
              <h4 className="font-semibold mb-1.5">Status Message</h4>
              <p className="text-sm text-balance">{job.statusMessage}</p>
            </div>
          )}
        </div>
        
        {job.errorMessage && (
          <div className="mb-6">
            <h4 className="font-semibold mb-2">Error</h4>
            <div className="bg-red-50 text-red-800 p-4 rounded-md text-sm overflow-auto max-h-[150px]">
              <pre className="whitespace-pre-wrap text-balance">{job.errorMessage}</pre>
            </div>
          </div>
        )}
        
        <div className="flex flex-col space-y-6 flex-grow overflow-hidden">
          <div className="flex flex-col">
            <h4 className="font-semibold mb-2">Prompt</h4>
            <ScrollArea className="h-[180px] min-h-[180px] border rounded-md p-4 text-sm bg-gray-50">
              <pre className="whitespace-pre-wrap font-mono text-xs text-balance">{promptContent}</pre>
            </ScrollArea>
          </div>
          
          <div className="flex flex-col flex-grow">
            <div className="flex justify-between items-center mb-2">
              <h4 className="font-semibold">Response</h4>
              {job.taskType === 'implementation_plan' && job.outputFilePath && (
                <Button
                  size="sm"
                  variant={fileError ? "destructive" : "outline"}
                  onClick={() => job.outputFilePath && loadFileContent(job.outputFilePath)}
                  isLoading={isLoadingFile}
                  loadingText="Loading..."
                  className="h-9 min-w-[100px]"
                >
                  {fileError ? (
                    <span className="flex items-center"><AlertCircle className="h-4 w-4 mr-2" />Retry</span>
                  ) : (
                    <span className="flex items-center"><RefreshCw className="h-4 w-4 mr-2" />Reload</span>
                  )}
                </Button>
              )}
            </div>

            <ScrollArea className="h-[220px] min-h-[180px] flex-grow border rounded-md p-4 text-sm bg-gray-50 overflow-y-auto">
              {/* Show an error message if file loading failed */}
              {fileError && job.taskType === 'implementation_plan' && job.outputFilePath && (
                <div className="bg-red-50 text-red-800 p-3 rounded-md mb-3 text-xs">
                  <div className="flex items-start gap-2">
                    <AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="font-medium">Error loading file</p>
                      <p className="mt-1">{fileError}</p>
                      <p className="mt-2 text-xs text-gray-600">Click &quot;Retry&quot; to attempt loading the file again.</p>
                    </div>
                  </div>
                </div>
              )}

              {/* Show progress bar for streaming jobs */}
              {job.status === 'running' && job.metadata?.isStreaming && (
                <div className="mb-3">
                  <Progress
                    value={
                      job.metadata.responseLength && job.metadata.estimatedTotalLength
                        ? Math.min((job.metadata.responseLength / job.metadata.estimatedTotalLength) * 100, 97)
                        : Math.min(Math.floor((Date.now() - (job.startTime || Date.now())) / 150), 90)
                    }
                    className="h-1 mb-2"
                  />
                  <div className="flex justify-between items-center text-xs text-muted-foreground">
                    <span>Streaming in progress...</span>
                    {job.metadata.responseLength && (
                      <span>{Math.floor(job.metadata.responseLength / 1024)} KB received</span>
                    )}
                  </div>
                </div>
              )}

              {/* Display with improved formatting for file references */}
              {responseContent && responseContent.includes('file:') && job.outputFilePath ? (
                <div className="space-y-3">
                  {/* When we have both content and file reference, display content first */}
                  <pre className="whitespace-pre-wrap font-mono text-xs text-balance">
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
                <pre className="whitespace-pre-wrap font-mono text-xs text-balance">
                  {responseContent}
                </pre>
              )}
            </ScrollArea>
          </div>
          
          {job.metadata && Object.keys(typeof job.metadata === 'object' ? job.metadata : {}).length > 0 && (
            <div className="flex flex-col">
              <h4 className="font-semibold mb-2">Additional Information</h4>
              <ScrollArea className="h-[100px] min-h-[100px] border rounded-md p-4 text-sm bg-gray-50">
                {job.metadata.targetField && (
                  <div className="mb-3">
                    <span className="text-xs font-semibold">Target Field: </span>
                    <span className="text-xs">{job.metadata.targetField}</span>
                  </div>
                )}
                <pre className="whitespace-pre-wrap font-mono text-xs text-balance">{formatMetadata(job.metadata)}</pre>
              </ScrollArea>
            </div>
          )}
        </div>
        
        <DialogFooter className="mt-6">
          <Button onClick={onClose} size="sm" variant="outline" className="h-9">Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}