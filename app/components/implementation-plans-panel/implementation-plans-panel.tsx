"use client";

import React, { useEffect, useState, useMemo, useCallback } from "react";
import { useBackgroundJobs } from '@/lib/contexts/background-jobs-context';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronDown, ClipboardCopy, FileText, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatDistanceToNow } from "date-fns";
import { useProject } from '@/lib/contexts/project-context';
import { toast } from "@/components/ui/use-toast";

interface ImplementationPlansPanelProps {
  sessionId: string | null;
}

export function ImplementationPlansPanel({ sessionId }: ImplementationPlansPanelProps) {
  const { jobs, isLoading } = useBackgroundJobs();
  const { projectDirectory } = useProject();
  const [copiedPlanId, setCopiedPlanId] = useState<string | null>(null);
  const [isOpening, setIsOpening] = useState<string | null>(null);
  const [initialLoadComplete, setInitialLoadComplete] = useState<boolean>(false);

  // Memoize the filtered and sorted implementation plans to prevent unnecessary re-renders
  const implementationPlans = useMemo(() => {
    if (!sessionId || !jobs || jobs.length === 0) return [];

    // Filter jobs based on criteria
    const filteredJobs = jobs.filter(job => 
      job.sessionId === sessionId && 
      job.taskType === 'xml_generation' && 
      job.status === 'completed' &&
      job.response // Ensure we have content
    );

    // Sort by created time, most recent first
    return [...filteredJobs].sort((a, b) => b.createdAt - a.createdAt);
  }, [jobs, sessionId]);

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
    }
  }, []);

  const handleOpenFile = useCallback(async (filePath: string | null, planId: string) => {
    if (!filePath || !projectDirectory) {
      toast({
        title: "Error",
        description: "Unable to open file: File path or project directory is missing",
        variant: "destructive",
      });
      return;
    }

    setIsOpening(planId);
    
    try {
      const response = await fetch('/api/open-in-ide', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          filePath,
          projectDirectory
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to open file');
      }

      toast({
        title: "Success",
        description: "File opened in configured editor",
      });
    } catch (error) {
      console.error("Error opening file:", error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to open file",
        variant: "destructive",
      });
    } finally {
      setIsOpening(null);
    }
  }, [projectDirectory]);

  // If no session is selected
  if (!sessionId) {
    return (
      <Card className="mt-4">
        <CardHeader>
          <CardTitle>Implementation Plans</CardTitle>
          <CardDescription>Select a session to view implementation plans</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  // Only show the full loading state if it's the initial load and we have no plans yet
  const showLoadingIndicator = isLoading && !initialLoadComplete && implementationPlans.length === 0;

  return (
    <Card className="mt-4">
      <CardHeader>
        <CardTitle>Implementation Plans</CardTitle>
        <CardDescription>
          {implementationPlans.length > 0 
            ? `${implementationPlans.length} implementation plan${implementationPlans.length > 1 ? 's' : ''} available`
            : 'No implementation plans available for this session'}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {showLoadingIndicator ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : implementationPlans.length === 0 ? (
          <div className="text-center text-muted-foreground py-4">
            No implementation plans have been generated for this session yet.
          </div>
        ) : (
          <ScrollArea className="h-[400px] rounded-md border">
            <div className="space-y-4 p-4">
              {implementationPlans.map((plan) => (
                <Collapsible key={plan.id} className="border rounded-md">
                  <div className="flex justify-between items-center p-3 bg-muted/50">
                    <div className="flex-1">
                      <div className="font-medium">Implementation Plan</div>
                      <div className="text-xs text-muted-foreground">
                        Created {formatDistanceToNow(plan.createdAt, { addSuffix: true })}
                      </div>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Button 
                        variant="ghost" 
                        size="sm"
                        className="h-8 px-2"
                        onClick={() => plan.response && copyToClipboard(plan.response, plan.id)}
                      >
                        {copiedPlanId === plan.id ? (
                          <span className="text-xs">Copied!</span>
                        ) : (
                          <>
                            <ClipboardCopy className="h-4 w-4 mr-1" />
                            <span className="text-xs">Copy</span>
                          </>
                        )}
                      </Button>
                      <Button 
                        variant="ghost" 
                        size="sm"
                        className="h-8 px-2"
                        onClick={() => handleOpenFile(plan.xmlPath, plan.id)}
                        disabled={!plan.xmlPath || isOpening === plan.id}
                      >
                        {isOpening === plan.id ? (
                          <Loader2 className="h-4 w-4 animate-spin mr-1" />
                        ) : (
                          <>
                            <FileText className="h-4 w-4 mr-1" />
                            <span className="text-xs">Open</span>
                          </>
                        )}
                      </Button>
                      <CollapsibleTrigger className="h-8 w-8 rounded-md flex items-center justify-center hover:bg-accent">
                        <ChevronDown className="h-4 w-4" />
                      </CollapsibleTrigger>
                    </div>
                  </div>
                  <CollapsibleContent>
                    <div className="p-4">
                      <pre className="whitespace-pre-wrap text-sm overflow-x-auto">
                        {plan.response}
                      </pre>
                    </div>
                  </CollapsibleContent>
                </Collapsible>
              ))}
            </div>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
} 