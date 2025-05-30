import { useState } from "react";
import { ChevronDown, ChevronUp, Settings } from "lucide-react";

import { Button } from "@/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/ui/collapsible";
import { ScrollArea } from "@/ui/scroll-area";
import { Badge } from "@/ui/badge";
import { Alert } from "@/ui/alert";
import { BackgroundJob } from "@/types/session-types";
import { TaskType } from "@/types/system-prompts";
import { useSystemPrompt } from "@/hooks/use-system-prompts";
import { extractPlaceholders } from "@/actions/system-prompts.actions";

interface JobDetailsSystemPromptSectionProps {
  job: BackgroundJob;
}

export function JobDetailsSystemPromptSection({
  job,
}: JobDetailsSystemPromptSectionProps) {
  const [isPromptOpen, setIsPromptOpen] = useState(false);
  const [showFullPrompt, setShowFullPrompt] = useState(false);
  
  // Get the system prompt template from the database
  const { prompt, loading, error, isCustom } = useSystemPrompt({
    sessionId: job.sessionId,
    taskType: job.taskType as TaskType,
    autoLoad: isPromptOpen // Only load when opened
  });
  
  const PREVIEW_CHARS = 500;
  
  // Use the template from the database if available, otherwise fall back to the job prompt
  const templateContent = prompt?.systemPrompt || job.prompt;
  const isLongContent = templateContent.length > PREVIEW_CHARS;
  const displayContent = showFullPrompt || !isLongContent 
    ? templateContent 
    : templateContent.substring(0, PREVIEW_CHARS) + "...";
    
  const placeholders = extractPlaceholders(templateContent);
  const isTemplate = placeholders.length > 0;
  
  const getTaskTypeDisplayName = (taskType: string): string => {
    const displayNames: Record<string, string> = {
      'path_finder': 'Path Finder',
      'text_improvement': 'Text Improvement',
      'guidance_generation': 'Guidance Generation',
      'text_correction': 'Text Correction',
      'implementation_plan': 'Implementation Plan',
      'path_correction': 'Path Correction',
      'task_enhancement': 'Task Enhancement',
      'regex_pattern_generation': 'Regex Pattern Generation',
      'regex_summary_generation': 'Regex Summary Generation',
      'generic_llm_stream': 'Generic LLM Stream'
    };
    
    return displayNames[taskType] || taskType;
  };

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
                    Task Type: {getTaskTypeDisplayName(job.taskType)}
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
                  <ScrollArea className={`${showFullPrompt ? "max-h-[400px]" : "max-h-[200px]"}`}>
                    <pre className="whitespace-pre-wrap font-mono text-xs text-balance w-full text-foreground bg-muted/50 p-3 rounded border">
                      {displayContent}
                    </pre>
                  </ScrollArea>
                  {isLongContent && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-xs"
                      onClick={() => setShowFullPrompt(!showFullPrompt)}
                    >
                      {showFullPrompt ? "Show Less" : "Show More"}
                    </Button>
                  )}
                </div>
                
                {isTemplate && (
                  <div className="mt-4 p-3 bg-blue-50 rounded-lg border border-blue-200">
                    <div className="text-sm font-medium text-blue-900 mb-1">About This Template</div>
                    <div className="text-xs text-blue-800">
                      This is a template with placeholders that were replaced with actual values when the job ran. 
                      The placeholders shown above were substituted with task-specific data to create the final prompt.
                    </div>
                  </div>
                )}
                
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