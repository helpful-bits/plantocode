"use client";

import React, { useEffect, useState, useMemo, useCallback } from "react";
import { useBackgroundJobs } from '@/lib/contexts/background-jobs-context';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Progress } from "@/components/ui/progress";
import { ChevronDown, ClipboardCopy, Loader2, Info, Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatDistanceToNow } from "date-fns";
import { useProject } from '@/lib/contexts/project-context';
import { toast } from "@/components/ui/use-toast";
import { JOB_STATUSES, BackgroundJob } from "@/types/session-types";
import { JobDetailsModal } from "@/app/components/background-jobs-sidebar/JobDetailsModal";

interface ImplementationPlansPanelProps {
  sessionId?: string | null;
}

export function ImplementationPlansPanel({ sessionId }: ImplementationPlansPanelProps) {
  const { jobs, isLoading } = useBackgroundJobs();
  const { projectDirectory } = useProject();
  const [copiedPlanId, setCopiedPlanId] = useState<string | null>(null);
  const [initialLoadComplete, setInitialLoadComplete] = useState<boolean>(false);
  const [sessionNames, setSessionNames] = useState<Record<string, string>>({});
  const [jobForModal, setJobForModal] = useState<BackgroundJob | null>(null);
  const [openPlanIds, setOpenPlanIds] = useState<Record<string, boolean>>({});

  // Memoize the filtered and sorted implementation plans to prevent unnecessary re-renders
  const implementationPlans = useMemo(() => {
    if (!jobs || jobs.length === 0 || !projectDirectory) return [];

    // Filter jobs based on criteria - include both active and completed plans
    const filteredJobs = jobs.filter(job => 
      job.taskType === 'implementation_plan' && 
      (job.status === 'completed' || JOB_STATUSES.ACTIVE.includes(job.status)) &&
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
          'preparing': 1,
          'queued': 2,
          'idle': 3,
          'acknowledged_by_worker': 4
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

  const copyToClipboard = useCallback(async (text: string, jobId: string) => {
    try {
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
                <Collapsible 
                  key={plan.id} 
                  className="border rounded-md shadow-sm"
                  open={openPlanIds[plan.id] || false}
                  onOpenChange={(open) => {
                    setOpenPlanIds(prev => ({...prev, [plan.id]: open}));
                  }}
                >
                  <div className="flex justify-between items-center p-4 bg-muted/30">
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
                      {plan.status === 'running' && (
                        <div className="text-xs font-medium text-blue-600 dark:text-blue-400 mt-1">
                          Status: Running {plan.statusMessage && `- ${plan.statusMessage}`}
                        </div>
                      )}
                      {(plan.status === 'queued' || plan.status === 'preparing' || plan.status === 'idle' || plan.status === 'acknowledged_by_worker') && (
                        <div className="text-xs font-medium text-amber-600 dark:text-amber-400 mt-1">
                          Status: {plan.status.charAt(0).toUpperCase() + plan.status.slice(1)} {plan.statusMessage && `- ${plan.statusMessage}`}
                        </div>
                      )}
                      {plan.status === 'running' && plan.metadata?.isStreaming && (
                        <div className="mt-2 w-full">
                          <Progress
                            value={
                              // Calculate progress with improved handling 
                              typeof plan.metadata.streamProgress === 'number'
                                ? Math.min(plan.metadata.streamProgress, 98)
                                : typeof plan.metadata.responseLength === 'number' && 
                                  typeof plan.metadata.estimatedTotalLength === 'number' && 
                                  plan.metadata.estimatedTotalLength > 0
                                  ? Math.min((plan.metadata.responseLength / plan.metadata.estimatedTotalLength) * 100, 98)
                                  : plan.metadata.responseLength && plan.maxOutputTokens
                                    ? Math.min((plan.metadata.responseLength / (plan.maxOutputTokens * 3.5)) * 100, 98)
                                    : undefined
                            }
                            className="h-2 w-full"
                          />
                          {typeof plan.metadata.streamProgress === 'number' && (
                            <p className="text-[10px] text-muted-foreground mt-0.5 text-right">
                              {Math.floor(plan.metadata.streamProgress)}%
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <Button 
                        variant="ghost" 
                        size="sm"
                        className="h-9 px-3"
                        onClick={() => copyToClipboard(plan.response || "", plan.id)}
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
                      {plan.status === 'completed' ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-9 px-3"
                          onClick={() => setJobForModal(plan)}
                          title="View plan details"
                        >
                          <Eye className="h-4 w-4 mr-2" />
                          <span className="text-xs">View Details</span>
                        </Button>
                      ) : plan.status === 'running' && plan.metadata?.isStreaming ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-9 px-3"
                          onClick={() => setJobForModal(plan)}
                          title="View live streaming progress"
                        >
                          <Loader2 className="h-4 w-4 animate-spin mr-2" />
                          <span className="text-xs">View Live</span>
                        </Button>
                      ) : ( // For other non-completed, non-streaming-running statuses (queued, preparing, failed, etc.)
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-9 px-3"
                          onClick={() => setJobForModal(plan)}
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
                      <Button 
                        variant="ghost" 
                        size="sm"
                        className="h-9 px-3 flex items-center gap-1"
                        onClick={() => {
                          const newValue = !openPlanIds[plan.id];
                          setOpenPlanIds(prev => ({...prev, [plan.id]: newValue}));
                        }}
                      >
                        <ChevronDown className={`h-4 w-4 transition-transform duration-200 ${openPlanIds[plan.id] ? 'rotate-180' : ''}`} />
                        <span className="text-xs">
                          {openPlanIds[plan.id] ? 'Hide content' : 'Show content'}
                        </span>
                      </Button>
                    </div>
                  </div>
                  <CollapsibleContent>
                    <div className="p-6 pt-4">
                      {plan.status === 'running' && plan.metadata?.isStreaming ? (
                        <div className="py-3">
                          <div className="flex items-center gap-2 mb-3 text-blue-600 dark:text-blue-400 text-sm">
                            <Loader2 className="h-4 w-4 animate-spin" />
                            <span className="font-medium">Streaming live content...</span>
                          </div>
                          <pre className="whitespace-pre-wrap text-xs overflow-x-auto mt-3 py-5 px-5 bg-muted/30 rounded-md text-balance font-mono max-h-[800px] overflow-y-auto">
                            {plan.response || "Waiting for content..."}
                          </pre>
                        </div>
                      ) : plan.status === 'queued' || plan.status === 'preparing' || plan.status === 'idle' || plan.status === 'acknowledged_by_worker' ? (
                        <div className="py-3 flex flex-col items-center justify-center">
                          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground mb-3" />
                          <span className="text-muted-foreground text-sm font-medium">
                            {plan.statusMessage || `Plan is ${plan.status} for generation.`}
                          </span>
                        </div>
                      ) : plan.status === 'completed' ? (
                        <pre className="whitespace-pre-wrap text-xs overflow-x-auto py-5 px-5 text-balance font-mono bg-muted/10 rounded-md max-h-[800px] overflow-y-auto">
                          {plan.response || "No implementation plan content available."}
                        </pre>
                      ) : null}
                    </div>
                  </CollapsibleContent>
                </Collapsible>
              ))}
            </div>
          </ScrollArea>
        )}
      </CardContent>
      
      {/* Modal for viewing implementation plan details */}
      {jobForModal && (
        <JobDetailsModal job={jobForModal} onClose={() => setJobForModal(null)} />
      )}
    </Card>
  );
}