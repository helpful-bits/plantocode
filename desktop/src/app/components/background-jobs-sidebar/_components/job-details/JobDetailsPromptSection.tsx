import { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";

import { Button } from "@/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/ui/collapsible";
import { ScrollArea } from "@/ui/scroll-area";

interface JobDetailsPromptSectionProps {
  promptContent: string;
}

export function JobDetailsPromptSection({
  promptContent,
}: JobDetailsPromptSectionProps) {
  const [isPromptOpen, setIsPromptOpen] = useState(false);
  const [showFullPrompt, setShowFullPrompt] = useState(false);
  
  const PREVIEW_CHARS = 500;
  const isLongContent = promptContent.length > PREVIEW_CHARS;
  const displayContent = showFullPrompt || !isLongContent 
    ? promptContent 
    : promptContent.substring(0, PREVIEW_CHARS) + "...";

  return (
    <div className="bg-gray-50 dark:bg-muted/10 rounded-md">
      <Collapsible open={isPromptOpen} onOpenChange={setIsPromptOpen}>
        <CollapsibleTrigger asChild>
          <Button variant="ghost" className="w-full flex justify-between items-center p-5 rounded-md">
            <h4 className="font-semibold text-xs text-muted-foreground uppercase">
              Prompt
            </h4>
            {isPromptOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="px-5 pb-5">
            <ScrollArea className={`${showFullPrompt ? "max-h-[400px]" : "max-h-[200px]"}`}>
              <pre className="whitespace-pre-wrap font-mono text-xs text-balance w-full">
                {displayContent}
              </pre>
            </ScrollArea>
            {isLongContent && (
              <Button
                variant="ghost"
                size="sm"
                className="mt-2 text-xs h-6 px-2"
                onClick={() => setShowFullPrompt(!showFullPrompt)}
              >
                {showFullPrompt ? "Show Less" : "Show More"}
              </Button>
            )}
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}
