import { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";

import { type BackgroundJob } from "@/types/session-types";
import { Button } from "@/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/ui/collapsible";
import { ScrollArea } from "@/ui/scroll-area";
import { getParsedMetadata } from "../../utils";

interface JobDetailsMetadataSectionProps {
  job: BackgroundJob;
  formatMetadata: (metadata: string | Record<string, unknown> | null | undefined) => string;
  formatRegexPatterns: (regexData: string | Record<string, unknown> | null | undefined) => string | null;
}

export function JobDetailsMetadataSection({
  job,
  formatMetadata,
  formatRegexPatterns,
}: JobDetailsMetadataSectionProps) {
  const [isMetadataOpen, setIsMetadataOpen] = useState(false);
  const [showFullMetadata, setShowFullMetadata] = useState(false);
  const [showFullRegex, setShowFullRegex] = useState(false);
  
  const parsedMeta = getParsedMetadata(job.metadata);
  
  if (!parsedMeta || Object.keys(parsedMeta).length === 0) {
    return null;
  }

  const PREVIEW_CHARS = 300;
  const formattedMetadata = formatMetadata(parsedMeta);
  const isLongMetadata = formattedMetadata.length > PREVIEW_CHARS;
  const displayMetadata = showFullMetadata || !isLongMetadata 
    ? formattedMetadata 
    : formattedMetadata.substring(0, PREVIEW_CHARS) + "...";

  const formattedRegex = parsedMeta.regexData ? formatRegexPatterns(parsedMeta.regexData) : null;
  const isLongRegex = formattedRegex ? formattedRegex.length > PREVIEW_CHARS : false;
  const displayRegex = showFullRegex || !isLongRegex || !formattedRegex
    ? formattedRegex 
    : formattedRegex.substring(0, PREVIEW_CHARS) + "...";

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
            {parsedMeta.targetField && (
              <div>
                <div className="text-xs text-muted-foreground mb-1">Target Field</div>
                <div className="text-sm font-medium text-foreground">{parsedMeta.targetField}</div>
              </div>
            )}

            {/* Display regex patterns separately if they exist */}
            {parsedMeta.regexData && (
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
