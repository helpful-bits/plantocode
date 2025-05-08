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
import { formatTimestamp, formatJobDuration } from '@/lib/utils/date-utils';
import { BackgroundJob } from '@/types/session-types';
import { formatTokenCount } from './utils';

interface JobDetailsModalProps {
  job: BackgroundJob | null;
  onClose: () => void;
}

export function JobDetailsModal({ job, onClose }: JobDetailsModalProps) {
  // State for file content loading
  const [fileContent, setFileContent] = useState<string | null>(null);
  const [isLoadingFile, setIsLoadingFile] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);
  
  // Function to load file content for implementation plans
  const loadFileContent = useCallback(async (filePath: string) => {
    setIsLoadingFile(true);
    setFileError(null);
    
    try {
      const response = await fetch(`/api/read-file-content?path=${encodeURIComponent(filePath)}`);
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `Error ${response.status}: Failed to load file content`);
      }
      
      const data = await response.json();
      setFileContent(data.content);
    } catch (error) {
      console.error('Error loading file content:', error);
      setFileError(error instanceof Error ? error.message : 'Failed to load file content');
    } finally {
      setIsLoadingFile(false);
    }
  }, []);
  
  // Load the implementation plan from file when the job is an implementation plan with output file
  useEffect(() => {
    if (job && 
        job.taskType === 'implementation_plan' && 
        job.status === 'completed' && 
        job.outputFilePath) {
      loadFileContent(job.outputFilePath);
    } else {
      // Reset state if not loading from file
      setFileContent(null);
      setFileError(null);
    }
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

  // Get response based on status and available data
  const getResponseContent = () => {
    // Special handling for implementation plans loaded from file
    if (job.taskType === 'implementation_plan' && job.status === 'completed' && job.outputFilePath) {
      if (isLoadingFile) {
        return 'Loading implementation plan from file...';
      }
      
      if (fileError) {
        return `Error loading implementation plan: ${fileError}`;
      }
      
      if (fileContent) {
        return fileContent;
      }
      
      return 'Implementation plan file content will be loaded...';
    }
    
    // Standard handling for other job types
    if (job.response) {
      return job.response;
    }
    
    // Customize the fallback based on job status
    switch (job.status) {
      case 'completed':
        return 'Job completed but no response data is available.';
      case 'failed':
        return job.errorMessage || 'Job failed but no error details are available.';
      case 'canceled':
        return 'Job was canceled by the user.';
      case 'running':
        return 'Job is currently processing...';
      case 'preparing':
      case 'queued':
      case 'created':
        return 'Job is preparing to run...';
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
          <DialogDescription>
            Details for job ID: {job.id}
          </DialogDescription>
        </DialogHeader>
        
        <div className="grid grid-cols-2 gap-3 py-4">
          <div className="col-span-2 md:col-span-1">
            <h4 className="font-semibold mb-1">Status</h4>
            <p className="text-sm">{job.status}</p>
          </div>
          
          <div className="col-span-2 md:col-span-1">
            <h4 className="font-semibold mb-1">API</h4>
            <p className="text-sm">{job.apiType}</p>
          </div>
          
          <div className="col-span-2 md:col-span-1">
            <h4 className="font-semibold mb-1">Task</h4>
            <p className="text-sm">{job.taskType}</p>
          </div>
          
          <div className="col-span-2 md:col-span-1">
            <h4 className="font-semibold mb-1">Model</h4>
            <p className="text-sm">
              {job.modelUsed || 'Not specified'}
              {job.temperature !== undefined && (
                <span className="ml-1 text-xs text-muted-foreground">
                  (temp: {job.temperature})
                </span>
              )}
            </p>
          </div>
          
          {job.maxOutputTokens && (
            <div className="col-span-2 md:col-span-1">
              <h4 className="font-semibold mb-1">Max Output Tokens</h4>
              <p className="text-sm">{job.maxOutputTokens.toLocaleString()}</p>
            </div>
          )}
          
          <div className="col-span-2 md:col-span-1">
            <h4 className="font-semibold mb-1">Created</h4>
            <p className="text-sm">{formatTimestamp(job.createdAt && job.createdAt > 0 ? job.createdAt : Date.now())}</p>
          </div>
          
          <div className="col-span-2 md:col-span-1">
            <h4 className="font-semibold mb-1">Completed</h4>
            <p className="text-sm">{job.endTime && job.endTime > 0 ? formatTimestamp(job.endTime) : 'Not completed'}</p>
          </div>
          
          <div className="col-span-2 md:col-span-1">
            <h4 className="font-semibold mb-1">Duration</h4>
            <p className="text-sm">{jobDuration}</p>
          </div>
          
          <div className="col-span-2 md:col-span-1">
            <h4 className="font-semibold mb-1">Tokens</h4>
            <div className="grid grid-cols-2 gap-2">
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
                </div>
              )}
            </div>
          </div>
          
          {job.outputFilePath && (
            <div className="col-span-2">
              <h4 className="font-semibold mb-1">File Output</h4>
              <p className="text-sm truncate" title={job.outputFilePath || ""}>
                {job.outputFilePath}
              </p>
            </div>
          )}

          {job.statusMessage && (
            <div className="col-span-2">
              <h4 className="font-semibold mb-1">Status Message</h4>
              <p className="text-sm">{job.statusMessage}</p>
            </div>
          )}
        </div>
        
        {job.errorMessage && (
          <div className="mb-4">
            <h4 className="font-semibold mb-1">Error</h4>
            <div className="bg-red-50 text-red-800 p-3 rounded-md text-sm overflow-auto max-h-[150px]">
              <pre className="whitespace-pre-wrap">{job.errorMessage}</pre>
            </div>
          </div>
        )}
        
        <div className="flex flex-col space-y-4 flex-grow overflow-hidden">
          <div className="flex flex-col">
            <h4 className="font-semibold mb-1">Prompt</h4>
            <ScrollArea className="h-[180px] min-h-[180px] border rounded-md p-3 text-sm bg-gray-50">
              <pre className="whitespace-pre-wrap font-mono text-xs">{promptContent}</pre>
            </ScrollArea>
          </div>
          
          <div className="flex flex-col flex-grow">
            <div className="flex justify-between items-center mb-1">
              <h4 className="font-semibold">Response</h4>
              {job.taskType === 'implementation_plan' && job.outputFilePath && (
                <Button 
                  size="sm" 
                  variant="outline" 
                  onClick={() => job.outputFilePath && loadFileContent(job.outputFilePath)}
                  disabled={isLoadingFile}
                >
                  {isLoadingFile ? 'Loading...' : 'Reload'}
                </Button>
              )}
            </div>
            <ScrollArea className="h-[220px] min-h-[180px] flex-grow border rounded-md p-3 text-sm bg-gray-50 overflow-y-auto">
              <pre className="whitespace-pre-wrap font-mono text-xs">
                {responseContent}
              </pre>
            </ScrollArea>
          </div>
          
          {job.metadata && Object.keys(typeof job.metadata === 'object' ? job.metadata : {}).length > 0 && (
            <div className="flex flex-col">
              <h4 className="font-semibold mb-1">Additional Information</h4>
              <ScrollArea className="h-[100px] min-h-[100px] border rounded-md p-3 text-sm bg-gray-50">
                {job.metadata.targetField && (
                  <div className="mb-2">
                    <span className="text-xs font-semibold">Target Field: </span>
                    <span className="text-xs">{job.metadata.targetField}</span>
                  </div>
                )}
                <pre className="whitespace-pre-wrap font-mono text-xs">{formatMetadata(job.metadata)}</pre>
              </ScrollArea>
            </div>
          )}
        </div>
        
        <DialogFooter className="mt-4">
          <Button onClick={onClose}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}