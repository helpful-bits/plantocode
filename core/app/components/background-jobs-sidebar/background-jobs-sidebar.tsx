"use client";

import React, { useState, useRef, useEffect } from 'react';
import { useBackgroundJobs } from '@core/lib/contexts/background-jobs-context';
import { useUILayout } from '@core/lib/contexts/ui-layout-context';
import { BackgroundJob } from '@core/types/session-types';
import { RefreshCw, X, Trash2, AlertCircle, ChevronRight, Clock } from 'lucide-react';
import { Button } from '@core/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@core/components/ui/collapsible';
import { ScrollArea } from '@core/components/ui/scroll-area';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@core/components/ui/tooltip';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@core/components/ui/dropdown-menu';
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

  // Use the UI layout context
  const { setIsSidebarCollapsed } = useUILayout();

  // Add state for selected job for the details modal
  const [selectedJob, setSelectedJob] = useState<BackgroundJob | null>(null);

  // Collapse state for each section
  const [activeCollapsed, setActiveCollapsed] = useState(false);

  const [isClearing, setIsClearing] = useState(false);
  const [clearFeedback, setClearFeedback] = useState<string | null>(null);
  const [isCancelling, setIsCancelling] = useState<Record<string, boolean>>({});
  const [isRefreshing, setIsRefreshing] = useState(false);
  const refreshClickedRef = useRef(false);

  // Clear feedback message after it's been shown
  useEffect(() => {
    if (clearFeedback) {
      const timer = setTimeout(() => {
        setClearFeedback(null);
      }, 5000); // Show for 5 seconds

      return () => clearTimeout(timer);
    }
  }, [clearFeedback]);

  // Use the extracted job filtering hook
  const {
    activeJobsToShow,
    completedJobs,
    failedJobs,
    hasJobs,
    shouldShowLoading,
    shouldShowEmpty
  } = useJobFiltering(jobs, isLoading);

  // Update CSS variable and context when sidebar state changes
  useEffect(() => {
    // Update CSS variable for the sidebar width
    document.documentElement.style.setProperty(
      '--sidebar-width',
      activeCollapsed ? '48px' : '256px'
    );

    // Update the context state
    setIsSidebarCollapsed(activeCollapsed);
  }, [activeCollapsed, setIsSidebarCollapsed]);

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
  // daysToKeep parameter determines the clearing behavior:
  // - When -1: Delete all completed/failed/canceled jobs
  // - When undefined or 0: Only permanently deletes very old jobs (90+ days)
  // - When > 0: Hides jobs older than the specified number of days from view (marks as cleared=1)
  const handleClearHistory = async (daysToKeep?: number) => {
    setIsClearing(true);
    try {
      await clearHistory(daysToKeep);

      // Set appropriate feedback message based on the clearing operation
      if (daysToKeep === -1) {
        setClearFeedback("All completed, failed, and canceled jobs have been deleted");
      } else if (daysToKeep === undefined || daysToKeep === 0) {
        setClearFeedback("Jobs older than 90 days permanently deleted");
      } else {
        setClearFeedback(`Jobs older than ${daysToKeep} day${daysToKeep > 1 ? 's' : ''} have been hidden from view`);
      }
    } catch (err) {
      setClearFeedback("Error clearing jobs. Please try again.");
      console.error("[BackgroundJobsSidebar] Error clearing history:", err);
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
      <div className="bg-warning-background border border-warning-border text-warning-foreground px-4 py-3 text-xs mx-4 mt-3 rounded-md">
        <div className="flex items-center gap-2 mb-1.5">
          <AlertCircle className="h-4 w-4 text-warning" />
          <span className="font-medium">Error</span>
        </div>
        <div className="text-xs text-balance">
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

  // Handle sidebar collapse toggle
  const handleCollapseChange = (open: boolean) => {
    setActiveCollapsed(!open);
    // This will trigger the useEffect which updates both CSS var and context
  };

  return (
    <div
      className="fixed left-0 top-0 h-screen bg-card border-r z-50 overflow-hidden text-xs shadow-lg"
      style={containerStyle}
    >
      <Collapsible open={!activeCollapsed} onOpenChange={handleCollapseChange}>
        <div className="px-4 py-3 border-b flex items-center justify-between h-14">
          <h2 className={`font-medium text-sm text-balance ${activeCollapsed ? 'opacity-0' : 'opacity-100'}`} style={{ minWidth: '100px', transition: 'opacity 150ms ease' }}>
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
                      className="h-8 w-8"
                      onClick={handleRefresh}
                      disabled={isRefreshing || refreshClickedRef.current}
                    >
                      <RefreshCw className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Refresh</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}

            {!activeCollapsed && (
              <DropdownMenu>
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <DropdownMenuTrigger asChild>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-8 w-8"
                          disabled={isClearing}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>Job history options</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => handleClearHistory(-1)} disabled={isClearing}>
                    <Trash2 className="mr-2 h-4 w-4" />
                    <span>Delete all completed/failed/canceled jobs</span>
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => handleClearHistory()} disabled={isClearing}>
                    <Clock className="mr-2 h-4 w-4" />
                    <span>Delete jobs older than 90 days</span>
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => handleClearHistory(7)} disabled={isClearing}>
                    <Trash2 className="mr-2 h-4 w-4" />
                    <span>Hide jobs older than 7 days</span>
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => handleClearHistory(3)} disabled={isClearing}>
                    <Trash2 className="mr-2 h-4 w-4" />
                    <span>Hide jobs older than 3 days</span>
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => handleClearHistory(1)} disabled={isClearing}>
                    <Trash2 className="mr-2 h-4 w-4" />
                    <span>Hide jobs older than 1 day</span>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}

            <CollapsibleTrigger asChild>
              <Button size="icon" variant="ghost" className="h-8 w-8 flex-shrink-0">
                {activeCollapsed ? <ChevronRight className="h-4 w-4" /> : <X className="h-4 w-4" />}
              </Button>
            </CollapsibleTrigger>
          </div>
        </div>

        <CollapsibleContent forceMount className="overflow-y-auto" style={{ height: 'calc(100vh - 3.5rem)' }}>
          {renderError()}

          {/* Feedback message for clear operations */}
          {clearFeedback && !activeCollapsed && (
            <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 text-xs mx-4 mt-3 mb-3 rounded-md">
              <div className="text-xs text-balance">
                {clearFeedback}
              </div>
            </div>
          )}

          <ScrollArea className="px-4 py-3 pb-24 h-full min-h-[calc(100vh-8rem)]">
            <div className="min-h-[calc(100vh-10rem)]">
              {shouldShowLoading ? (
                <LoadingState />
              ) : shouldShowEmpty ? (
                <EmptyState />
              ) : (
              <>
                {/* Active Jobs Section */}
                {activeJobsToShow.length > 0 && (
                  <div className="mb-6">
                    <h4 className="text-xs font-semibold text-muted-foreground mb-2">Active</h4>
                    <div className="space-y-3">
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
                  <div className="mb-6">
                    <h4 className="text-xs font-semibold text-muted-foreground mb-2">Completed</h4>
                    <div className="space-y-3">
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
                    <h4 className="text-xs font-semibold text-muted-foreground mb-2">Failed/Canceled</h4>
                    <div className="space-y-3">
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
            </div>
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