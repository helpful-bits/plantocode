import React from 'react';
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
  if (!job) return null;
  
  // Format JSON data for display
  const formatMetadata = (metadata: any) => {
    try {
      if (!metadata) return 'None';
      if (typeof metadata === 'string') {
        try {
          metadata = JSON.parse(metadata);
        } catch (e) {
          return metadata;
        }
      }
      return JSON.stringify(metadata, null, 2);
    } catch (e) {
      return 'Invalid metadata';
    }
  };
  
  // Get job duration if possible, using startTime and endTime if available
  const jobDuration = job.startTime ? formatJobDuration(
    job.startTime, 
    job.endTime, 
    job.status
  ) : 'N/A';

  // Determine which content to show as the prompt - prioritize prompt field
  const promptContent = job.prompt || job.rawInput || 'No prompt data available';

  // Get response based on status and available data
  // For completed jobs, expect a response
  // For failed jobs, expect an error message
  // For other statuses, show a status-appropriate message
  const getResponseContent = () => {
    // If we have a response, use it
    if (job.response) {
      return job.response;
    }
    
    // For backward compatibility, check modelOutput as well
    if (job.modelOutput) {
      return job.modelOutput;
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
            <p className="text-sm">{job.modelUsed || 'Not specified'}</p>
          </div>
          
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
            <p className="text-sm">
              Input: ~{formatTokenCount(job.tokensSent)} / Output: ~{formatTokenCount(job.tokensReceived)}
            </p>
          </div>
          
          {job.xmlPath && (
            <div className="col-span-2">
              <h4 className="font-semibold mb-1">File Output</h4>
              <p className="text-sm truncate" title={job.xmlPath}>
                {job.xmlPath}
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
            <ScrollArea className="h-[120px] min-h-[120px] border rounded-md p-3 text-sm bg-gray-50">
              <pre className="whitespace-pre-wrap font-mono text-xs">{promptContent}</pre>
            </ScrollArea>
          </div>
          
          <div className="flex flex-col flex-grow">
            <h4 className="font-semibold mb-1">Response</h4>
            <ScrollArea className="h-[220px] min-h-[180px] flex-grow border rounded-md p-3 text-sm bg-gray-50 overflow-y-auto">
              <pre className="whitespace-pre-wrap font-mono text-xs">
                {responseContent}
              </pre>
            </ScrollArea>
          </div>
          
          {job.metadata && Object.keys(typeof job.metadata === 'object' ? job.metadata : {}).length > 0 && (
            <div className="flex flex-col">
              <h4 className="font-semibold mb-1">Metadata</h4>
              <ScrollArea className="h-[100px] min-h-[100px] border rounded-md p-3 text-sm bg-gray-50">
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