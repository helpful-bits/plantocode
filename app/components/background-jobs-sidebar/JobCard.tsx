import React, { useEffect } from 'react';
import { BackgroundJob, ApiType, TaskType, JOB_STATUSES } from '@/types/session-types';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import {
  CheckCircle,
  AlertCircle,
  Clock,
  XCircle,
  Loader2,
  X,
  FileCode,
  ExternalLink
} from 'lucide-react';
import { 
  getStatusIconName,
  getStatusIconClass,
  getApiTypeBadgeClasses,
  formatApiType,
  formatTaskType, 
  formatTimeAgo,
  formatTokenCount
} from './utils';

export interface JobCardProps {
  job: BackgroundJob;
  handleCancel: (id: string) => Promise<void>;
  isCancelling: Record<string, boolean>;
  onSelect: (job: BackgroundJob) => void;
}

export const JobCard = React.memo(({ 
  job, 
  handleCancel, 
  isCancelling, 
  onSelect
}: JobCardProps) => {
  // For debugging - enable to log all rerenders of JobCard
  const DEBUG_JOBCARD = false;
  
  // Add logging for tracking JobCard re-renders
  useEffect(() => {
    if (DEBUG_JOBCARD) {
      console.debug(`JobCard [${job.id}] rendering, status=${job.status}, response=${Boolean(job.response)}, error=${Boolean(job.errorMessage)}`);
    }
  }, [job.id, job.status, job.response, job.errorMessage, DEBUG_JOBCARD]);
  
  // Choose best timestamp for display
  // Priority: startTime > lastUpdate > createdAt
  const displayTime = job.startTime || job.lastUpdate || job.createdAt;
  
  // Format relative time with fallback for invalid date
  const timeAgo = (displayTime && displayTime > 0) 
    ? formatTimeAgo(displayTime) 
    : 'Unknown time';

  // Determine if job can be canceled (only active/non-terminal jobs)
  const canCancel = JOB_STATUSES.ACTIVE.includes(job.status);

  // Format response text for preview with special handling for implementation plans
  const getResponsePreview = () => {
    // Special handling for implementation plans with output file path
    if (job.taskType === 'implementation_plan' && job.status === 'completed' && job.outputFilePath) {
      return `Implementation plan saved to file: ${job.outputFilePath.split('/').pop()}`;
    }

    // For all other cases, show the first 100 chars of response
    if (job.response) {
      return job.response.substring(0, 100) + (job.response.length > 100 ? '...' : '');
    }
    return '';
  };
  
  // Format error text for preview
  const getErrorPreview = () => {
    if (!job.errorMessage) return '';
    return job.errorMessage.substring(0, 100) + (job.errorMessage.length > 100 ? '...' : '');
  };
  
  // Render the appropriate status icon
  const renderStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <CheckCircle className={getStatusIconClass(status)} />;
      case 'failed':
        return <AlertCircle className={getStatusIconClass(status)} />;
      case 'running':
        return <Loader2 className={getStatusIconClass(status)} />;
      case 'canceled':
        return <XCircle className={getStatusIconClass(status)} />;
      case 'preparing':
      case 'created':
      case 'queued':
      case 'idle':
        return <Clock className={getStatusIconClass(status)} />;
      default:
        return <Clock className={getStatusIconClass(status)} />;
    }
  };
  
  // Get user-friendly status display
  const getStatusDisplay = () => {
    // Use constants for all status checks
    if (job.status === 'running') {
      return 'Processing';
    } else if (job.status === 'preparing' || job.status === 'created' || job.status === 'queued') {
      return 'Preparing';
    } else if (JOB_STATUSES.COMPLETED.includes(job.status)) {
      return 'Completed';
    } else if (job.status === 'failed') {
      return 'Failed';
    } else if (job.status === 'canceled') {
      return 'Canceled';
    } else {
      // Capitalize the first letter for any other status
      return job.status.charAt(0).toUpperCase() + job.status.slice(1);
    }
  };
  
  // Render card content
  return (
    <div
      className="border bg-card p-3 rounded-md text-xs cursor-pointer hover:bg-accent/10 transition-colors"
      style={{
        height: '160px', // Fixed height for better layout stability
        overflow: 'hidden'
      }}
      onClick={() => onSelect(job)}
      data-testid={`job-card-${job.id}`}
      data-status={job.status}
    >
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2 font-medium">
          <span className="w-4 h-4 inline-flex items-center justify-center">
            {renderStatusIcon(job.status)}
          </span>
          <span>
            {getStatusDisplay()}
          </span>
        </div>
        
        <div className="w-6 h-6">
          {canCancel && (
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              onClick={(e) => {
                e.stopPropagation(); // Prevent triggering the card's onClick
                handleCancel(job.id);
              }}
              isLoading={isCancelling[job.id]}
              loadingIcon={<Loader2 className="h-3 w-3 animate-spin" />}
              aria-label="Cancel job"
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      </div>
      
      <div className="flex gap-2 mb-2 min-h-[20px]">
        {job.apiType && (
          <Badge className={getApiTypeBadgeClasses(job.apiType)}>
            {formatApiType(job.apiType)}
          </Badge>
        )}
        {job.taskType && (
          <Badge variant="outline" className="text-[10px] flex items-center gap-1.5">
            {job.taskType === 'implementation_plan' && job.outputFilePath && (
              <FileCode className="h-3.5 w-3.5" />
            )}
            {formatTaskType(job.taskType)}
          </Badge>
        )}
      </div>
      
      <div className="text-muted-foreground text-[10px] mt-2">
        {timeAgo}
      </div>

      {/* Progress bar for running jobs */}
      {job.status === 'running' && (
        <div className="mt-2 mb-1">
          <Progress
            value={
              // Calculate progress with improved handling for different scenarios
              job.metadata?.isStreaming
                ? (job.metadata.responseLength && job.metadata.estimatedTotalLength)
                  // If we have a good estimate based on content length
                  ? Math.min((job.metadata.responseLength / job.metadata.estimatedTotalLength) * 100, 98)
                  // If we have a stream progress value directly
                  : job.metadata.streamProgress
                    ? Math.min(job.metadata.streamProgress, 95)
                    // Fallback based on elapsed time
                    : Math.min(Math.floor((Date.now() - (job.startTime || Date.now())) / 150), 95)
                // Non-streaming job - base on elapsed time with a slower progression
                : Math.min(Math.floor((Date.now() - (job.startTime || Date.now())) / 250), 90)
            }
            className="h-0.5"
          />
          {job.metadata?.streamProgress && (
            <p className="text-[9px] text-muted-foreground mt-0.5 text-right">
              {Math.floor(job.metadata.streamProgress)}%
            </p>
          )}
        </div>
      )}

      {/* Token count and model display */}
      <div className="text-muted-foreground text-[10px] mt-2 flex items-center justify-between min-h-[24px]">
        <div className="flex flex-col gap-0.5">
          {/* Display token counts with better formatting */}
        {(job.tokensSent > 0 || job.tokensReceived > 0 || job.totalTokens > 0) ? (
            <span className="flex items-center gap-1.5">
              <span className="text-[9px] text-muted-foreground">Tokens:</span>
              <span className="font-mono">{formatTokenCount(job.tokensSent)}</span>
              <span className="text-[9px]">→</span>
              <span className="font-mono">{formatTokenCount(job.tokensReceived)}</span>
              {job.totalTokens > 0 && job.totalTokens !== (job.tokensSent + job.tokensReceived) && (
                <span className="font-mono text-[9px] ml-1">({formatTokenCount(job.totalTokens)} total)</span>
              )}
            </span>
          ) : (
            <span className="h-3"></span> /* Empty placeholder to maintain height */
          )}
          {job.modelUsed ? (
            <span className="text-[9px] text-gray-500 truncate max-w-[180px]" title={job.modelUsed}>
              {job.modelUsed.includes("gemini")
                ? job.modelUsed.replace("gemini-", "Gemini ")
                : job.modelUsed.includes("claude")
                  ? job.modelUsed.replace(/-\d{8}$/, "")
                  : job.modelUsed}
            </span>
          ) : (
            <span className="h-3"></span> /* Empty placeholder to maintain height */
          )}
        </div>

        {/* Show duration for completed jobs or empty placeholder */}
        {job.endTime && job.startTime ? (
          <span className="text-[9px] text-gray-500">
            {Math.round((job.endTime - job.startTime) / 1000)}s
          </span>
        ) : (
          <span className="h-3"></span> /* Empty placeholder to maintain height */
        )}
      </div>

      {/* Info section container with fixed height for stability */}
      <div className="min-h-[42px] max-h-[42px] overflow-hidden">
        {/* For implementation plans or any job with output file path, show a special indicator */}
        {job.status === 'completed' && job.outputFilePath && (
          <div className="text-[10px] mt-2 border-t pt-2 flex items-center gap-1.5 text-muted-foreground">
            <FileCode className="h-3.5 w-3.5 text-primary" />
            <span className="font-medium">
              {job.taskType === 'implementation_plan'
                ? "Implementation plan saved to file"
                : "Output saved to file"}
            </span>
          </div>
        )}

        {/* For path finder jobs, show path count from metadata if available */}
        {job.taskType === 'pathfinder' && job.status === 'completed' && job.metadata?.pathCount && (
          <div className="text-[10px] mt-2 border-t pt-2 flex items-center gap-1.5 text-muted-foreground">
            <span className="font-medium">Found {job.metadata.pathCount} relevant file{job.metadata.pathCount !== 1 ? 's' : ''}</span>
          </div>
        )}

        {/* For regular jobs or those without special indicators, show response preview */}
        {job.response &&
         !(job.status === 'completed' && job.outputFilePath) &&
         !(job.taskType === 'pathfinder' && job.status === 'completed' && job.metadata?.pathCount) && (
          <div className="text-[10px] mt-2 border-t pt-2 text-muted-foreground line-clamp-2 overflow-hidden break-words text-balance">
            {getResponsePreview()}
          </div>
        )}

        {/* Show error message if job failed or canceled */}
        {(job.status === 'failed' || job.status === 'canceled') && job.errorMessage && (
          <div className="text-[10px] mt-2 border-t pt-2 text-red-500 line-clamp-2 overflow-hidden break-words text-balance">
            {getErrorPreview()}
          </div>
        )}

        {/* Empty placeholder element when no special content is present, to maintain consistent height */}
        {!(job.status === 'completed' && job.outputFilePath) &&
         !(job.taskType === 'pathfinder' && job.status === 'completed' && job.metadata?.pathCount) &&
         !job.response &&
         !(job.status === 'failed' || job.status === 'canceled') && (
          <div className="h-[42px]"></div>
        )}
      </div>
    </div>
  );
});

// Add displayName for better debugging
JobCard.displayName = 'JobCard';