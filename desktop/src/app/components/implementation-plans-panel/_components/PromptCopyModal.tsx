"use client";

import { ClipboardCopy, Loader2 } from "lucide-react";
import React from "react";

import { Button } from "@/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/ui/dialog";
import { ScrollArea } from "@/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/ui/tabs";

interface PromptCopyModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  systemPrompt?: string;
  userPrompt?: string;
  combinedPrompt?: string;
  isLoading?: boolean;
  error?: string;
  sessionName?: string;
}

const PromptCopyModal: React.FC<PromptCopyModalProps> = ({
  open,
  onOpenChange,
  systemPrompt,
  userPrompt,
  combinedPrompt,
  isLoading = false,
  error,
  sessionName = "Implementation Plan",
}) => {
  const [copiedType, setCopiedType] = React.useState<string | null>(null);

  const handleCopy = async (text: string, type: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedType(type);
      setTimeout(() => setCopiedType(null), 2000);
    } catch (err) {
      console.error("Failed to copy text:", err);
    }
  };

  const renderCopyButton = (text: string | undefined, type: string, label: string) => (
    <Button
      variant="outline"
      size="sm"
      onClick={() => text && handleCopy(text, type)}
      disabled={!text || isLoading}
      className="flex items-center gap-2"
    >
      <ClipboardCopy className="h-3.5 w-3.5" />
      {copiedType === type ? "Copied!" : `Copy ${label}`}
    </Button>
  );

  const renderPromptContent = (content: string | undefined, placeholder: string) => (
    <ScrollArea className="h-[60vh] w-full border rounded-md bg-card p-4">
      <pre className="whitespace-pre-wrap text-sm font-mono">
        {content || placeholder}
      </pre>
    </ScrollArea>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="text-lg">
            View Implementation Plan Prompt: {sessionName}
          </DialogTitle>
        </DialogHeader>

        {isLoading && (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin mr-2" />
            <span>Loading prompt...</span>
          </div>
        )}

        {error && (
          <div className="bg-destructive/10 border border-destructive/20 rounded-md p-4 text-destructive">
            <p className="font-medium">Error loading prompt:</p>
            <p className="text-sm mt-1">{error}</p>
          </div>
        )}

        {!isLoading && !error && (
          <Tabs defaultValue="combined" className="flex-1 flex flex-col">
            <div className="flex justify-between items-center mb-4">
              <TabsList className="grid w-[400px] grid-cols-3">
                <TabsTrigger value="combined">Combined</TabsTrigger>
                <TabsTrigger value="system">System</TabsTrigger>
                <TabsTrigger value="user">User</TabsTrigger>
              </TabsList>

              <div className="flex gap-2">
                {renderCopyButton(systemPrompt, "system", "System")}
                {renderCopyButton(userPrompt, "user", "User")}
                {renderCopyButton(combinedPrompt, "combined", "Combined")}
              </div>
            </div>

            <TabsContent value="combined" className="flex-1">
              <div className="space-y-2">
                <h3 className="font-medium text-sm">Combined Prompt (System + User)</h3>
                {renderPromptContent(combinedPrompt, "Combined prompt not available")}
              </div>
            </TabsContent>

            <TabsContent value="system" className="flex-1">
              <div className="space-y-2">
                <h3 className="font-medium text-sm">System Prompt</h3>
                <p className="text-xs text-muted-foreground">
                  Instructions that guide the AI's behavior and approach
                </p>
                {renderPromptContent(systemPrompt, "System prompt not available")}
              </div>
            </TabsContent>

            <TabsContent value="user" className="flex-1">
              <div className="space-y-2">
                <h3 className="font-medium text-sm">User Prompt</h3>
                <p className="text-xs text-muted-foreground">
                  Task-specific context including description, files, and project structure
                </p>
                {renderPromptContent(userPrompt, "User prompt not available")}
              </div>
            </TabsContent>
          </Tabs>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default PromptCopyModal;