import { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/ui/collapsible";
import { VirtualizedCodeViewer } from "@/ui/virtualized-code-viewer";
import { useJobDetailsContext } from "../../_contexts/job-details-context";

export function JobDetailsPromptSection() {
  const { promptContent } = useJobDetailsContext();
  const [isPromptOpen, setIsPromptOpen] = useState(false);

  return (
    <Card>
      <Collapsible open={isPromptOpen} onOpenChange={setIsPromptOpen}>
        <CollapsibleTrigger asChild>
          <CardHeader className="py-4 cursor-pointer hover:bg-accent/50 transition-colors">
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
            <VirtualizedCodeViewer
              content={promptContent}
              height="50vh"
              showCopy={true}
              copyText="Copy Prompt"
              showContentSize={true}
              placeholder="No prompt content available"
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
