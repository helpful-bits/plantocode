import { useState } from "react";
import { ChevronDown, ChevronUp, Copy, Check } from "lucide-react";
import { useNotification } from "@/contexts/notification-context";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/ui/collapsible";
import { Button } from "@/ui/button";
import { useJobDetailsContext } from "../../_contexts/job-details-context";

// Simple copy button component for prompt content
function PromptCopyButton({ content }: { content: string }) {
  const [isCopied, setIsCopied] = useState(false);
  const { showNotification } = useNotification();

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(content);
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
      
      showNotification({
        title: "Copied to clipboard",
        message: "Prompt content copied successfully",
        type: "success",
        duration: 2000,
      });
    } catch (err) {
      console.error("Failed to copy to clipboard:", err);
      showNotification({
        title: "Copy failed", 
        message: "Failed to copy to clipboard",
        type: "error",
        duration: 3000,
      });
    }
  };

  return (
    <Button
      variant="outline"
      size="sm"
      className="text-xs h-7 px-2 py-1"
      onClick={handleCopy}
      title="Copy prompt content"
    >
      {isCopied ? (
        <>
          <Check className="mr-1 h-3 w-3" />
          Copied
        </>
      ) : (
        <>
          <Copy className="mr-1 h-3 w-3" />
          Copy Prompt
        </>
      )}
    </Button>
  );
}

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
            <div className="relative">
              <div className="absolute top-2 right-2 z-10">
                <PromptCopyButton content={promptContent} />
              </div>
              <pre className="whitespace-pre-wrap font-mono text-xs text-balance w-full p-4 pr-20 bg-muted/20 rounded-md border border-border/60 text-foreground overflow-auto max-h-[60vh]">
                {promptContent || "No prompt content available"}
              </pre>
            </div>
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}
