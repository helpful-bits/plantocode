"use client";

import React, { useState, useRef } from 'react';
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
  
  // Handle cancellation of a job
  const handleCancel = async (jobId: string) => {
    setIsCancelling(prev => ({ ...prev, [jobId]: true }));
    try {
      await cancelJob(jobId);
    } finally {
      setIsCancelling(prev => ({ ...prev, [jobId]: false }));
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
  
  // Helper to get status icon
  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'running':
        return <Loader2 className="h-4 w-4 animate-spin text-blue-500" />;
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
  
  // Format time ago
  const formatTimeAgo = (timestamp: number) => {
    try {
      return formatDistanceToNow(new Date(timestamp), { addSuffix: true });
    } catch (e) {
      return 'unknown time';
    }
  };
  
  // Helper to get API type badge color
  const getApiTypeBadge = (apiType: ApiType) => {
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
  
  // Helper to format task type for display
  const formatTaskType = (taskType: TaskType) => {
    return taskType
      .split('_')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  };
  
  // Error banner
  const ErrorBanner = () => {
    if (isCollapsed || !error) return null;
    
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
  
  return (
    <div className={`h-screen bg-muted/40 border-r fixed left-0 top-0 z-20 transition-all duration-300 ${isCollapsed ? 'w-12' : 'w-64'}`}>
      <Collapsible open={!isCollapsed} onOpenChange={(open) => setIsCollapsed(!open)}>
        <div className="p-3 border-b flex items-center justify-between">
          <h2 className={`font-medium text-sm ${isCollapsed ? 'hidden' : 'block'}`}>
            Background Tasks
          </h2>
          
          <div className="flex items-center gap-2">
            {!isCollapsed && (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button 
                      size="icon" 
                      variant="ghost" 
                      className="h-6 w-6" 
                      onClick={handleRefresh}
                      disabled={isLoading || isRefreshing}
                    >
                      <RefreshCw className={`h-4 w-4 ${isRefreshing || isLoading ? 'animate-spin' : ''}`} />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Refresh tasks</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
            
            <CollapsibleTrigger asChild>
              <Button size="icon" variant="ghost" className="h-6 w-6">
                {isCollapsed ? <RefreshCw className="h-4 w-4" /> : <X className="h-4 w-4" />}
              </Button>
            </CollapsibleTrigger>
          </div>
        </div>
        
        <CollapsibleContent forceMount className="h-[calc(100vh-48px)]">
          <ErrorBanner />
          
          <div className="flex items-center justify-between px-3 pt-3 pb-1">
            <h3 className="text-xs font-semibold text-muted-foreground">
              {isLoading ? 'Loading tasks...' : `Running Tasks (${activeJobs.length})`}
            </h3>
            
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button 
                    size="icon" 
                    variant="ghost" 
                    className="h-6 w-6" 
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
            {isLoading ? (
              <div className="flex justify-center items-center py-6">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : jobs.length > 0 ? (
              <div className="space-y-0.5 p-2">
                {jobs.map((job) => (
                  <div key={job.id} className="border bg-card p-2 rounded-md text-xs">
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-1 font-medium">
                        {getStatusIcon(job.status)}
                        <span>{job.status === 'running' ? 'Processing' : job.status === 'preparing' ? 'Preparing' : job.status}</span>
                      </div>
                      
                      {job.status === 'running' && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-5 w-5"
                          onClick={() => handleCancel(job.id)}
                          disabled={isCancelling[job.id]}
                        >
                          {isCancelling[job.id] ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            <X className="h-3 w-3" />
                          )}
                        </Button>
                      )}
                    </div>
                    
                    <div className="flex gap-1 mb-1">
                      {job.apiType && getApiTypeBadge(job.apiType)}
                      {job.taskType && <Badge variant="outline" className="text-[10px]">{formatTaskType(job.taskType)}</Badge>}
                    </div>
                    
                    <div className="text-muted-foreground text-[10px] mt-1">
                      {job.startTime ? formatTimeAgo(job.startTime) : formatTimeAgo(job.createdAt)}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="px-3 py-6 text-center">
                <p className="text-xs text-muted-foreground">No active tasks</p>
              </div>
            )}
          </ScrollArea>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}; 