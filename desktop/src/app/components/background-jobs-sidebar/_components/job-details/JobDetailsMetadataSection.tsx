import { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";

import { type BackgroundJob } from "@/types/session-types";
import { Button } from "@/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/ui/collapsible";
import { ScrollArea } from "@/ui/scroll-area";

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
  
  if (!job.metadata || Object.keys(job.metadata).length === 0) {
    return null;
  }

  const PREVIEW_CHARS = 300;
  const formattedMetadata = formatMetadata(job.metadata);
  const isLongMetadata = formattedMetadata.length > PREVIEW_CHARS;
  const displayMetadata = showFullMetadata || !isLongMetadata 
    ? formattedMetadata 
    : formattedMetadata.substring(0, PREVIEW_CHARS) + "...";

  const formattedRegex = job.metadata.regexPatterns ? formatRegexPatterns(job.metadata.regexPatterns) : null;
  const isLongRegex = formattedRegex ? formattedRegex.length > PREVIEW_CHARS : false;
  const displayRegex = showFullRegex || !isLongRegex || !formattedRegex
    ? formattedRegex 
    : formattedRegex.substring(0, PREVIEW_CHARS) + "...";

  return (
    <div className="bg-gray-50 dark:bg-muted/10 rounded-md">
      <Collapsible open={isMetadataOpen} onOpenChange={setIsMetadataOpen}>
        <CollapsibleTrigger asChild>
          <Button variant="ghost" className="w-full flex justify-between items-center p-5 rounded-md">
            <h4 className="font-semibold text-xs text-muted-foreground uppercase">
              Metadata
            </h4>
            {isMetadataOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="px-5 pb-5">
            {job.metadata.targetField && (
              <div className="mb-3">
                <h5 className="text-xs text-muted-foreground mb-1">Target Field</h5>
                <p className="text-sm font-medium">{job.metadata.targetField}</p>
              </div>
            )}

            {/* Display regex patterns separately if they exist */}
            {job.metadata.regexPatterns && (
              <div className="mb-3">
                <h5 className="text-xs text-muted-foreground mb-1">Regex Patterns</h5>
                <ScrollArea className={`${showFullRegex ? "max-h-[300px]" : "max-h-[150px]"}`}>
                  <pre className="whitespace-pre-wrap font-mono text-xs text-balance w-full p-2 bg-muted/20 rounded-md">
                    {displayRegex || 'No regex patterns found'}
                  </pre>
                </ScrollArea>
                {isLongRegex && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="mt-2 text-xs h-6 px-2"
                    onClick={() => setShowFullRegex(!showFullRegex)}
                  >
                    {showFullRegex ? "Show Less" : "Show More"}
                  </Button>
                )}
              </div>
            )}

            {/* Other metadata */}
            <div className="mb-3">
              <h5 className="text-xs text-muted-foreground mb-1">Other Metadata</h5>
              <ScrollArea className={`${showFullMetadata ? "max-h-[300px]" : "max-h-[150px]"}`}>
                <pre className="whitespace-pre-wrap font-mono text-xs text-balance w-full">
                  {displayMetadata}
                </pre>
              </ScrollArea>
              {isLongMetadata && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="mt-2 text-xs h-6 px-2"
                  onClick={() => setShowFullMetadata(!showFullMetadata)}
                >
                  {showFullMetadata ? "Show Less" : "Show More"}
                </Button>
              )}
            </div>
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}
