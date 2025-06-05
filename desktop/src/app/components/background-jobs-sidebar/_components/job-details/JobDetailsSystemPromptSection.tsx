import { useState, useMemo } from "react";
import { ChevronDown, ChevronUp, Settings } from "lucide-react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/ui/collapsible";
import { Badge } from "@/ui/badge";
import { Alert } from "@/ui/alert";
import { VirtualizedCodeViewer } from "@/ui/virtualized-code-viewer";
import { TaskType } from "@/types/session-types";
import { useSystemPrompt, getTaskTypeDisplayName } from "@/hooks/use-system-prompts";
import { extractPlaceholders } from "@/actions/system-prompts.actions";
import { supportsSystemPrompts } from "@/types/task-type-defs";
import { useJobDetailsContext } from "../../_contexts/job-details-context";

export function JobDetailsSystemPromptSection() {
  const { job } = useJobDetailsContext();
  // Don't render for task types that don't support system prompts
  if (!supportsSystemPrompts(job.taskType)) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">System Prompt Template</CardTitle>
          <CardDescription className="text-xs">
            System prompt sent to the AI model
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="text-sm text-muted-foreground">
            Not Applicable - This task type does not use system prompts
          </div>
        </CardContent>
      </Card>
    );
  }

  const [isPromptOpen, setIsPromptOpen] = useState(false);
  
  // Get the system prompt template from the database using job.systemPromptId if available
  const { prompt, loading, error, isCustom } = useSystemPrompt({
    sessionId: job.sessionId,
    taskType: job.taskType as TaskType,
    systemPromptId: job.systemPromptId, // Use the specific system prompt ID from the job
    autoLoad: isPromptOpen // Only load when opened
  });
  
  // Use the template from the database if available, otherwise fall back to the job prompt
  const templateContent = prompt?.systemPrompt || job.prompt;
    
  const placeholders = extractPlaceholders(templateContent);
  const isTemplate = placeholders.length > 0;
  
  // Calculate intelligent height based on content size with modal constraints
  const editorHeight = useMemo(() => {
    if (!templateContent) return "25vh";
    
    const lines = templateContent.split('\n').length;
    
    // Use viewport-relative units that respect modal constraints
    // Modal content area is calc(90vh - 150px), we need to be smaller
    if (lines <= 5) return "20vh";           // Short content
    if (lines <= 15) return "25vh";          // Medium content  
    if (lines <= 30) return "30vh";          // Long content
    return "35vh";                           // Very long content (max)
  }, [templateContent]);
  

  return (
    <Card>
      <Collapsible open={isPromptOpen} onOpenChange={setIsPromptOpen}>
        <CollapsibleTrigger asChild>
          <CardHeader className="py-4 cursor-pointer hover:bg-accent/50 transition-colors">
            <div className="flex justify-between items-center">
              <div>
                <CardTitle className="text-sm flex items-center gap-2">
                  System Prompt Template
                  {isTemplate && <Badge variant="outline" className="text-xs">Template</Badge>}
                  {isCustom && <Badge variant="secondary" className="text-xs">Custom</Badge>}
                </CardTitle>
                <CardDescription className="text-xs">
                  {isTemplate 
                    ? "Template with placeholders used for this job" 
                    : "System prompt sent to the AI model"
                  }
                </CardDescription>
              </div>
              {isPromptOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </div>
          </CardHeader>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <CardContent className="pt-0 space-y-4">
            {loading && (
              <div className="flex items-center justify-center py-4">
                <div className="animate-pulse text-sm text-muted-foreground">Loading system prompt...</div>
              </div>
            )}
            
            {error && (
              <Alert variant="destructive">
                Failed to load system prompt: {error}
              </Alert>
            )}
            
            {!loading && !error && (
              <>
                <div className="flex items-center justify-between">
                  <div className="text-sm font-medium">
                    Task Type: {getTaskTypeDisplayName(job.taskType as TaskType)}
                  </div>
                  {job.systemPromptId && (
                    <div className="text-xs text-muted-foreground">
                      ID: {job.systemPromptId.substring(0, 8)}...
                    </div>
                  )}
                </div>
                
                {placeholders.length > 0 && (
                  <div className="space-y-2">
                    <div className="text-sm font-medium">Placeholders Used:</div>
                    <div className="flex flex-wrap gap-1">
                      {placeholders.map((placeholder) => (
                        <Badge key={placeholder} variant="outline" className="text-xs font-mono">
                          {`{{${placeholder}}}`}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
                
                <div className="space-y-2">
                  <div className="text-sm font-medium">
                    {isTemplate ? "Template Content" : "Prompt Content"}
                  </div>
                  <VirtualizedCodeViewer
                    content={templateContent}
                    height={editorHeight}
                    showCopy={true}
                    copyText="Copy System Prompt"
                    showContentSize={true}
                    placeholder="No system prompt content available"
                    language="markdown"
                    virtualizationThreshold={30000}
                    warningThreshold={100000}
                    isLoading={loading}
                    className="border-border/60 bg-muted/30"
                  />
                </div>
                
                {isCustom && (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Settings className="h-3 w-3" />
                    This job used a custom system prompt instead of the default
                  </div>
                )}
              </>
            )}
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}