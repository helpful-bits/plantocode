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

// This component doesn't actually use the sessionId, but we keep the prop to maintain
// compatibility with other components that might pass it
interface ImplementationPlansPanelProps {
  sessionId?: string | null;
}

export function ImplementationPlansPanel({ sessionId }: ImplementationPlansPanelProps) {
  const { jobs, isLoading } = useBackgroundJobs();
  const { projectDirectory } = useProject();
  const [copiedPlanId, setCopiedPlanId] = useState<string | null>(null);
  const [isOpening, setIsOpening] = useState<string | null>(null);
  const [initialLoadComplete, setInitialLoadComplete] = useState<boolean>(false);
  const [sessionNames, setSessionNames] = useState<Record<string, string>>({});
  // State to track the file contents of plans
  const [planFileContents, setPlanFileContents] = useState<Record<string, { 
    content: string | null; 
    isLoading: boolean; 
    error: string | null 
  }>>({});

  // Memoize the filtered and sorted implementation plans to prevent unnecessary re-renders
  const implementationPlans = useMemo(() => {
    if (!jobs || jobs.length === 0 || !projectDirectory) return [];

    // Filter jobs based on criteria
    const filteredJobs = jobs.filter(job => 
      job.taskType === 'implementation_plan' && 
      job.status === 'completed' &&
      job.response && // Ensure we have content
      job.projectDirectory === projectDirectory // Filter by project directory instead of session
    );

    // Sort by created time, most recent first
    return [...filteredJobs].sort((a, b) => b.createdAt - a.createdAt);
  }, [jobs, projectDirectory]);

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

  // Function to fetch plan content from file
  const fetchPlanContent = useCallback(async (jobId: string, filePath: string, projDir: string) => {
    // Skip if already loading or loaded
    if (planFileContents[jobId]?.isLoading) return;
    
    // Set loading state
    setPlanFileContents(prev => ({
      ...prev,
      [jobId]: { content: null, isLoading: true, error: null }
    }));
    
    try {
      // Encode parameters for URL
      const encodedFilePath = encodeURIComponent(filePath);
      const encodedProjectDir = encodeURIComponent(projDir);
      
      console.log(`Fetching file content for path: ${filePath} in project: ${projDir}`);
      
      // Fetch file content from API
      const response = await fetch(`/api/read-file-content?filePath=${encodedFilePath}&projectDirectory=${encodedProjectDir}`);
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `Failed to load plan content: ${response.status}`);
      }
      
      const data = await response.json();
      
      // Update state with content
      setPlanFileContents(prev => ({
        ...prev,
        [jobId]: { content: data.content, isLoading: false, error: null }
      }));
    } catch (error) {
      console.error(`Error loading plan file for ${jobId}:`, error);
      
      // Update state with error
      setPlanFileContents(prev => ({
        ...prev,
        [jobId]: { 
          content: null, 
          isLoading: false, 
          error: error instanceof Error ? error.message : 'Failed to load plan content' 
        }
      }));
    }
  }, [planFileContents]);
  
  // Set initial load complete after first data load
  useEffect(() => {
    if (!isLoading && jobs.length > 0 && !initialLoadComplete) {
      setInitialLoadComplete(true);
    }
  }, [isLoading, jobs, initialLoadComplete]);
  
  // Load plan content from files when plans list changes
  useEffect(() => {
    if (!projectDirectory || implementationPlans.length === 0) return;
    
    // For each plan with an outputFilePath, fetch the content
    implementationPlans.forEach(plan => {
      if (
        plan.outputFilePath && 
        !planFileContents[plan.id]?.content && 
        !planFileContents[plan.id]?.isLoading
      ) {
        fetchPlanContent(plan.id, plan.outputFilePath, projectDirectory);
      }
    });
  }, [implementationPlans, projectDirectory, planFileContents, fetchPlanContent]);

  const copyToClipboard = useCallback(async (text: string, jobId: string) => {
    try {
      // Use file content if available, otherwise use the provided text
      const contentToCopy = planFileContents[jobId]?.content || text;
      
      await navigator.clipboard.writeText(contentToCopy);
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
  }, [planFileContents]);

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

  // Check if project directory is available
  if (!projectDirectory) {
    return (
      <Card className="mt-4">
        <CardHeader>
          <CardTitle>Implementation Plans</CardTitle>
          <CardDescription>Select a project to view implementation plans</CardDescription>
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
            : 'No implementation plans available for this project'}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {showLoadingIndicator ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : implementationPlans.length === 0 ? (
          <div className="text-center text-muted-foreground py-4">
            No implementation plans have been generated for this project yet.
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
                        {plan.sessionId && sessionNames[plan.sessionId] && ` in ${sessionNames[plan.sessionId]}`}
                      </div>
                      <div className="text-xs text-muted-foreground mt-1 truncate max-w-[240px]">
                        {plan.outputFilePath ? 
                          plan.outputFilePath.split('/').pop() : 
                          `plan_${new Date(plan.createdAt).getTime()}.xml`}
                      </div>
                    </div>
                    <div className="flex items-center space-x-2">
                      <Button 
                        variant="ghost" 
                        size="sm"
                        className="h-8 px-2"
                        onClick={() => copyToClipboard(plan.response || "", plan.id)}
                        disabled={!plan.response && !planFileContents[plan.id]?.content}
                        title={planFileContents[plan.id]?.content ? "Copy full plan contents" : "Copy placeholder response"}
                      >
                        {copiedPlanId === plan.id ? (
                          <span className="text-xs">Copied!</span>
                        ) : planFileContents[plan.id]?.isLoading ? (
                          <>
                            <Loader2 className="h-4 w-4 animate-spin mr-1" />
                            <span className="text-xs">Loading</span>
                          </>
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
                        onClick={() => {
                          // Try to get or generate a reasonable file path
                          let filePath = plan.outputFilePath;
                          
                          // Check the metadata first - might have path info even if outputFilePath is missing
                          if (!filePath && plan.metadata?.outputFilePath) {
                            filePath = plan.metadata.outputFilePath as string;
                          }
                          
                          // If still no path, construct one using timestamps and naming conventions
                          if (!filePath && projectDirectory) {
                            // Try a few different approaches to get the best filename
                            
                            // Option 1: Use timestamp from the job and sanitized prompt
                            const timestamp = new Date(plan.createdAt).toISOString().replace(/[:.]/g, '-');
                            const sanitizedPrompt = plan.prompt ? plan.prompt.slice(0, 30)
                              .replace(/[^\w\s-]/g, '')
                              .replace(/\s+/g, '-')
                              .toLowerCase() : 'unknown';
                            const planFileName = `plan_${timestamp}_${sanitizedPrompt}.xml`;
                            filePath = `${projectDirectory}/implementation_plans/${planFileName}`;
                            
                            // Generated path based on naming convention
                          }
                          
                          // Pass both the filePath and the XML content (as a fallback)
                          // This way if opening fails, we can still try to create the file
                          handleOpenFile(filePath, plan.id);
                        }}
                        disabled={isOpening === plan.id}
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
                      {planFileContents[plan.id]?.isLoading ? (
                        <div className="flex items-center justify-center py-4">
                          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground mr-2" />
                          <span className="text-muted-foreground">Loading plan content...</span>
                        </div>
                      ) : planFileContents[plan.id]?.error ? (
                        <div className="text-destructive py-2">
                          <p><strong>Error loading plan:</strong> {planFileContents[plan.id].error}</p>
                          <p className="text-xs text-muted-foreground mt-2">Showing placeholder response instead:</p>
                          <pre className="whitespace-pre-wrap text-sm overflow-x-auto mt-2 p-2 bg-muted/50 rounded">
                            {plan.response}
                          </pre>
                        </div>
                      ) : planFileContents[plan.id]?.content ? (
                        <pre className="whitespace-pre-wrap text-sm overflow-x-auto">
                          {planFileContents[plan.id].content}
                        </pre>
                      ) : (
                        <pre className="whitespace-pre-wrap text-sm overflow-x-auto">
                          {plan.response || "Loading plan content..."}
                        </pre>
                      )}
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