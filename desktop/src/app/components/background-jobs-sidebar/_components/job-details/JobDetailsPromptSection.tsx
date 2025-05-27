import { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";

import { Button } from "@/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/ui/card";
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
    <Card>
      <Collapsible open={isPromptOpen} onOpenChange={setIsPromptOpen}>
        <CollapsibleTrigger asChild>
          <CardHeader className="pb-3 cursor-pointer hover:bg-accent/50 transition-colors">
            <div className="flex justify-between items-center">
              <div>
                <CardTitle className="text-sm">Prompt</CardTitle>
                <CardDescription className="text-xs">
                  Input prompt sent to the AI model
                </CardDescription>
              </div>
              {isPromptOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </div>
          </CardHeader>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <CardContent className="pt-0">
            <ScrollArea className={`${showFullPrompt ? "max-h-[400px]" : "max-h-[200px]"}`}>
              <pre className="whitespace-pre-wrap font-mono text-xs text-balance w-full text-foreground">
                {displayContent}
              </pre>
            </ScrollArea>
            {isLongContent && (
              <Button
                variant="ghost"
                size="sm"
                className="mt-3 text-xs"
                onClick={() => setShowFullPrompt(!showFullPrompt)}
              >
                {showFullPrompt ? "Show Less" : "Show More"}
              </Button>
            )}
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}
