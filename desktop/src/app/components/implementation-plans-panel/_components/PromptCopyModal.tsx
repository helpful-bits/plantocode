"use client";

import { Loader2 } from "lucide-react";
import React from "react";

import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/ui/tabs";
import { VirtualizedCodeViewer } from "@/ui/virtualized-code-viewer";

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


  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl max-h-[90vh] flex flex-col text-foreground !bg-card rounded-xl shadow-lg !backdrop-blur-none">
        <DialogHeader>
          <DialogTitle className="text-lg text-foreground">
            View Implementation Plan Prompt: {sessionName}
          </DialogTitle>
        </DialogHeader>

        {isLoading && (
          <div className="flex items-center justify-center py-8 text-foreground">
            <Loader2 className="h-6 w-6 animate-spin mr-2" />
            <span>Processing large prompt for display...</span>
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
            <div className="mb-4">
              <TabsList className="grid w-[400px] grid-cols-3">
                <TabsTrigger value="combined">Combined</TabsTrigger>
                <TabsTrigger value="system">System</TabsTrigger>
                <TabsTrigger value="user">User</TabsTrigger>
              </TabsList>
            </div>

            <TabsContent value="combined" className="flex-1">
              <div className="space-y-2">
                <h3 className="font-medium text-sm text-foreground">Combined Prompt (System + User)</h3>
                <VirtualizedCodeViewer
                  content={combinedPrompt || ""}
                  height="60vh"
                  showCopy={true}
                  copyText="Copy Combined"
                  showContentSize={true}
                  placeholder="Combined prompt not available"
                  language="markdown"
                />
              </div>
            </TabsContent>

            <TabsContent value="system" className="flex-1">
              <div className="space-y-2">
                <h3 className="font-medium text-sm text-foreground">System Prompt</h3>
                <p className="text-xs text-muted-foreground">
                  Instructions that guide the AI's behavior and approach
                </p>
                <VirtualizedCodeViewer
                  content={systemPrompt || ""}
                  height="60vh"
                  showCopy={true}
                  copyText="Copy System"
                  showContentSize={true}
                  placeholder="System prompt not available"
                  language="markdown"
                />
              </div>
            </TabsContent>

            <TabsContent value="user" className="flex-1">
              <div className="space-y-2">
                <h3 className="font-medium text-sm text-foreground">User Prompt</h3>
                <p className="text-xs text-muted-foreground">
                  Task-specific context including description, files, and project structure
                </p>
                <VirtualizedCodeViewer
                  content={userPrompt || ""}
                  height="60vh"
                  showCopy={true}
                  copyText="Copy User"
                  showContentSize={true}
                  placeholder="User prompt not available"
                  language="markdown"
                />
              </div>
            </TabsContent>
          </Tabs>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default PromptCopyModal;