import { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/ui/collapsible";
import { useJobDetailsContext } from "../../_contexts/job-details-context";

export function JobDetailsMetadataSection() {
  const { parsedMetadata, formatMetadata, formatRegexPatterns } = useJobDetailsContext();
  const [isMetadataOpen, setIsMetadataOpen] = useState(false);
  
  const parsedMeta = parsedMetadata;
  
  if (!parsedMeta || Object.keys(parsedMeta).length === 0) {
    return null;
  }

  const formattedMetadata = formatMetadata(parsedMeta);

  // Access parsed JSON data from regex pattern generation
  const parsedJsonData = parsedMeta?.taskData?.parsedJsonData;
  const jsonValid = parsedMeta?.taskData?.jsonValid;
  
  const formattedRegex = parsedJsonData ? formatRegexPatterns(parsedJsonData) : null;

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
