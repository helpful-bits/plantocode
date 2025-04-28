"use client";

import React, { useState, useRef, useMemo, memo, useEffect } from 'react';
import { useBackgroundJobs } from '@/lib/contexts/background-jobs-context';
import { BackgroundJob, ApiType, TaskType } from '@/lib/types/background-jobs';
import { formatDistanceToNow } from 'date-fns';
import { AlertCircle, CheckCircle, Clock, RefreshCw, X, Trash2, XCircle, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Badge } from '@/components/ui/badge';

// Memoized job card to prevent unnecessary re-renders
const JobCard = memo(({ 
  job, 
  handleCancel, 
  isCancelling, 
  getStatusIcon, 
  getApiTypeBadge, 
  formatTaskType, 
  formatTimeAgo 
}: { 
  job: BackgroundJob, 
  handleCancel: (id: string) => Promise<void>,
  isCancelling: Record<string, boolean>,
  getStatusIcon: (status: string) => React.ReactNode,
  getApiTypeBadge: (apiType: ApiType) => React.ReactNode,
  formatTaskType: (taskType: TaskType) => string,
  formatTimeAgo: (timestamp: number) => string
}) => {
  return (
    <div className="border bg-card p-2 rounded-md text-xs" style={{ minHeight: '70px', height: 'auto', maxHeight: '160px', overflow: 'hidden' }}>
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-1 font-medium">
          <span className="w-4 h-4 inline-flex items-center justify-center">
            {getStatusIcon(job.status)}
          </span>
          <span>
            {job.status === 'running' 
              ? 'Processing' 
              : job.status === 'preparing' || job.status === 'created' || job.status === 'queued'
                ? 'Preparing' 
                : job.status}
          </span>
        </div>
        
        <div className="w-5 h-5">
          {job.status === 'running' && (
            <Button
              variant="ghost"
              size="icon"
              className="h-5 w-5"
              onClick={() => handleCancel(job.id)}
              disabled={isCancelling[job.id]}
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
        {job.startTime ? formatTimeAgo(job.startTime) : formatTimeAgo(typeof job.createdAt === 'string' ? new Date(job.createdAt).getTime() : job.createdAt)}
      </div>
    </div>
  );
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
  
  // Update cached jobs whenever we get new jobs
  useEffect(() => {
    if (jobs.length > 0) {
      setCachedJobs(jobs);
      if (initialLoad) setInitialLoad(false);
    }
  }, [jobs, initialLoad]);
  
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isClearing, setIsClearing] = useState(false);
  const [isCancelling, setIsCancelling] = useState<Record<string, boolean>>({});
  const [isRefreshing, setIsRefreshing] = useState(false);
  const refreshClickedRef = useRef(false);
  
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
  
  // Helper to truncate text
  const truncateText = (text: string, maxLength = 50) => {
    if (!text) return "";
    if (text.length <= maxLength) return text;
    return `${text.substring(0, maxLength)}...`;
  };
  
  // Helper to get status icon - memoized to prevent re-renders
  const getStatusIcon = useMemo(() => {
    const StatusIconComponent = (status: string) => {
      switch (status) {
        case 'running':
          return <Loader2 className="h-4 w-4 text-blue-500" />;
        case 'preparing':
          return <Clock className="h-4 w-4 text-yellow-500" />;
        case 'completed':
          return <CheckCircle className="h-4 w-4 text-green-500" />;
        case 'failed':
          return <AlertCircle className="h-4 w-4 text-red-500" />;
        case 'canceled':
          return <XCircle className="h-4 w-4 text-gray-500" />;
        default:
          return <Clock className="h-4 w-4 text-gray-500" />;
      }
    };
    StatusIconComponent.displayName = 'StatusIconComponent';
    return StatusIconComponent;
  }, []);
  
  // Format time ago - memoized to prevent re-renders
  const formatTimeAgo = useMemo(() => (timestamp: number) => {
    try {
      return formatDistanceToNow(new Date(timestamp), { addSuffix: true });
    } catch (e) {
      return 'unknown time';
    }
  }, []);
  
  // Helper to get API type badge color - memoized to prevent re-renders
  const getApiTypeBadge = useMemo(() => {
    const ApiTypeBadgeComponent = (apiType: ApiType) => {
      switch (apiType) {
        case 'gemini':
          return <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">Gemini</Badge>;
        case 'claude':
          return <Badge variant="outline" className="bg-purple-50 text-purple-700 border-purple-200">Claude</Badge>;
        case 'whisper':
          return <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">Whisper</Badge>;
        default:
          return <Badge variant="outline">{apiType}</Badge>;
      }
    };
    ApiTypeBadgeComponent.displayName = 'ApiTypeBadgeComponent';
    return ApiTypeBadgeComponent;
  }, []);
  
  // Helper to format task type for display - memoized to prevent re-renders
  const formatTaskType = useMemo(() => (taskType: TaskType) => {
    return taskType
      .split('_')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  }, []);
  
  // Error banner - memoized
  const ErrorBanner = useMemo(() => {
    if (isCollapsed || !error) return null;
    
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
  }, [error, isCollapsed]);
  
  // Determine which jobs to display - use cached jobs during loading if available
  const displayJobs = useMemo(() => {
    // During first load, show loading state
    if (initialLoad && isLoading) {
      return [];
    }
    // During subsequent loads, use cached jobs instead of showing loading state
    return isLoading && cachedJobs.length > 0 ? cachedJobs : jobs;
  }, [jobs, cachedJobs, isLoading, initialLoad]);
  
  // Memoize the entire jobs list to prevent unnecessary re-renders
  const jobsList = useMemo(() => {
    // Move handleCancel inside useMemo to fix exhaustive-deps warning
    const handleCancelInside = async (jobId: string) => {
      setIsCancelling(prev => ({ ...prev, [jobId]: true }));
      try {
        await cancelJob(jobId);
      } finally {
        setIsCancelling(prev => ({ ...prev, [jobId]: false }));
      }
    };

    return displayJobs.map(job => (
      <JobCard 
        key={job.id}
        job={job}
        handleCancel={handleCancelInside}
        isCancelling={isCancelling}
        getStatusIcon={getStatusIcon}
        getApiTypeBadge={getApiTypeBadge}
        formatTaskType={formatTaskType}
        formatTimeAgo={formatTimeAgo}
      />
    ));
  }, [displayJobs, isCancelling, getStatusIcon, getApiTypeBadge, formatTaskType, formatTimeAgo, cancelJob]);
  
  // Fixed container style for consistent width
  const containerStyle = {
    width: isCollapsed ? '48px' : '256px',
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
  const shouldShowEmpty = !shouldShowLoading && displayJobs.length === 0;
  
  return (
    <div 
      className="bg-muted/40 border-r z-20"
      style={containerStyle}
    >
      <Collapsible open={!isCollapsed} onOpenChange={(open) => setIsCollapsed(!open)}>
        <div className="p-3 border-b flex items-center justify-between h-12">
          <h2 className={`font-medium text-sm ${isCollapsed ? 'opacity-0' : 'opacity-100'}`} style={{ minWidth: '100px', transition: 'opacity 150ms ease' }}>
            Background Tasks
          </h2>
          
          <div className="flex items-center gap-2 ml-auto">
            {!isCollapsed && (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button 
                      size="icon" 
                      variant="ghost" 
                      className="h-6 w-6 flex-shrink-0" 
                      onClick={handleRefresh}
                      disabled={isLoading || isRefreshing}
                    >
                      <RefreshCw className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Refresh tasks</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
            
            <CollapsibleTrigger asChild>
              <Button size="icon" variant="ghost" className="h-6 w-6 flex-shrink-0">
                {isCollapsed ? <RefreshCw className="h-4 w-4" /> : <X className="h-4 w-4" />}
              </Button>
            </CollapsibleTrigger>
          </div>
        </div>
        
        <CollapsibleContent forceMount className="h-[calc(100vh-48px)]">
          {ErrorBanner}
          
          <div className="flex items-center justify-between px-3 pt-3 pb-1 h-8">
            <h3 className="text-xs font-semibold text-muted-foreground truncate">
              {`Running Tasks (${activeJobs.length})`}
            </h3>
            
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button 
                    size="icon" 
                    variant="ghost" 
                    className="h-6 w-6 flex-shrink-0" 
                    onClick={handleClearHistory}
                    disabled={isClearing || jobs.length === 0}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Clear all tasks</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
          
          <ScrollArea className="h-[calc(100vh-96px)]">
            <div className="space-y-0.5 p-2 min-h-[100px]">
              {shouldShowLoading ? (
                <LoadingState />
              ) : shouldShowEmpty ? (
                <EmptyState />
              ) : (
                jobsList
              )}
            </div>
          </ScrollArea>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
};

// Add display name to the component
BackgroundJobsSidebar.displayName = 'BackgroundJobsSidebar'; 