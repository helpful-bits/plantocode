"use client";

import React, { useState, useRef, useMemo, memo, useEffect, useCallback } from 'react';
import { useBackgroundJobs } from '@/lib/contexts/background-jobs-context';
import { BackgroundJob, ApiType, TaskType, JOB_STATUSES } from '@/types/session-types';
import { formatDistanceToNow } from 'date-fns';
import { AlertCircle, CheckCircle, Clock, RefreshCw, X, Trash2, XCircle, Loader2, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Badge } from '@/components/ui/badge';
import { JobDetailsModal } from './JobDetailsModal';

// Memoized job card to prevent unnecessary re-renders
const JobCard = memo(({ 
  job, 
  handleCancel, 
  isCancelling, 
  getStatusIcon, 
  getApiTypeBadge, 
  formatTaskType, 
  formatTimeAgo,
  onSelect
}: { 
  job: BackgroundJob, 
  handleCancel: (id: string) => Promise<void>,
  isCancelling: Record<string, boolean>,
  getStatusIcon: (status: string) => React.ReactNode,
  getApiTypeBadge: (apiType: ApiType) => React.ReactNode,
  formatTaskType: (taskType: TaskType) => string,
  formatTimeAgo: (timestamp: number) => string,
  onSelect: (job: BackgroundJob) => void
}) => {
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

  // Format response text for preview
  const getResponsePreview = () => {
    if (job.response) {
      return job.response.substring(0, 100) + (job.response.length > 100 ? '...' : '');
    } else if (job.modelOutput) {
      return job.modelOutput.substring(0, 100) + (job.modelOutput.length > 100 ? '...' : '');
    }
    return '';
  };
  
  // Format error text for preview
  const getErrorPreview = () => {
    if (!job.errorMessage) return '';
    return job.errorMessage.substring(0, 100) + (job.errorMessage.length > 100 ? '...' : '');
  };
  
  // Get formatted token counts
  const formatTokenCount = (count?: number) => {
    if (!count) return '0';
    return count >= 1000 ? `${(count / 1000).toFixed(1)}K` : count.toString();
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
  
  // Render card content each time job changes
  return (
    <div 
      className="border bg-card p-2 rounded-md text-xs cursor-pointer" 
      style={{ minHeight: '70px', height: 'auto', maxHeight: '160px', overflow: 'hidden' }}
      onClick={() => onSelect(job)}
      data-testid={`job-card-${job.id}`}
      data-status={job.status}
    >
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-1 font-medium">
          <span className="w-4 h-4 inline-flex items-center justify-center">
            {getStatusIcon(job.status)}
          </span>
          <span>
            {getStatusDisplay()}
          </span>
        </div>
        
        <div className="w-5 h-5">
          {canCancel && (
            <Button
              variant="ghost"
              size="icon"
              className="h-5 w-5"
              onClick={(e) => {
                e.stopPropagation(); // Prevent triggering the card's onClick
                handleCancel(job.id);
              }}
              disabled={isCancelling[job.id]}
              aria-label="Cancel job"
            >
              <X className="h-3 w-3" />
            </Button>
          )}
        </div>
      </div>
      
      <div className="flex gap-1 mb-1 min-h-[20px]">
        {job.apiType && getApiTypeBadge(job.apiType)}
        {job.taskType && <Badge variant="outline" className="text-[10px]">{formatTaskType(job.taskType)}</Badge>}
      </div>
      
      <div className="text-muted-foreground text-[10px] mt-1">
        {timeAgo}
      </div>
      
      {/* Add token count display */}
      {(job.tokensSent || job.tokensReceived) && (
        <div className="text-muted-foreground text-[10px] mt-1 flex items-center justify-between">
          <span>
            Tokens: {formatTokenCount(job.tokensSent)} 
            {' / '}
            {formatTokenCount(job.tokensReceived)}
          </span>
        </div>
      )}

      {/* Preview response if available */}
      {(job.response || job.modelOutput) && (
        <div className="text-[10px] mt-1 border-t pt-1 text-muted-foreground line-clamp-2 overflow-hidden break-words">
          {getResponsePreview()}
        </div>
      )}
      
      {/* Show error message if job failed or canceled */}
      {(job.status === 'failed' || job.status === 'canceled') && job.errorMessage && (
        <div className="text-[10px] mt-1 border-t pt-1 text-red-500 line-clamp-2 overflow-hidden break-words">
          {getErrorPreview()}
        </div>
      )}
    </div>
  );
}, (prevProps, nextProps) => {
  // Custom comparison function to determine when to re-render
  // Only re-render when important properties change
  
  // Helper function to safely compare string fields (handling null/undefined values safely)
  const safeStringCompare = (a: string | null | undefined, b: string | null | undefined): boolean => {
    // Convert null/undefined to empty strings for comparison
    const safeA = a === null || a === undefined ? '' : String(a);
    const safeB = b === null || b === undefined ? '' : String(b);
    return safeA === safeB;
  };
  
  // Helper function to safely compare timestamp fields (handling null values safely)
  const safeTimestampCompare = (a: number | null | undefined, b: number | null | undefined): boolean => {
    if (a === null && b === null) return true;
    if (a === undefined && b === undefined) return true;
    if (a === null || a === undefined) return false;
    if (b === null || b === undefined) return false;
    return a === b;
  };
  
  // Helper to compare numeric values safely with fallbacks
  const safeNumberCompare = (a: number | null | undefined, b: number | null | undefined): boolean => {
    const numA = typeof a === 'number' ? a : 0;
    const numB = typeof b === 'number' ? b : 0;
    return numA === numB;
  };
  
  // The card should re-render when ANY of these fields change:
  const shouldUpdate = 
    // Job status affects styling and controls
    prevProps.job.status !== nextProps.job.status ||
    // Status message affects display
    !safeStringCompare(prevProps.job.statusMessage, nextProps.job.statusMessage) ||
    // Job response affects preview text
    !safeStringCompare(prevProps.job.response, nextProps.job.response) ||
    // Error message affects error display
    !safeStringCompare(prevProps.job.errorMessage, nextProps.job.errorMessage) ||
    // Cancellation state affects button state  
    prevProps.isCancelling[prevProps.job.id] !== nextProps.isCancelling[nextProps.job.id] ||
    // Token counts affect display
    !safeNumberCompare(prevProps.job.tokensReceived, nextProps.job.tokensReceived) ||
    !safeNumberCompare(prevProps.job.tokensSent, nextProps.job.tokensSent) ||
    // Character counts might affect UI display
    !safeNumberCompare(prevProps.job.charsReceived, nextProps.job.charsReceived) ||
    // Timestamps affect relative time display
    !safeTimestampCompare(prevProps.job.startTime, nextProps.job.startTime) ||
    !safeTimestampCompare(prevProps.job.lastUpdate, nextProps.job.lastUpdate) ||
    !safeTimestampCompare(prevProps.job.endTime, nextProps.job.endTime) ||
    !safeTimestampCompare(prevProps.job.updatedAt, nextProps.job.updatedAt) ||
    // Path display
    !safeStringCompare(prevProps.job.xmlPath, nextProps.job.xmlPath) ||
    // Task type affects display
    prevProps.job.taskType !== nextProps.job.taskType ||
    // API type affects badge
    prevProps.job.apiType !== nextProps.job.apiType ||
    // Check metadata differences that affect UI
    !areMetadataEqual(prevProps.job.metadata, nextProps.job.metadata);
  
  // Helper to compare metadata fields that are important for UI
  function areMetadataEqual(metaA: any, metaB: any): boolean {
    // If both are null or undefined, they're equal
    if (!metaA && !metaB) return true;
    
    // If only one is null/undefined, they differ
    if (!metaA || !metaB) return false;
    
    // Check fields that might affect the UI
    const importantFields = ['targetField', 'responseFormat', 'contentType', 'progress'];
    
    for (const field of importantFields) {
      if (metaA[field] !== metaB[field]) return false;
    }
    
    return true;
  }
  
  // Return true to prevent re-render (props are equal)
  // Return false to trigger re-render (props are different)
  return !shouldUpdate;
});

// Memoized empty state component
const EmptyState = memo(() => (
  <div className="px-3 py-6 text-center min-h-[100px] flex items-center justify-center">
    <p className="text-xs text-muted-foreground">No active tasks</p>
  </div>
));

// Memoized loading state component
const LoadingState = memo(() => (
  <div className="flex justify-center items-center py-6 min-h-[100px]">
    <div className="text-xs text-muted-foreground">Loading tasks</div>
  </div>
));

JobCard.displayName = 'JobCard';
EmptyState.displayName = 'EmptyState';
LoadingState.displayName = 'LoadingState';

export const BackgroundJobsSidebar: React.FC = () => {
  const { 
    jobs, 
    activeJobs, 
    isLoading, 
    error,
    cancelJob,
    clearHistory,
    refreshJobs
  } = useBackgroundJobs();
  
  // Keep a cached version of jobs to show during loading
  const [cachedJobs, setCachedJobs] = useState<BackgroundJob[]>([]);
  const [initialLoad, setInitialLoad] = useState(true);
  
  // Add state for selected job for the details modal
  const [selectedJob, setSelectedJob] = useState<BackgroundJob | null>(null);
  
  // Update cached jobs whenever we get new jobs
  useEffect(() => {
    if (jobs.length > 0) {
      setCachedJobs(jobs);
      if (initialLoad) setInitialLoad(false);
    }
  }, [jobs, initialLoad]);
  
  // Collapse state for each section 
  const [activeCollapsed, setActiveCollapsed] = useState(false);
  const [completedCollapsed, setCompletedCollapsed] = useState(false);
  const [failedCollapsed, setFailedCollapsed] = useState(false);
  
  const [isClearing, setIsClearing] = useState(false);
  const [isCancelling, setIsCancelling] = useState<Record<string, boolean>>({});
  const [isRefreshing, setIsRefreshing] = useState(false);
  const refreshClickedRef = useRef(false);
  
  // Enable this for extensive logging of job filtering and sorting
  const DEBUG_JOB_FILTERING = false;
  
  // Memoize job filtering to prevent unnecessary recalculations on render
  const { activeJobsToShow, completedJobs, failedJobs, hasJobs } = useMemo(() => {
    // Track start time for performance measurement
    const startTime = DEBUG_JOB_FILTERING ? performance.now() : 0;
    
    // Use cached jobs during loading to prevent UI flicker
    const jobsToUse = isLoading && cachedJobs.length > 0 ? cachedJobs : jobs;
    
    if (DEBUG_JOB_FILTERING) {
      console.debug(`[BackgroundJobsSidebar] Filtering ${jobsToUse.length} jobs (cached=${isLoading && cachedJobs.length > 0})`);
      
      // Log job status distribution for debugging
      const statusCounts = jobsToUse.reduce((acc, job) => {
        acc[job.status] = (acc[job.status] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);
      
      console.debug(`[BackgroundJobsSidebar] Jobs status distribution:`, statusCounts);
    }
    
    // Use the centralized constants for status categories to ensure consistency
    const ACTIVE_STATUSES = JOB_STATUSES.ACTIVE;
    const COMPLETED_STATUSES = JOB_STATUSES.COMPLETED;
    const FAILED_STATUSES = JOB_STATUSES.FAILED;
    
    // Create a safe compare function for timestamps that handles undefined/null values
    const safeCompare = (
      a: BackgroundJob,
      b: BackgroundJob,
      // Array of property names to check in order of preference
      props: Array<keyof BackgroundJob>
    ) => {
      // Find the first valid property to compare
      for (const prop of props) {
        const aVal = a[prop] as number | undefined | null;
        const bVal = b[prop] as number | undefined | null;
        
        // Only use this property if both values are valid numbers
        if (typeof aVal === 'number' && typeof bVal === 'number') {
          return bVal - aVal; // Descending order (newest first)
        }
      }
      // Fallback to creation time - every job should have this
      return (b.createdAt || 0) - (a.createdAt || 0);
    };
    
    // Active jobs - filter for status and sort by most recently updated
    const activeList = jobsToUse.filter(job => 
      ACTIVE_STATUSES.includes(job.status)
    ).sort((a, b) => safeCompare(a, b, ['updatedAt', 'startTime', 'lastUpdate']));
    
    // Completed jobs - filter for status and sort by most recently completed 
    const completedList = jobsToUse.filter(job => 
      COMPLETED_STATUSES.includes(job.status)
    ).sort((a, b) => safeCompare(a, b, ['endTime', 'updatedAt', 'lastUpdate']));
    
    // Failed or canceled jobs - filter for status and sort by most recent
    const failedList = jobsToUse.filter(job => 
      FAILED_STATUSES.includes(job.status)
    ).sort((a, b) => safeCompare(a, b, ['endTime', 'updatedAt', 'lastUpdate']));
    
    if (DEBUG_JOB_FILTERING) {
      const duration = performance.now() - startTime;
      console.debug(`[BackgroundJobsSidebar] Filtered jobs in ${Math.round(duration)}ms:`, {
        active: activeList.length,
        completed: completedList.length,
        failed: failedList.length,
        total: jobsToUse.length,
      });
    }
    
    return {
      activeJobsToShow: activeList,
      completedJobs: completedList,
      failedJobs: failedList,
      hasJobs: jobsToUse.length > 0
    };
  }, [jobs, cachedJobs, isLoading, DEBUG_JOB_FILTERING]);
  
  // Handle manual refresh of jobs
  const handleRefresh = async () => {
    // Prevent duplicate clicks
    if (refreshClickedRef.current || isLoading || isRefreshing) return;
    
    refreshClickedRef.current = true;
    setIsRefreshing(true);
    
    try {
      await refreshJobs();
    } finally {
      setIsRefreshing(false);
      // Reset after a delay to prevent rapid clicks
      setTimeout(() => {
        refreshClickedRef.current = false;
      }, 1000);
    }
  };
  
  // Handle clearing of history
  const handleClearHistory = async () => {
    setIsClearing(true);
    try {
      await clearHistory();
    } finally {
      setIsClearing(false);
    }
  };
  
  // Handle job cancellation
  const handleCancel = async (jobId: string) => {
    setIsCancelling(prev => ({ ...prev, [jobId]: true }));
    
    try {
      await cancelJob(jobId);
    } finally {
      setIsCancelling(prev => ({ ...prev, [jobId]: false }));
    }
  };
  
  // Handle selecting a job for details view
  const handleSelectJob = (job: BackgroundJob) => {
    setSelectedJob(job);
  };
  
  // Helper to truncate text
  const truncateText = (text: string, maxLength = 50) => {
    if (!text) return "";
    if (text.length <= maxLength) return text;
    return `${text.substring(0, maxLength)}...`;
  };
  
  // Memoize utility functions to prevent recreation on every render
  const getStatusIcon = useCallback((status: string) => {
    switch (status) {
      case 'completed':
        return <CheckCircle className="h-3 w-3 text-green-500" />;
      case 'failed':
        return <AlertCircle className="h-3 w-3 text-red-500" />;
      case 'running':
        return <Loader2 className="h-3 w-3 text-blue-500 animate-spin" />;
      case 'canceled':
        return <XCircle className="h-3 w-3 text-amber-500" />;
      case 'preparing':
      case 'created':
      case 'queued':
      case 'idle':
        return <Clock className="h-3 w-3 text-blue-400" />;
      default:
        return <Clock className="h-3 w-3 text-muted-foreground" />;
    }
  }, []);
  
  // Memoize API type badge component
  const getApiTypeBadge = useCallback((apiType: ApiType) => {
    let color = "text-primary-foreground";
    let bgColor = "bg-primary/80";
    
    switch (apiType.toLowerCase()) {
      case 'gemini':
        color = "text-emerald-50";
        bgColor = "bg-emerald-700";
        break;
      case 'claude':
        color = "text-purple-50";
        bgColor = "bg-purple-700";
        break;
      case 'openai':
        color = "text-teal-50";
        bgColor = "bg-teal-700";
        break;
      case 'groq':
        color = "text-amber-50";
        bgColor = "bg-amber-700";
        break;
    }
    
    return (
      <Badge className={`text-[10px] ${color} ${bgColor}`}>
        {apiType.charAt(0).toUpperCase() + apiType.slice(1).toLowerCase()}
      </Badge>
    );
  }, []);
  
  // Helper to get task type display name
  const formatTaskType = useCallback((taskType: TaskType): string => {
    // If taskType is undefined or null, return 'Unknown Task'
    if (!taskType) return 'Unknown Task';
    
    // Convert enum values to human readable format
    switch (taskType) {
      case 'xml_generation':
        return 'XML Generation';
      case 'pathfinder':
        return 'Path Finding';
      case 'transcription':
        return 'Voice Transcription';
      case 'regex_generation':
        return 'Regex Generation';
      case 'path_correction':
        return 'Path Correction';
      case 'text_improvement':
        return 'Text Improvement';
      case 'voice_correction':
        return 'Voice Correction';
      case 'task_enhancement':
        return 'Task Enhancement';
      case 'guidance_generation':
        return 'Guidance Generation';
      case 'task_guidance':
        return 'Task Guidance';
      // Handle non-standard values used in the app
      case 'path_finding' as any:
        return 'Path Finding';
      case 'voice_transcription' as any:
        return 'Voice Transcription';
      case 'message' as any:
        return 'Message';
      default:
        // Return the raw value if it doesn't match any known type
        // Convert to title case for better readability
        const rawValue = taskType.toString();
        return rawValue
          .split('_')
          .map(word => word.charAt(0).toUpperCase() + word.slice(1))
          .join(' ');
    }
  }, []);
  
  // Format timestamp to relative time
  const formatTimeAgo = useCallback((timestamp: number): string => {
    try {
      return formatDistanceToNow(new Date(timestamp), { addSuffix: true });
    } catch (e) {
      return 'Invalid date';
    }
  }, []);
  
  // Error banner - memoized
  const ErrorBanner = useMemo(() => {
    if (activeCollapsed || !error) return null;
    
    const ErrorComponent = () => (
      <div className="bg-amber-50 border border-amber-200 text-amber-700 p-2 text-xs m-2 rounded-md">
        <div className="flex items-center gap-1.5 mb-1">
          <AlertCircle className="h-3 w-3" />
          <span className="font-medium">Error</span>
        </div>
        <div className="text-xs">
          {error.message}
        </div>
      </div>
    );
    
    ErrorComponent.displayName = 'ErrorComponent';
    return <ErrorComponent />;
  }, [error, activeCollapsed]);
  
  // Fixed container style for consistent width
  const containerStyle = {
    width: activeCollapsed ? '48px' : '256px',
    transition: 'width 300ms ease-in-out',
    transform: 'translate3d(0, 0, 0)',
    backfaceVisibility: 'hidden' as const,
    willChange: 'width',
    position: 'fixed' as const,
    left: 0,
    top: 0,
    height: '100vh',
    overflow: 'hidden'
  };
  
  // Show loading only on first load, otherwise show cached content during updates
  const shouldShowLoading = initialLoad && isLoading && cachedJobs.length === 0;
  const shouldShowEmpty = !shouldShowLoading && !hasJobs;
  
  return (
    <div 
      className="fixed right-0 top-0 h-screen bg-card border-l z-50 overflow-hidden text-xs shadow-lg"
      style={containerStyle}
    >
      <Collapsible open={!activeCollapsed} onOpenChange={(open) => setActiveCollapsed(!open)}>
        <div className="p-3 border-b flex items-center justify-between h-12">
          <h2 className={`font-medium text-sm ${activeCollapsed ? 'opacity-0' : 'opacity-100'}`} style={{ minWidth: '100px', transition: 'opacity 150ms ease' }}>
            Background Tasks
          </h2>
          
          <div className="flex items-center gap-2 ml-auto">
            {!activeCollapsed && (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button 
                      size="icon" 
                      variant="ghost" 
                      className="h-6 w-6" 
                      onClick={handleRefresh}
                      disabled={isRefreshing || refreshClickedRef.current}
                    >
                      <RefreshCw className={`h-3 w-3 ${isRefreshing ? 'animate-spin' : ''}`} />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Refresh</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
            
            {!activeCollapsed && (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button 
                      size="icon" 
                      variant="ghost" 
                      className="h-6 w-6" 
                      onClick={handleClearHistory}
                      disabled={isClearing}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Clear history</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
            
            <CollapsibleTrigger asChild>
              <Button size="icon" variant="ghost" className="h-6 w-6 flex-shrink-0">
                {activeCollapsed ? <ChevronRight className="h-4 w-4" /> : <X className="h-4 w-4" />}
              </Button>
            </CollapsibleTrigger>
          </div>
        </div>
        
        <CollapsibleContent forceMount className="overflow-y-auto" style={{ height: 'calc(100vh - 3rem)' }}>
          {ErrorBanner}
          
          <ScrollArea className="p-3 pb-24 h-full">
            {shouldShowLoading ? (
              <LoadingState />
            ) : shouldShowEmpty ? (
              <EmptyState />
            ) : (
              <>
                {/* Active Jobs Section */}
                {activeJobsToShow.length > 0 && (
                  <div className="mb-3">
                    <h4 className="text-xs font-semibold text-muted-foreground mb-1 px-1">Active</h4>
                    <div className="space-y-2">
                      {activeJobsToShow.map(job => (
                        <JobCard 
                          key={job.id}
                          job={job}
                          handleCancel={handleCancel}
                          isCancelling={isCancelling}
                          getStatusIcon={getStatusIcon}
                          getApiTypeBadge={getApiTypeBadge}
                          formatTaskType={formatTaskType}
                          formatTimeAgo={formatTimeAgo}
                          onSelect={handleSelectJob}
                        />
                      ))}
                    </div>
                  </div>
                )}

                {/* Completed Jobs Section */}
                {completedJobs.length > 0 && (
                  <div className="mb-3">
                    <h4 className="text-xs font-semibold text-muted-foreground mb-1 px-1">Completed</h4>
                    <div className="space-y-2">
                      {completedJobs.map(job => (
                        <JobCard 
                          key={job.id}
                          job={job}
                          handleCancel={handleCancel}
                          isCancelling={isCancelling}
                          getStatusIcon={getStatusIcon}
                          getApiTypeBadge={getApiTypeBadge}
                          formatTaskType={formatTaskType}
                          formatTimeAgo={formatTimeAgo}
                          onSelect={handleSelectJob}
                        />
                      ))}
                    </div>
                  </div>
                )}

                {/* Failed/Canceled Jobs Section */}
                {failedJobs.length > 0 && (
                  <div>
                    <h4 className="text-xs font-semibold text-muted-foreground mb-1 px-1">Failed/Canceled</h4>
                    <div className="space-y-2">
                      {failedJobs.map(job => (
                        <JobCard 
                          key={job.id}
                          job={job}
                          handleCancel={handleCancel}
                          isCancelling={isCancelling}
                          getStatusIcon={getStatusIcon}
                          getApiTypeBadge={getApiTypeBadge}
                          formatTaskType={formatTaskType}
                          formatTimeAgo={formatTimeAgo}
                          onSelect={handleSelectJob}
                        />
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </ScrollArea>
        </CollapsibleContent>
      </Collapsible>
      
      {/* Job Details Modal */}
      <JobDetailsModal 
        job={selectedJob} 
        onClose={() => setSelectedJob(null)} 
      />
    </div>
  );
};

// Add display name to the component
BackgroundJobsSidebar.displayName = 'BackgroundJobsSidebar'; 