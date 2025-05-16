"use client";

import React, { useEffect, useState, useMemo, useCallback, useRef } from "react";
import { useBackgroundJobs } from '@core/lib/contexts/background-jobs-context';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@core/components/ui/card";
import { ScrollArea } from "@core/components/ui/scroll-area";
import { Progress } from "@core/components/ui/progress";
import { ClipboardCopy, Loader2, Info, Eye, Code, X, RefreshCw, Trash2 } from "lucide-react";
import { Button } from "@core/components/ui/button";
import { formatDistanceToNow } from "date-fns";
import { useProject } from '@core/lib/contexts/project-context';
import { toast } from "@core/components/ui/use-toast";
import { JOB_STATUSES, BackgroundJob, TaskType } from "@core/types/session-types";
import { JobDetailsModal } from "@core/app/components/background-jobs-sidebar/JobDetailsModal";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@core/components/ui/dialog";
import { Alert, AlertDescription } from "@core/components/ui/alert";
import { getStreamingProgressValue } from "../background-jobs-sidebar/utils";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@core/components/ui/alert-dialog";

// Define streaming statuses for consistent checking
const STREAMING_STATUSES = ['running', 'processing_stream', 'generating_stream'];

interface ImplementationPlansPanelProps {
  sessionId?: string | null;
}

export function ImplementationPlansPanel({ sessionId }: ImplementationPlansPanelProps) {
  const { jobs, isLoading, deleteJob, refreshJobs } = useBackgroundJobs();
  const { projectDirectory } = useProject();
  const [copiedPlanId, setCopiedPlanId] = useState<string | null>(null);
  const [initialLoadComplete, setInitialLoadComplete] = useState<boolean>(false);
  const [sessionNames, setSessionNames] = useState<Record<string, string>>({});
  const [jobForModal, setJobForModal] = useState<BackgroundJob | null>(null);
  const [planContentModal, setPlanContentModal] = useState<{plan: BackgroundJob, open: boolean} | null>(null);
  const [pollingError, setPollingError] = useState<string | null>(null);
  const [jobToDelete, setJobToDelete] = useState<BackgroundJob | null>(null);
  const [isDeleting, setIsDeleting] = useState<Record<string, boolean>>({});
  // Ref to track the polling interval for streaming updates
  const streamingUpdateInterval = useRef<NodeJS.Timeout | null>(null);

  // Local state for implementation plans to allow optimistic UI updates
  const [implementationPlans, setImplementationPlans] = useState<BackgroundJob[]>([]);

  // Memoize the filtered and sorted implementation plans to prevent unnecessary re-renders
  const filteredPlans = useMemo(() => {
    if (!jobs || jobs.length === 0 || !projectDirectory) return [];

    // Filter jobs based on criteria - include both active and completed plans, but exclude canceled ones
    const filteredJobs = jobs.filter(job => 
      job.taskType === 'implementation_plan' && 
      (JOB_STATUSES.COMPLETED.includes(job.status) || JOB_STATUSES.ACTIVE.includes(job.status)) &&
      job.status !== 'canceled' && // Explicitly exclude canceled jobs
      job.status !== 'failed' && // Also exclude failed jobs
      job.projectDirectory === projectDirectory && // Filter by project directory
      (!sessionId || job.sessionId === sessionId) // Filter by session ID if provided
    );

    // Sort active jobs first, then by created time (most recent first)
    return [...filteredJobs].sort((a, b) => {
      // Active jobs (running, preparing, queued, etc.) first
      const aIsActive = JOB_STATUSES.ACTIVE.includes(a.status);
      const bIsActive = JOB_STATUSES.ACTIVE.includes(b.status);
      
      if (aIsActive && !bIsActive) return -1;
      if (!aIsActive && bIsActive) return 1;
      
      // If both are active, sort by status priority
      if (aIsActive && bIsActive) {
        const statusPriority = {
          'running': 0,
          'PROCESSING_STREAM': 0, // Same priority as running
          'GENERATING_STREAM': 1,
          'PREPARING_INPUT': 1,
          'preparing': 2,
          'queued': 3,
          'idle': 4,
          'acknowledged_by_worker': 5
        };
        
        const aPriority = statusPriority[a.status as keyof typeof statusPriority] ?? 99;
        const bPriority = statusPriority[b.status as keyof typeof statusPriority] ?? 99;
        
        if (aPriority !== bPriority) {
          return aPriority - bPriority;
        }
      }
      
      // If both have same active/inactive status, sort by created time (newest first)
      return b.createdAt - a.createdAt;
    });
  }, [jobs, projectDirectory, sessionId]);

  // Update local state when filtered plans change
  useEffect(() => {
    // Directly set the implementation plans from the filtered list from context.
    // The `filteredPlans` variable already contains the correctly filtered and sorted plans.
    setImplementationPlans(prevLocalPlans => {
      // Use a simple JSON comparison for a basic check if plans are the same
      if (JSON.stringify(prevLocalPlans) !== JSON.stringify(filteredPlans)) {
        return filteredPlans;
      }
      return prevLocalPlans;
    });
  }, [filteredPlans]);
  
  // Function to manually refresh the list of plans
  const refreshPlans = useCallback(async () => {
    try {
      await refreshJobs();
      console.log("Plans refreshed successfully");
    } catch (error) {
      console.error("Error refreshing plans:", error);
    }
  }, [refreshJobs]);
  
  // Direct refresh function for a specific implementation plan
  const refreshImplementationPlan = useCallback(async (planId: string) => {
    try {
      const response = await fetch(`/api/read-implementation-plan/${planId}`);
      if (response.ok) {
        const data = await response.json();
        
        // Update the specific job in implementationPlans state
        setImplementationPlans(prevPlans => 
          prevPlans.map(plan => {
            if (plan.id === planId) {
              return {
                ...plan,
                status: data.status || plan.status,
                response: data.content || plan.response || '',
                metadata: {
                  ...plan.metadata,
                  streamProgress: data.streamProgress || plan.metadata?.streamProgress,
                  responseLength: (data.content || '').length,
                  isStreaming: data.status === 'running'
                },
                statusMessage: data.statusMessage || plan.statusMessage
              };
            }
            return plan;
          })
        );
        
        // Return the data for other uses
        return data;
      }
    } catch (error) {
      console.error(`Error refreshing implementation plan ${planId}:`, error);
    }
    return null;
  }, []);

  // Generate session names based on session IDs
  useEffect(() => {
    if (!jobs || jobs.length === 0) return;
    
    const uniqueSessionIds = [...new Set(jobs.map(job => job.sessionId))].filter(Boolean) as string[];
    if (uniqueSessionIds.length === 0) return;
    
    // Create simplified display names from session IDs
    const names: Record<string, string> = {};
    uniqueSessionIds.forEach(sessionId => {
      // Create a user-friendly name from the session ID
      // Use first 8 characters of the session ID to create a shortened name
      const shortId = sessionId.substring(0, 8);
      names[sessionId] = `Session ${shortId}`;
    });
    
    setSessionNames(names);
  }, [jobs]);
  
  // Set initial load complete after first data load
  useEffect(() => {
    if (!isLoading && jobs.length > 0 && !initialLoadComplete) {
      setInitialLoadComplete(true);
    }
  }, [isLoading, jobs, initialLoadComplete]);
  
  // Polling mechanism for active implementation plans
  useEffect(() => {
    // Only set up polling if there are active implementation plans
    const activePlans = implementationPlans.filter(
      plan => JOB_STATUSES.ACTIVE.includes(plan.status)
    );
    
    if (activePlans.length === 0) return;
    
    // Reference for tracking active polling
    const pollingRef = { current: true };
    
    // Set up polling for active plans
    const pollingInterval = setInterval(async () => {
      if (!pollingRef.current) return;
      
      // First, refresh all jobs to ensure we have the latest status
      try {
        await refreshJobs();
      } catch (error) {
        console.error("Error refreshing all jobs:", error);
      }
      
      // Then, refresh each active plan for detailed content
      for (const plan of activePlans) {
        if (!pollingRef.current) break;
        await refreshImplementationPlan(plan.id);
      }
    }, 1500); // Poll every 1.5 seconds (same as background jobs context polling)
    
    return () => {
      pollingRef.current = false;
      clearInterval(pollingInterval);
    };
  }, [implementationPlans, refreshImplementationPlan, refreshJobs]);

  const copyToClipboard = useCallback(async (text: string, jobId: string) => {
    try {
      // This is the raw content that we copy - same content should be shown in the modal
      console.log("[Copy content]", text);
      await navigator.clipboard.writeText(text);
      setCopiedPlanId(jobId);
      
      // Reset the copied state after 2 seconds
      setTimeout(() => {
        setCopiedPlanId(null);
      }, 2000);
    } catch (err) {
      console.error("Failed to copy text: ", err);
      toast({
        title: "Error",
        description: "Failed to copy content to clipboard",
        variant: "destructive",
      });
    }
  }, []);

  // Helper function to get the most up-to-date job content directly from the API
  const refreshJobContent = useCallback(async (jobId: string) => {
    try {
      console.log(`[refreshJobContent] Making direct API call for job ${jobId}`);
      
      // Make a direct API call to get the latest job content
      const response = await fetch(`/api/read-implementation-plan/${jobId}`);
      
      console.log(`[refreshJobContent] API response status: ${response.status}`);
      
      if (response.ok) {
        const data = await response.json();
        console.log(`[refreshJobContent] Received data for job ${jobId}:`, {
          status: data.status,
          contentLength: data.content?.length || 0,
          hasContent: !!data.content,
          statusMessage: data.statusMessage
        });
        return data;
      } else {
        const errorText = await response.text();
        console.error(`[refreshJobContent] API error for job ${jobId}: ${response.status}`, errorText);
      }
    } catch (error) {
      console.error(`[refreshJobContent] Exception for job ${jobId}:`, error);
    }
    return null;
  }, []);

  // Handle job deletion - actually DELETES the job from the database
  const handleDelete = useCallback(async (jobId: string) => {
    setIsDeleting(prev => ({ ...prev, [jobId]: true }));
    
    try {
      // Immediately apply optimistic UI update BEFORE deleting from backend
      // This ensures user sees the change instantly
      setImplementationPlans(prev => prev.filter(plan => plan.id !== jobId));
      
      // Permanently delete the job from the database
      await deleteJob(jobId);
      
      toast({
        title: "Plan deleted",
        description: "Implementation plan has been permanently deleted",
        variant: "default"
      });
      
      // Refresh the jobs list to ensure everything is in sync
      await refreshPlans();
      
      // Double check to ensure the deleted job is removed from our local state
      setImplementationPlans(prev => prev.filter(plan => plan.id !== jobId));
      
    } catch (error) {
      console.error("Error deleting job:", error);
      toast({
        title: "Error",
        description: "Failed to delete implementation plan",
        variant: "destructive"
      });
      // If deletion failed, refresh to restore correct state
      await refreshPlans();
    } finally {
      setIsDeleting(prev => ({ ...prev, [jobId]: false }));
      setJobToDelete(null);
    }
  }, [deleteJob, refreshPlans]);

  // Check if project directory is available
  if (!projectDirectory) {
    return (
      <Card className="mt-6 shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-xl">Plans</CardTitle>
          <CardDescription className="text-balance">Select a project to view plans</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  // Only show the full loading state if it's the initial load and we have no plans yet
  const showLoadingIndicator = isLoading && !initialLoadComplete && implementationPlans.length === 0;

  return (
    <Card className="mt-6 shadow-sm">
      <CardHeader className="pb-3">
        <div className="flex justify-between items-start">
          <div>
            <CardTitle className="text-xl">Plans</CardTitle>
            <CardDescription className="text-balance">
              {implementationPlans.length > 0
                ? `${implementationPlans.length} plan${implementationPlans.length > 1 ? 's' : ''} for this ${sessionId ? 'session' : 'project'}`
                : `No plans available for this ${sessionId ? 'session' : 'project'} yet`}
            </CardDescription>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={refreshPlans}
            title="Refresh plans list"
            disabled={isLoading}
            className="flex items-center gap-1"
          >
            <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
            <span className="ml-1">Refresh</span>
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {showLoadingIndicator ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : implementationPlans.length === 0 ? (
          <div className="text-center text-muted-foreground py-8 text-balance">
            No plans for this {sessionId ? 'session' : 'project'} yet
          </div>
        ) : (
          <ScrollArea className="h-[600px] rounded-md border">
            <div className="space-y-4 p-4">
              {implementationPlans.map((plan) => (
                <div 
                  key={plan.id} 
                  className="border rounded-md shadow-sm hover:bg-muted/10 transition-colors cursor-pointer"
                  onClick={() => {
                    // Just open the regular job details modal
                    setJobForModal(plan);
                  }}
                >
                  <div className="flex justify-between items-center p-4">
                    <div className="flex-1">
                      {/* Display the plan title - using metadata.sessionName which contains our dynamic title */}
                      {plan.metadata?.sessionName && (
                        <h3 className="font-semibold text-base mb-2">{plan.metadata.sessionName}</h3>
                      )}
                      <div className="text-xs text-muted-foreground flex flex-wrap gap-4">
                        <span>Created {formatDistanceToNow(plan.createdAt, { addSuffix: true })}</span>
                        {plan.status === 'completed' && 
                          <span>Completed {formatDistanceToNow(plan.endTime || plan.createdAt, { addSuffix: true })}</span>
                        }
                        {plan.modelUsed && <span>{plan.modelUsed}</span>}
                        {plan.totalTokens > 0 && <span>{plan.totalTokens.toLocaleString()} tokens</span>}
                      </div>
                      {(plan.status === 'running' || plan.status === 'processing_stream') && (
                        <div className="text-xs font-medium text-blue-600 dark:text-blue-400 mt-1">
                          Status: Processing {plan.statusMessage && `- ${plan.statusMessage}`}
                        </div>
                      )}
                      {(plan.status === 'queued' || 
                         plan.status === 'preparing' || 
                         plan.status === 'idle' || 
                         plan.status === 'acknowledged_by_worker' || 
                         plan.status === 'preparing_input' || 
                         plan.status === 'generating_stream') && (
                        <div className="text-xs font-medium text-amber-600 dark:text-amber-400 mt-1">
                          Status: Processing {plan.statusMessage && `- ${plan.statusMessage}`}
                        </div>
                      )}
                      {(STREAMING_STATUSES.includes(plan.status) && plan.metadata?.isStreaming) && (
                        <div className="mt-2 w-full">
                          <Progress
                            value={getStreamingProgressValue(plan.metadata, plan.startTime, plan.maxOutputTokens)}
                            className="h-2 w-full"
                          />
                          {typeof plan.metadata.streamProgress === 'number' && (
                            <p className="text-[10px] text-muted-foreground mt-0.5 text-right">
                              {Math.floor(plan.metadata.streamProgress)}%
                            </p>
                          )}
                          {plan.statusMessage && (
                            <p className="text-[11px] text-blue-600 dark:text-blue-400 mt-1">
                              {plan.statusMessage}
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                      {(JOB_STATUSES.COMPLETED.includes(plan.status) || 
                         (STREAMING_STATUSES.includes(plan.status) && plan.metadata?.isStreaming)) && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-9 px-3"
                          onClick={(e) => {
                            e.stopPropagation();
                            // Open dedicated content modal
                            setPlanContentModal({plan, open: true});
                            // Reset any previous polling errors
                            setPollingError(null);
                            
                            // Set up polling for streaming updates
                            if (STREAMING_STATUSES.includes(plan.status) && plan.metadata?.isStreaming) {
                              // Clear any existing interval first
                              if (streamingUpdateInterval.current) {
                                clearInterval(streamingUpdateInterval.current);
                              }
                              
                              // Define a reusable polling function
                              const executePoll = async () => {
                                try {
                                  // Safety check - make sure we're still interested in this plan
                                  const currentPlan = planContentModal?.plan;
                                  if (!currentPlan || currentPlan.id !== plan.id) return;
                                  
                                  // Directly fetch the job content from the API instead of relying on context
                                  const response = await fetch(`/api/read-implementation-plan/${plan.id}`);
                                  if (response.ok) {
                                    // Clear any previous error when successful
                                    setPollingError(null);
                                    
                                    const data = await response.json();
                                    
                                    // Log what's coming back for debugging
                                    console.log(`[Streaming update] Job ${plan.id} status: ${data.status}, content length: ${data.content?.length || 0}, progress: ${data.streamProgress || 'unknown'}%`);
                                    
                                    // Update using functional state update to avoid stale closure issues
                                    setPlanContentModal(currentModalData => {
                                      if (!currentModalData || currentModalData.plan.id !== plan.id) {
                                        // Modal closed or plan changed, do nothing
                                        return currentModalData;
                                      }
                                      
                                      // Create a refreshed job object with the latest content
                                      const refreshedJob = {
                                        ...currentModalData.plan, // Use plan from current state
                                        response: data.content || '',
                                        statusMessage: data.statusMessage || currentModalData.plan.statusMessage,
                                        status: data.status || currentModalData.plan.status,
                                        metadata: {
                                          ...currentModalData.plan.metadata,
                                          streamProgress: data.streamProgress || currentModalData.plan.metadata?.streamProgress,
                                          responseLength: (data.content || '').length,
                                          isStreaming: STREAMING_STATUSES.includes(data.status),
                                        }
                                      };
                                      
                                      // Trigger a full job refresh to keep all panels in sync
                                      if (data.status !== currentModalData.plan.status) {
                                        console.log(`Job ${plan.id} status changed from ${currentModalData.plan.status} to ${data.status}, refreshing all jobs`);
                                        refreshJobs().catch(err => console.error("Error refreshing jobs after status change:", err));
                                      }
                                      
                                      return { plan: refreshedJob, open: true };
                                    });
                                    
                                    // Stop polling if job is no longer streaming
                                    if (!STREAMING_STATUSES.includes(data.status)) {
                                      console.log(`[Streaming complete] Job ${plan.id} status: ${data.status}`);
                                      if (streamingUpdateInterval.current) {
                                        clearInterval(streamingUpdateInterval.current);
                                        streamingUpdateInterval.current = null;
                                      }
                                    }
                                  } else {
                                    // Extract error information if possible
                                    let errorMessage = `Status: ${response.status}`;
                                    try {
                                      const errorData = await response.json();
                                      if (errorData.error) {
                                        errorMessage += ` - ${errorData.error}`;
                                      }
                                    } catch (e) {
                                      // Ignore parsing errors
                                    }
                                    
                                    console.error(`[Streaming error] API response issue: ${errorMessage}`);
                                    setPollingError(`Failed to fetch updates: ${errorMessage}`);
                                    
                                    // Only stop polling for 404 or after repeated 500 errors
                                    if (response.status === 404) {
                                      console.error('[Streaming error] Job not found, stopping updates');
                                      clearInterval(streamingUpdateInterval.current!);
                                      streamingUpdateInterval.current = null;
                                    } else if (response.status === 500) {
                                      // For 500 errors, use a backoff strategy
                                      console.warn(`[Streaming error] Server error (500), using exponential backoff`);
                                      
                                      // Track retry attempts
                                      const retryCount = planContentModal?.plan.metadata?.retryCount || 0;
                                      const newRetryCount = retryCount + 1;
                                      
                                      // Update metadata to track retry attempts
                                      setPlanContentModal(current => 
                                        current ? {
                                          ...current,
                                          plan: {
                                            ...current.plan,
                                            metadata: {
                                              ...current.plan.metadata,
                                              retryCount: newRetryCount
                                            }
                                          }
                                        } : null
                                      );
                                      
                                      // Calculate backoff time based on retry attempts (exponential backoff)
                                      const backoffTime = Math.min(2000 * Math.pow(1.5, Math.min(newRetryCount, 5)), 10000);
                                      
                                      console.log(`[Streaming recovery] Retry #${newRetryCount} with backoff time: ${backoffTime}ms`);
                                      
                                      // Continue polling but less frequently to reduce server load
                                      if (streamingUpdateInterval.current) {
                                        clearInterval(streamingUpdateInterval.current);
                                        // Just create a new interval with a longer timeout instead of
                                        // trying to reuse the callback from the old interval
                                        streamingUpdateInterval.current = setInterval(async () => {
                                          try {
                                            const response = await fetch(`/api/read-implementation-plan/${plan.id}`);
                                            if (response.ok) {
                                              // Success! Reset the error state and retry count
                                              setPollingError(null);
                                              const data = await response.json();
                                              
                                              console.log(`[Streaming recovery] Successful recovery after ${newRetryCount} retries`);
                                              
                                              // Only update if we're still showing the same plan
                                              setPlanContentModal(current => {
                                                if (current && current.plan.id === plan.id) {
                                                  return {
                                                    plan: {
                                                      ...current.plan,
                                                      response: data.content || current.plan.response || '',
                                                      statusMessage: data.statusMessage || current.plan.statusMessage,
                                                      status: data.status || current.plan.status,
                                                      metadata: {
                                                        ...current.plan.metadata,
                                                        streamProgress: data.streamProgress || current.plan.metadata?.streamProgress,
                                                        responseLength: (data.content || '').length,
                                                        isStreaming: STREAMING_STATUSES.includes(data.status),
                                                        retryCount: 0 // Reset retry count on success
                                                      }
                                                    },
                                                    open: true
                                                  };
                                                }
                                                return current;
                                              });
                                              
                                              // Restore normal polling interval after successful recovery
                                              if (streamingUpdateInterval.current) {
                                                clearInterval(streamingUpdateInterval.current);
                                                streamingUpdateInterval.current = setInterval(executePoll, 1000);
                                              }
                                            }
                                          } catch (err) {
                                            console.error("Error in backoff polling:", err);
                                          }
                                        }, backoffTime);
                                      }
                                    }
                                  }
                                } catch (err) {
                                  console.error("Error refreshing streaming plan data:", err);
                                  setPollingError(err instanceof Error ? err.message : 'Failed to fetch updates.');
                                  // Don't stop polling on network errors, they might be temporary
                                }
                              };
                              
                              // Start polling immediately
                              executePoll();
                              
                              // Set up the interval for regular polling
                              streamingUpdateInterval.current = setInterval(executePoll, 1000); // Poll every second
                            }
                          }}
                          title="View implementation plan content"
                        >
                          <Code className="h-4 w-4 mr-2" />
                          <span className="text-xs">
                            {STREAMING_STATUSES.includes(plan.status) && plan.metadata?.isStreaming ? 'View Streaming' : 'View Content'}
                          </span>
                        </Button>
                      )}
                      <Button 
                        variant="ghost" 
                        size="sm"
                        className="h-9 px-3"
                        onClick={(e) => {
                          e.stopPropagation(); // Prevent card click event
                          copyToClipboard(plan.response || "", plan.id);
                        }}
                        disabled={!plan.response || 
                                  plan.status === 'queued' || 
                                  plan.status === 'preparing' || 
                                  plan.status === 'idle' || 
                                  plan.status === 'acknowledged_by_worker'}
                        title="Copy plan content"
                      >
                        {copiedPlanId === plan.id ? (
                          <span className="text-xs">Copied!</span>
                        ) : (
                          <>
                            <ClipboardCopy className="h-4 w-4 mr-2" />
                            <span className="text-xs">Copy</span>
                          </>
                        )}
                      </Button>
                      
                      {/* Delete button for all plan statuses */}
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-9 px-3"
                        onClick={(e) => {
                          e.stopPropagation(); // Prevent card click event
                          setJobToDelete(plan);
                        }}
                        disabled={isDeleting[plan.id]}
                        title="Delete plan"
                      >
                        {isDeleting[plan.id] ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <>
                            <Trash2 className="h-4 w-4 mr-2 text-destructive" />
                            <span className="text-xs">Delete</span>
                          </>
                        )}
                      </Button>
                      
                      {/* View Live button removed and merged with View Content/Streaming button above */}
                      
                      {plan.status !== 'completed' && !(plan.status === 'running' && plan.metadata?.isStreaming) && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-9 px-3"
                          onClick={(e) => {
                            e.stopPropagation();
                            setJobForModal(plan);
                          }}
                          disabled={plan.status === 'queued' || 
                                    plan.status === 'preparing' || 
                                    plan.status === 'idle' || 
                                    plan.status === 'acknowledged_by_worker'}
                          title="View job details"
                        >
                          <Info className="h-4 w-4 mr-2" />
                          <span className="text-xs">Details</span>
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        )}
      </CardContent>
      
      {/* Modal for viewing implementation plan details */}
      {jobForModal && (
        <JobDetailsModal job={jobForModal} onClose={() => setJobForModal(null)} />
      )}

      {/* Dedicated modal for viewing plan content only */}
      {planContentModal && planContentModal.open && (
        <Dialog open={true} onOpenChange={(open) => {
          if (!open) {
            // Clear any streaming update interval when closing the modal
            if (streamingUpdateInterval.current) {
              clearInterval(streamingUpdateInterval.current);
              streamingUpdateInterval.current = null;
            }
            setPlanContentModal(null);
            setPollingError(null);
          }
        }}>
          <DialogContent className="max-w-5xl max-h-[95vh] h-[95vh] flex flex-col p-6">
            <DialogHeader className="flex flex-row items-center justify-between">
              <DialogTitle className="text-xl">Implementation Plan Content</DialogTitle>
              <Button 
                variant="ghost" 
                size="icon"
                onClick={() => {
                  // Clear any streaming update interval when closing the modal
                  if (streamingUpdateInterval.current) {
                    clearInterval(streamingUpdateInterval.current);
                    streamingUpdateInterval.current = null;
                  }
                  setPlanContentModal(null);
                  setPollingError(null);
                }}
                className="rounded-full h-8 w-8"
              >
                <X className="h-4 w-4" />
              </Button>
            </DialogHeader>
            
            <div className="flex justify-between items-center mb-2">
              {planContentModal.plan.status === 'running' && planContentModal.plan.metadata?.isStreaming && (
                <div className="flex items-center gap-2 text-blue-600 dark:text-blue-400">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span className="text-sm font-medium">
                    {planContentModal.plan.statusMessage || "Streaming in progress..."}
                  </span>
                </div>
              )}
              
              <div className="flex gap-2 ml-auto">
                {planContentModal.plan.status === 'running' && planContentModal.plan.metadata?.isStreaming && (
                  <Button
                    size="sm"
                    variant="outline" 
                    className="text-xs h-7 px-2 py-1 flex items-center gap-1"
                    onClick={async () => {
                      // Refresh content directly from API before copying
                      const refreshedData = await refreshJobContent(planContentModal.plan.id);
                      if (refreshedData?.content) {
                        // Clear any polling error on successful refresh
                        setPollingError(null);
                        // Update the modal with fresh content
                        setPlanContentModal(prev => prev ? {
                          ...prev,
                          plan: {
                            ...prev.plan,
                            response: refreshedData.content,
                            metadata: {
                              ...prev.plan.metadata,
                              streamProgress: refreshedData.streamProgress || prev.plan.metadata?.streamProgress
                            }
                          }
                        } : null);

                        console.log(`[Content refresh] Job ${planContentModal.plan.id}: Refreshed content, new length: ${refreshedData.content.length}`);

                        toast({
                          title: "Content refreshed",
                          description: `Latest content loaded (${refreshedData.content.length} characters)`,
                          duration: 2000
                        });
                      } else {
                        console.error(`[Content refresh] Job ${planContentModal.plan.id}: Failed to get content, data:`, refreshedData);
                        toast({
                          title: "Failed to refresh content",
                          description: "No content returned from server. Check console for details.",
                          variant: "destructive",
                          duration: 3000
                        });
                      }
                    }}
                  >
                    <RefreshCw className="h-3 w-3 mr-1" />
                    Refresh Now
                  </Button>
                )}
                <Button 
                  size="sm" 
                  variant="outline" 
                  className="text-xs h-7 px-2 py-1 flex items-center gap-1"
                  onClick={async () => {
                    if (planContentModal.plan.status === 'running' && planContentModal.plan.metadata?.isStreaming) {
                      // For streaming jobs, always get latest content directly from API
                      const refreshedData = await refreshJobContent(planContentModal.plan.id);
                      if (refreshedData?.content) {
                        navigator.clipboard.writeText(refreshedData.content);
                        toast({
                          title: "Copied to clipboard",
                          description: "Latest streaming content copied to clipboard",
                          duration: 2000
                        });
                        return;
                      }
                    }
                    
                    // Fall back to existing content
                    if (planContentModal.plan.response) {
                      navigator.clipboard.writeText(planContentModal.plan.response);
                      toast({
                        title: "Copied to clipboard",
                        description: "Implementation plan content copied to clipboard",
                        duration: 2000
                      });
                    }
                  }}
                  disabled={!planContentModal.plan.response}
              >
                <ClipboardCopy className="h-3 w-3 mr-1" />
                Copy content
              </Button>
              </div>
            </div>

            {planContentModal.plan.status === 'running' && planContentModal.plan.metadata?.isStreaming && (
              <div className="mb-3">
                <Progress
                  value={getStreamingProgressValue(
                    planContentModal.plan.metadata, 
                    planContentModal.plan.startTime, 
                    planContentModal.plan.maxOutputTokens
                  )}
                  className="h-2 w-full"
                />
                {typeof planContentModal.plan.metadata.streamProgress === 'number' && (
                  <p className="text-[10px] text-muted-foreground mt-0.5 text-right">
                    {Math.floor(planContentModal.plan.metadata.streamProgress)}%
                  </p>
                )}
              </div>
            )}

            {pollingError && (
              <Alert variant="destructive" className="mb-3">
                <AlertDescription>
                  {pollingError}
                </AlertDescription>
              </Alert>
            )}

            <div className="flex-grow overflow-auto bg-muted/10 rounded-md p-4 font-mono text-xs whitespace-pre-wrap">
              {planContentModal.plan.response 
                ? planContentModal.plan.response 
                : planContentModal.plan.status === 'completed' || planContentModal.plan.status === 'completed_by_tag'
                  ? <div className="flex flex-col gap-4">
                      <div className="text-amber-600 dark:text-amber-400">
                        No content available. The job status is '{planContentModal.plan.status}' but no response data was found.
                      </div>
                      <div className="text-muted-foreground text-xs">
                        Job ID: {planContentModal.plan.id}<br/>
                        Status: {planContentModal.plan.status}<br/>
                        Status Message: {planContentModal.plan.statusMessage || 'N/A'}<br/>
                        Response Length: {planContentModal.plan.response?.length || 0} chars<br/>
                        Created: {new Date(planContentModal.plan.createdAt).toLocaleString()}<br/>
                        {planContentModal.plan.endTime && `Completed: ${new Date(planContentModal.plan.endTime).toLocaleString()}`}
                      </div>
                      <div className="text-muted-foreground italic">
                        Try refreshing the content using the 'Refresh Now' button above, or check the database to ensure the job response was properly stored.
                      </div>
                    </div>
                  : "No content available yet. Content will appear as the implementation plan is generated."
              }
            </div>
          </DialogContent>
        </Dialog>
      )}
      
      {/* Confirmation dialog for deleting plans */}
      <AlertDialog open={!!jobToDelete} onOpenChange={(open) => !open && setJobToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure you want to delete this plan?</AlertDialogTitle>
            <AlertDialogDescription>
              <strong>This action cannot be undone.</strong> This will <strong>permanently delete</strong> the implementation plan
              {jobToDelete?.metadata?.sessionName && ` "${jobToDelete.metadata.sessionName}"`} from the database.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                if (jobToDelete) {
                  await handleDelete(jobToDelete.id);
                  // Refresh is already called in handleDelete
                }
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting[jobToDelete?.id || ''] ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Deleting...
                </>
              ) : (
                <>Delete</>  
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}