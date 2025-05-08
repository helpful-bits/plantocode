"use client";

import React, { useState, useRef } from 'react';
import { useBackgroundJobs } from '@/lib/contexts/background-jobs-context';
import { BackgroundJob } from '@/types/session-types';
import { RefreshCw, X, Trash2, AlertCircle, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { JobDetailsModal } from './JobDetailsModal';
import { JobCard } from './JobCard';
import { EmptyState, LoadingState } from './SidebarStates';
import { useJobFiltering } from './hooks/useJobFiltering';

export const BackgroundJobsSidebar: React.FC = () => {
  const { 
    jobs, 
    isLoading, 
    error,
    cancelJob,
    clearHistory,
    refreshJobs
  } = useBackgroundJobs();
  
  // Add state for selected job for the details modal
  const [selectedJob, setSelectedJob] = useState<BackgroundJob | null>(null);
  
  // Collapse state for each section 
  const [activeCollapsed, setActiveCollapsed] = useState(false);
  
  const [isClearing, setIsClearing] = useState(false);
  const [isCancelling, setIsCancelling] = useState<Record<string, boolean>>({});
  const [isRefreshing, setIsRefreshing] = useState(false);
  const refreshClickedRef = useRef(false);
  
  // Use the extracted job filtering hook
  const {
    activeJobsToShow,
    completedJobs,
    failedJobs,
    hasJobs,
    shouldShowLoading,
    shouldShowEmpty
  } = useJobFiltering(jobs, isLoading);
  
  // Handle manual refresh of jobs
  const handleRefresh = React.useCallback(async () => {
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
  }, [isLoading, isRefreshing, refreshJobs]);
  
  // Add event listener for custom refresh event
  React.useEffect(() => {
    const handleRefreshEvent = () => {
      console.log('[BackgroundJobsSidebar] Received refresh-background-jobs event');
      handleRefresh();
    };
    
    // Add event listener
    window.addEventListener('refresh-background-jobs', handleRefreshEvent);
    
    // Clean up
    return () => {
      window.removeEventListener('refresh-background-jobs', handleRefreshEvent);
    };
  }, [handleRefresh]);
  
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
  
  // Error component rendered when there's an error
  const renderError = () => {
    if (activeCollapsed || !error) return null;
    
    return (
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
  };
  
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
          {renderError()}
          
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