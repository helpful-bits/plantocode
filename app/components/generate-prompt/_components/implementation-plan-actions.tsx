"use client";

import React, { useState, useEffect } from "react";
import { Loader2, ClipboardCopy, FileCode, Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useGeneratePrompt } from "../_contexts/generate-prompt-context";
import { useFileManagement } from "../_contexts/file-management-context";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { useNotification } from "@/lib/contexts/notification-context";
import { estimateTokens } from "@/lib/token-estimator";

/**
 * Reusable dialog component for displaying implementation plan prompts
 */
interface PlanPromptDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  planPrompt: string;
  onCopy: () => void;
}

const PlanPromptDialog: React.FC<PlanPromptDialogProps> = ({
  open,
  onOpenChange,
  planPrompt,
  onCopy
}) => {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center">
            <FileCode className="h-5 w-5 mr-2" />
            Implementation Plan Prompt
          </DialogTitle>
          <DialogDescription className="text-balance">
            This is the prompt that will be sent to the AI to generate an implementation plan.
          </DialogDescription>
        </DialogHeader>

        <div className="mt-4">
          <div className="flex justify-end mb-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                navigator.clipboard.writeText(planPrompt);
                onCopy();
              }}
              className="text-xs h-8"
            >
              <ClipboardCopy className="h-3.5 w-3.5 mr-2" />
              Copy to Clipboard
            </Button>
          </div>

          <pre className="bg-muted p-4 rounded-md overflow-auto whitespace-pre-wrap text-xs max-h-[70vh] border">
            {planPrompt || "Loading prompt..."}
          </pre>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export interface ImplementationPlanActionsProps {
  variant?: "default" | "compact";
  className?: string;
  disabled?: boolean;
}

/**
 * Shared component for implementation plan actions
 * 
 * Provides a reusable UI for implementation plan generation and management
 * with both default and compact display options
 */
export const ImplementationPlanActions: React.FC<ImplementationPlanActionsProps> = ({
  variant = "default",
  className = ""
}) => {
  const context = useGeneratePrompt();
  const fileState = useFileManagement();
  const { showNotification } = useNotification();
  
  // State for implementation plan prompts
  const [showPlanPromptDialog, setShowPlanPromptDialog] = useState(false);
  const [planPrompt, setPlanPrompt] = useState("");
  const [generatedPrompt, setGeneratedPrompt] = useState("");
  const [isGeneratingPrompt, setIsGeneratingPrompt] = useState(false);
  const [promptGeneratedAt, setPromptGeneratedAt] = useState<Date | null>(null);
  const [tokenEstimate, setTokenEstimate] = useState<number>(0);
  
  // Update token estimate when prompt changes
  useEffect(() => {
    const updateTokenCount = async () => {
      if (generatedPrompt) {
        const tokens = await estimateTokens(generatedPrompt);
        setTokenEstimate(tokens);
      } else {
        setTokenEstimate(0);
      }
    };
    
    updateTokenCount();
  }, [generatedPrompt]);
  
  // Extract values from context
  const {
    taskState,
    projectDirectory,
    activeSessionId,
    isCreatingPlan,
    planPromptCopySuccess,
    isCopyingPlanPrompt,
    handleCreateImplementationPlan,
    handleCopyImplementationPlanPrompt
  } = context;

  // Compute whether we can perform plan actions
  const canPerformPlanAction = Boolean(
    projectDirectory && 
    taskState.taskDescription.trim() && 
    fileState.includedPaths.length > 0 &&
    activeSessionId
  );
  
  // Log the action state for debugging
  useEffect(() => {
    console.log("[ImplementationPlanActions] Implementation plan action state:", {
      hasProjectDirectory: Boolean(projectDirectory),
      hasTaskDescription: Boolean(taskState.taskDescription.trim()),
      hasIncludedPaths: fileState.includedPaths.length > 0,
      hasActiveSession: Boolean(activeSessionId),
      canPerformPlanAction
    });
  }, [projectDirectory, taskState.taskDescription, fileState.includedPaths.length, activeSessionId, canPerformPlanAction]);
  
  // Handler for generating implementation plan prompt
  const handleGeneratePrompt = async () => {
    if (!projectDirectory || !taskState.taskDescription || fileState.includedPaths.length === 0) {
      showNotification({
        title: "Cannot Generate Prompt",
        message: "Please ensure you have a project directory, task description, and at least one file selected.",
        type: "error"
      });
      console.log("[ImplementationPlanActions] Cannot generate prompt:", {
        hasProjectDirectory: Boolean(projectDirectory),
        hasTaskDescription: Boolean(taskState.taskDescription),
        hasIncludedPaths: fileState.includedPaths.length > 0
      });
      return;
    }

    setIsGeneratingPrompt(true);
    try {
      // Use context's method to get implementation plan prompt
      const promptText = context.handleGetImplementationPlanPrompt
        ? await context.handleGetImplementationPlanPrompt(
            taskState.taskDescription,
            fileState.includedPaths,
            fileState.fileContentsMap
          )
        : null;

      if (promptText) {
        setGeneratedPrompt(promptText);
        setPromptGeneratedAt(new Date());
        showNotification({
          title: "Prompt Generated",
          message: "Implementation plan prompt has been generated successfully.",
          type: "success"
        });
      }
      // No need for error handling here as handleGetImplementationPlanPrompt already handles errors
    } catch (error) {
      console.error("[handleGeneratePrompt]", error);
      showNotification({
        title: "Error",
        message: error instanceof Error ? error.message : "Failed to generate plan prompt",
        type: "error"
      });
    } finally {
      setIsGeneratingPrompt(false);
    }
  };
  
  // Handler for viewing implementation plan prompt in a dialog
  const handleViewPlanPrompt = async () => {
    try {
      if (!projectDirectory || !taskState.taskDescription || fileState.includedPaths.length === 0) {
        showNotification({
          title: "Cannot Generate Prompt",
          message: "Please ensure you have a project directory, task description, and at least one file selected.",
          type: "error"
        });
        return;
      }

      setShowPlanPromptDialog(true);

      // Use context's method to get implementation plan prompt
      const promptText = context.handleGetImplementationPlanPrompt
        ? await context.handleGetImplementationPlanPrompt(
            taskState.taskDescription,
            fileState.includedPaths,
            fileState.fileContentsMap
          )
        : null;

      if (promptText) {
        setPlanPrompt(promptText);
      }
      // No need for additional error handling here as handleGetImplementationPlanPrompt already handles errors
    } catch (error) {
      console.error("[handleViewPlanPrompt]", error);
      showNotification({
        title: "Error",
        message: error instanceof Error ? error.message : "Failed to generate plan prompt",
        type: "error"
      });
    }
  };

  // Render the compact variant (for sidebars or limited space)
  if (variant === "compact") {
    return (
      <div className={`space-y-2 ${className}`}>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleViewPlanPrompt}
            disabled={!canPerformPlanAction}
            title="View the implementation plan prompt"
            className="flex-1"
          >
            <Eye className="h-3.5 w-3.5 mr-1.5" />
            View Plan Prompt
          </Button>
          
          <Button
            variant="outline"
            size="sm"
            onClick={() => handleCopyImplementationPlanPrompt(taskState.taskDescription, fileState.includedPaths, fileState.fileContentsMap)}
            disabled={!canPerformPlanAction}
            isLoading={isCopyingPlanPrompt}
            title="Copy the implementation plan prompt to the clipboard"
            className="flex-1"
          >
            {planPromptCopySuccess ? (
              <ClipboardCopy className="h-3.5 w-3.5 mr-1.5 text-green-500" />
            ) : (
              <ClipboardCopy className="h-3.5 w-3.5 mr-1.5" />
            )}
            {planPromptCopySuccess ? "Copied!" : "Copy Prompt"}
          </Button>
        </div>
        
        <Button
          variant="default"
          size="sm"
          onClick={() => handleCreateImplementationPlan(taskState.taskDescription, fileState.includedPaths, fileState.fileContentsMap)}
          disabled={!canPerformPlanAction}
          isLoading={isCreatingPlan}
          loadingText="Creating..."
          className="w-full"
        >
          <FileCode className="h-3.5 w-3.5 mr-1.5" />
          Create Implementation Plan
        </Button>
        
        {/* Plan prompt dialog */}
        <PlanPromptDialog
          open={showPlanPromptDialog}
          onOpenChange={setShowPlanPromptDialog}
          planPrompt={planPrompt}
          onCopy={() => {
            showNotification({
              title: "Copied!",
              message: "Implementation plan prompt copied to clipboard.",
              type: "success",
              clipboardFeedback: true
            });
          }}
        />
      </div>
    );
  }
  
  // Render the default variant (full featured)
  return (
    <div className={`bg-card p-6 rounded-lg border shadow-sm ${className}`}>
      <div>
        <h3 className="text-sm font-medium mb-3">Implementation Plans</h3>
        
        <Button
          variant="default"
          size="sm"
          onClick={handleGeneratePrompt}
          disabled={!canPerformPlanAction}
          isLoading={isGeneratingPrompt}
          loadingText="Generating Prompt..."
          title="Generate the implementation plan prompt"
          className="flex items-center justify-center w-full h-9"
        >
          <FileCode className="h-4 w-4 mr-2" />
          Generate Implementation Plan Prompt
        </Button>
      </div>
      
      <p className="text-xs text-muted-foreground mt-3 text-balance">
        Generates the detailed prompt used to create the implementation plan based on the task and selected files.
      </p>
      
      {/* Display the generated prompt */}
      {generatedPrompt && (
        <div className="mt-6 border-t pt-4">
          <div className="flex justify-between items-center mb-2">
            <div>
              {promptGeneratedAt && (
                <h4 className="text-sm font-medium">
                  {promptGeneratedAt.toLocaleString(undefined, {
                    year: 'numeric',
                    month: 'numeric',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                    second: '2-digit'
                  })}
                </h4>
              )}
              <p className="text-xs text-muted-foreground">
                ~{tokenEstimate.toLocaleString()} tokens estimated
              </p>
            </div>
            <Button 
              variant="outline" 
              size="sm"
              onClick={() => {
                navigator.clipboard.writeText(generatedPrompt);
                showNotification({
                  title: "Copied!",
                  message: "Implementation plan prompt copied to clipboard.",
                  type: "success",
                  clipboardFeedback: true
                });
              }}
              className="text-xs h-8"
            >
              <ClipboardCopy className="h-3.5 w-3.5 mr-2" />
              Copy
            </Button>
          </div>
          
          <pre className="bg-muted p-4 rounded-md overflow-auto whitespace-pre-wrap text-xs max-h-[300px] border">
            {generatedPrompt}
          </pre>
          
          <div className="mt-4">
            <Button
              variant="default"
              size="sm"
              onClick={() => handleCreateImplementationPlan(taskState.taskDescription, fileState.includedPaths, fileState.fileContentsMap)}
              isLoading={isCreatingPlan}
              loadingText="Creating Implementation Plan..."
              className="flex items-center justify-center w-full h-9 bg-blue-600 hover:bg-blue-700 text-white"
            >
              <FileCode className="h-4 w-4 mr-2" />
              Create Implementation Plan
            </Button>
          </div>
        </div>
      )}
      
      {/* Dialog for displaying the plan prompt */}
      <PlanPromptDialog
        open={showPlanPromptDialog}
        onOpenChange={setShowPlanPromptDialog}
        planPrompt={planPrompt}
        onCopy={() => {
          showNotification({
            title: "Copied!",
            message: "Implementation plan prompt copied to clipboard.",
            type: "success",
            clipboardFeedback: true
          });
        }}
      />
    </div>
  );
};

export default ImplementationPlanActions;