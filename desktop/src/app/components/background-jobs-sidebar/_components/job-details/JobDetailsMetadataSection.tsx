import { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/ui/collapsible";
import { useJobDetailsContext } from "../../_contexts/job-details-context";

export function JobDetailsMetadataSection() {
  const { parsedMetadata } = useJobDetailsContext();
  const [isMetadataOpen, setIsMetadataOpen] = useState(false);
  
  const parsedMeta = parsedMetadata;
  
  if (!parsedMeta || Object.keys(parsedMeta).length === 0) {
    return null;
  }

  // Display structured metadata directly - no complex formatting needed
  const formattedMetadata = parsedMeta ? JSON.stringify(parsedMeta, null, 2) : "None";

  // Access parsed JSON data from regex pattern generation
  const parsedJsonData = parsedMeta?.taskData?.parsedJsonData;
  const jsonValid = parsedMeta?.taskData?.jsonValid;
  
  // Format regex patterns directly here
  const formattedRegex = (() => {
    if (!parsedJsonData) return null;
    
    try {
      let data: Record<string, any>;
      
      if (typeof parsedJsonData === "string") {
        try {
          data = JSON.parse(parsedJsonData) as Record<string, any>;
        } catch (_e) {
          return "Regex data not available or not valid JSON.";
        }
      } else if (parsedJsonData && typeof parsedJsonData === "object") {
        data = parsedJsonData as Record<string, any>;
      } else {
        return "Regex data not available or not valid JSON.";
      }
      
      const cleanPatterns = [
        data.pathPattern && `Path: ${data.pathPattern}`,
        data.contentPattern && `Content: ${data.contentPattern}`,
        data.negativePathPattern && `Negative Path: ${data.negativePathPattern}`,
        data.negativeContentPattern && `Negative Content: ${data.negativeContentPattern}`,
      ].filter(Boolean);

      if (cleanPatterns.length > 0) {
        return cleanPatterns.join("\n");
      }

      return "No regex patterns found. Expected clean 4-pattern structure.";
    } catch (e) {
      console.error("Error formatting regex patterns:", e);
      return "Regex data not available or not valid JSON.";
    }
  })();

  // Access implementation plan data
  const planData = parsedMeta?.taskData?.planData;
  const formattedPlanData = planData ? JSON.stringify(planData, null, 2) : null;

  return (
    <Card>
      <Collapsible open={isMetadataOpen} onOpenChange={setIsMetadataOpen}>
        <CollapsibleTrigger asChild>
          <CardHeader className="py-4 cursor-pointer hover:bg-accent/50 transition-colors">
            <div className="flex justify-between items-center">
              <div>
                <CardTitle className="text-sm">Metadata</CardTitle>
                <CardDescription className="text-xs">
                  Additional job configuration and debug information
                </CardDescription>
              </div>
              {isMetadataOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </div>
          </CardHeader>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <CardContent className="pt-0 space-y-3">
            {parsedMeta?.taskData?.targetField ? (
              <div>
                <div className="text-xs text-muted-foreground mb-1">Target Field</div>
                <div className="text-sm font-medium text-foreground">{String(parsedMeta.taskData.targetField || '')}</div>
              </div>
            ) : null}

            {jsonValid != null && (
              <div>
                <div className="text-xs text-muted-foreground mb-1">JSON Parsing Status</div>
                <div className={`text-sm font-medium ${jsonValid ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                  {jsonValid ? 'Valid JSON' : 'Invalid JSON'}
                </div>
              </div>
            )}

            {parsedJsonData != null && (
              <div>
                <div className="text-xs text-muted-foreground mb-1">Regex Patterns</div>
                <pre className="whitespace-pre-wrap font-mono text-xs text-balance w-full p-2 bg-muted/20 rounded-md border border-border/60 text-foreground">
                  {formattedRegex || 'No regex patterns found'}
                </pre>
              </div>
            )}

            {planData != null && (
              <div>
                <div className="text-xs text-muted-foreground mb-1">Implementation Plan Data</div>
                <pre className="whitespace-pre-wrap font-mono text-xs text-balance w-full p-2 bg-muted/20 rounded-md border border-border/60 text-foreground">
                  {formattedPlanData || 'No implementation plan data found'}
                </pre>
              </div>
            )}

            {(() => {
              const executedPrompts = parsedMeta?.executedPrompts;
              if (executedPrompts && Array.isArray(executedPrompts) && executedPrompts.length > 0) {
                return (
                  <Collapsible>
                    <CollapsibleTrigger className="flex items-center gap-2 text-sm font-medium mb-2">
                      <ChevronDown className="h-4 w-4" />
                      Executed Prompts ({executedPrompts.length})
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      <div className="space-y-3 mt-2">
                        {executedPrompts.map((prompt: unknown, index: number) => (
                          <Card key={index} className="p-3">
                            <pre className="whitespace-pre-wrap text-xs">{String(prompt)}</pre>
                          </Card>
                        ))}
                      </div>
                    </CollapsibleContent>
                  </Collapsible>
                );
              }
              return null;
            })()}

            {/* Other metadata */}
            <div>
              <div className="text-xs text-muted-foreground mb-1">Other Metadata</div>
              <pre className="whitespace-pre-wrap font-mono text-xs text-balance w-full text-foreground">
                {formattedMetadata}
              </pre>
            </div>
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}
