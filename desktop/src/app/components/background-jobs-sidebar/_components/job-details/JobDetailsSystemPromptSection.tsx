import { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/ui/collapsible";
import { VirtualizedCodeViewer } from "@/ui/virtualized-code-viewer";
import { Badge } from "@/ui/badge";
import { useJobDetailsContext } from "../../_contexts/job-details-context";

export function JobDetailsSystemPromptSection() {
  const { job } = useJobDetailsContext();
  const [isSystemPromptOpen, setIsSystemPromptOpen] = useState(false);

  // Return null if no system prompt template is available
  if (!job.systemPromptTemplate) {
    return null;
  }

  // Function to extract placeholders like {{FILE_CONTENTS}}
  const extractPlaceholders = (template: string): string[] => {
    const placeholderRegex = /\{\{([^}]+)\}\}/g;
    const placeholders: string[] = [];
    let match;

    while ((match = placeholderRegex.exec(template)) !== null) {
      placeholders.push(match[1]);
    }

    return [...new Set(placeholders)];
  };

  const placeholders = extractPlaceholders(job.systemPromptTemplate);

  return (
    <Card>
      <Collapsible open={isSystemPromptOpen} onOpenChange={setIsSystemPromptOpen}>
        <CollapsibleTrigger asChild>
          <CardHeader className="py-4 cursor-pointer hover:bg-accent/50 transition-colors">
            <div className="flex justify-between items-center">
              <div>
                <CardTitle className="text-sm">System Prompt Template</CardTitle>
                <CardDescription className="text-xs">
                  Original system prompt template with placeholders
                </CardDescription>
              </div>
              {isSystemPromptOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </div>
          </CardHeader>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <CardContent className="pt-0">
            {/* Show placeholders as badges */}
            {placeholders.length > 0 && (
              <div className="mb-4">
                <div className="text-xs text-muted-foreground mb-2">Template Placeholders:</div>
                <div className="flex flex-wrap gap-2">
                  {placeholders.map((placeholder, index) => (
                    <Badge 
                      key={index} 
                      variant="secondary" 
                      className="text-xs bg-primary/10 text-primary border-primary/20"
                    >
                      {placeholder}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            <VirtualizedCodeViewer
              content={job.systemPromptTemplate}
              height="60vh"
              showCopy={true}
              copyText="Copy System Prompt Template"
              showContentSize={true}
              placeholder="No system prompt template available"
              language="markdown"
              virtualizationThreshold={30000}
              warningThreshold={100000}
            />
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}