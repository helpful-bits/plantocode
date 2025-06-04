import { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";

import { Button } from "@/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/ui/collapsible";
import { ScrollArea } from "@/ui/scroll-area";
import { useJobDetailsContext } from "../../_contexts/job-details-context";

export function JobDetailsMetadataSection() {
  const { parsedMetadata, formatMetadata, formatRegexPatterns } = useJobDetailsContext();
  const [isMetadataOpen, setIsMetadataOpen] = useState(false);
  const [showFullMetadata, setShowFullMetadata] = useState(false);
  const [showFullRegex, setShowFullRegex] = useState(false);
  const [showFullPlanData, setShowFullPlanData] = useState(false);
  
  const parsedMeta = parsedMetadata;
  
  if (!parsedMeta || Object.keys(parsedMeta).length === 0) {
    return null;
  }

  const PREVIEW_CHARS = 300;
  const formattedMetadata = formatMetadata(parsedMeta);
  const isLongMetadata = formattedMetadata.length > PREVIEW_CHARS;
  const displayMetadata = showFullMetadata || !isLongMetadata 
    ? formattedMetadata 
    : formattedMetadata.substring(0, PREVIEW_CHARS) + "...";

  // Access parsed JSON data from regex pattern generation
  const parsedJsonData = parsedMeta?.additionalParams?.parsedJsonData;
  const jsonValid = parsedMeta?.additionalParams?.jsonValid;
  
  const formattedRegex = parsedJsonData ? formatRegexPatterns(parsedJsonData) : null;
  const isLongRegex = formattedRegex ? formattedRegex.length > PREVIEW_CHARS : false;
  const displayRegex = showFullRegex || !isLongRegex || !formattedRegex
    ? formattedRegex 
    : formattedRegex.substring(0, PREVIEW_CHARS) + "...";

  // Access implementation plan data
  const planData = parsedMeta?.additionalParams?.planData;
  const formattedPlanData = planData ? JSON.stringify(planData, null, 2) : null;
  const isLongPlanData = formattedPlanData ? formattedPlanData.length > PREVIEW_CHARS : false;
  const displayPlanData = showFullPlanData || !isLongPlanData || !formattedPlanData
    ? formattedPlanData 
    : formattedPlanData.substring(0, PREVIEW_CHARS) + "...";

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
            {parsedMeta?.additionalParams?.targetField ? (
              <div>
                <div className="text-xs text-muted-foreground mb-1">Target Field</div>
                <div className="text-sm font-medium text-foreground">{String(parsedMeta.additionalParams.targetField || '')}</div>
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
                <ScrollArea className={`${showFullRegex ? "max-h-[300px]" : "max-h-[150px]"}`}>
                  <pre className="whitespace-pre-wrap font-mono text-xs text-balance w-full p-2 bg-muted/20 rounded-md border border-border/60 text-foreground">
                    {displayRegex || 'No regex patterns found'}
                  </pre>
                </ScrollArea>
                {isLongRegex && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="mt-2 text-xs"
                    onClick={() => setShowFullRegex(!showFullRegex)}
                  >
                    {showFullRegex ? "Show Less" : "Show More"}
                  </Button>
                )}
              </div>
            )}

            {planData != null && (
              <div>
                <div className="text-xs text-muted-foreground mb-1">Implementation Plan Data</div>
                <ScrollArea className={`${showFullPlanData ? "max-h-[300px]" : "max-h-[150px]"}`}>
                  <pre className="whitespace-pre-wrap font-mono text-xs text-balance w-full p-2 bg-muted/20 rounded-md border border-border/60 text-foreground">
                    {displayPlanData || 'No implementation plan data found'}
                  </pre>
                </ScrollArea>
                {isLongPlanData && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="mt-2 text-xs"
                    onClick={() => setShowFullPlanData(!showFullPlanData)}
                  >
                    {showFullPlanData ? "Show Less" : "Show More"}
                  </Button>
                )}
              </div>
            )}

            {/* Other metadata */}
            <div>
              <div className="text-xs text-muted-foreground mb-1">Other Metadata</div>
              <ScrollArea className={`${showFullMetadata ? "max-h-[300px]" : "max-h-[150px]"}`}>
                <pre className="whitespace-pre-wrap font-mono text-xs text-balance w-full text-foreground">
                  {displayMetadata}
                </pre>
              </ScrollArea>
              {isLongMetadata && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="mt-2 text-xs"
                  onClick={() => setShowFullMetadata(!showFullMetadata)}
                >
                  {showFullMetadata ? "Show Less" : "Show More"}
                </Button>
              )}
            </div>
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}
