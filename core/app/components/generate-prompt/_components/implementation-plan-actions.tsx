"use client";

import React, { useState, useEffect } from "react";
import { Loader2, ClipboardCopy, FileCode, Eye } from "lucide-react";
import { Button } from "@core/components/ui/button";
import { useGeneratePrompt } from "../_contexts/generate-prompt-context";
import { useFileManagement } from "../_contexts/file-management-context";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@core/components/ui/dialog";
import { useNotification } from "@core/lib/contexts/notification-context";
import { estimateTokens } from "@core/lib/token-estimator";
import { useToast } from "@core/components/ui/use-toast";

/**
 * Reusable dialog component for displaying implementation plan prompts
 */
interface PlanPromptDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  planPrompt: string;
}

const PlanPromptDialog: React.FC<PlanPromptDialogProps> = ({
  open,
  onOpenChange,
  planPrompt
}) => {
  const { toast } = useToast();

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(planPrompt);
      toast({
        title: "Prompt Copied",
        description: "System + User Prompt copied to clipboard.",
        variant: "success"
      });
    } catch (error) {
      toast({
        title: "Copy Failed",
        description: "Could not copy prompt to clipboard.",
        variant: "destructive"
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center">
            <FileCode className="h-5 w-5 mr-2" />
            Implementation Plan Prompt
          </DialogTitle>
          <DialogDescription className="text-balance">
            This is the complete prompt (system + user) that will be sent to the AI to generate an implementation plan.
          </DialogDescription>
        </DialogHeader>

        <div className="mt-4">
          <div className="flex justify-end mb-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleCopy}
              className="text-xs h-8"
            >
              <ClipboardCopy className="h-3.5 w-3.5 mr-2" />
              Copy to Clipboard
            </Button>
          </div>

          <pre className="bg-muted p-4 rounded-md overflow-auto whitespace-pre-wrap text-xs max-h-[70vh] border mb-2">
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
  const { toast } = useToast();

  // State for implementation plan prompts
  const [showPlanPromptDialog, setShowPlanPromptDialog] = useState(false);
  const [planPrompt, setPlanPrompt] = useState("");


  // Extract values from context
  const {
    taskState,
    projectDirectory,
    activeSessionId,
    isCreatingPlan,
    planCreationState,
    isCopyingPlanPrompt,
    isEstimatingTokens,
    estimatedTokens,
    handleCreateImplementationPlan,
    handleCopyImplementationPlanPrompt,
    handleEstimatePlanTokens
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
  
  // Trigger token estimation with a debounce when task description or file selection changes
  useEffect(() => {
    if (canPerformPlanAction && taskState.taskDescription && fileState.includedPaths.length > 0) {
      // Use a longer debounce (1200ms) to reduce frequency of calls and server load
      const timer = setTimeout(() => {
        handleEstimatePlanTokens(taskState.taskDescription, fileState.includedPaths);
      }, 1200);
      
      return () => clearTimeout(timer);
    }
  }, [taskState.taskDescription, fileState.includedPaths, canPerformPlanAction, handleEstimatePlanTokens]);
  
  
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
            fileState.includedPaths
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
            onClick={async () => {
              await handleCopyImplementationPlanPrompt(
                taskState.taskDescription,
                fileState.includedPaths
              );
            }}
            disabled={!canPerformPlanAction}
            isLoading={isCopyingPlanPrompt}
            title="Copy the implementation plan prompt to the clipboard"
            className="flex-1"
          >
            <ClipboardCopy className="h-3.5 w-3.5 mr-1.5" />
            Copy Prompt
          </Button>
        </div>
        
        <div className="text-xs text-muted-foreground text-center h-4">
          Estimated tokens: {estimatedTokens !== null ? estimatedTokens.toLocaleString() : "0"}
        </div>

        <Button
          variant="default"
          size="sm"
          onClick={() => handleCreateImplementationPlan(taskState.taskDescription, fileState.includedPaths)}
          disabled={!canPerformPlanAction}
          isLoading={isCreatingPlan || planCreationState === 'submitted'}
          loadingText={
            planCreationState === 'submitting' 
              ? "Submitting..." 
              : planCreationState === 'submitted' 
                ? "Plan generation started in the background!" 
                : undefined
          }
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
        />
      </div>
    );
  }
  
  // Render the default variant (simplified)
  return (
    <div className={`bg-card p-6 rounded-lg border shadow-sm ${className}`}>
      <div>
        <h3 className="text-sm font-medium mb-3">Implementation Plans</h3>

        <div className="text-xs text-muted-foreground mb-2 h-4">
          Estimated tokens: {estimatedTokens !== null ? estimatedTokens.toLocaleString() : "0"}
        </div>

        <Button
          variant="default"
          size="sm"
          onClick={() => handleCreateImplementationPlan(taskState.taskDescription, fileState.includedPaths)}
          disabled={!canPerformPlanAction}
          isLoading={isCreatingPlan || planCreationState === 'submitted'}
          loadingText={
            planCreationState === 'submitting' 
              ? "Submitting..." 
              : planCreationState === 'submitted' 
                ? "Plan generation started in the background!" 
                : undefined
          }
          className="flex items-center justify-center w-full h-9"
        >
          <FileCode className="h-4 w-4 mr-2" />
          Create Implementation Plan
        </Button>
      </div>

      <p className="text-xs text-muted-foreground mt-3 text-balance">
        Creates an implementation plan based on your task description and selected files.
      </p>

      <div className="mt-4 flex gap-3 justify-end">
        <Button
          variant="outline"
          size="sm"
          onClick={handleViewPlanPrompt}
          disabled={!canPerformPlanAction}
          title="View the implementation plan prompt"
        >
          <Eye className="h-3.5 w-3.5 mr-1.5" />
          View Plan Prompt
        </Button>

        <Button
          variant="outline"
          size="sm"
          onClick={() => handleCopyImplementationPlanPrompt(
            taskState.taskDescription,
            fileState.includedPaths
          )}
          disabled={!canPerformPlanAction}
          isLoading={isCopyingPlanPrompt}
          title="Copy the system and user prompt to the clipboard"
        >
          <ClipboardCopy className="h-3.5 w-3.5 mr-1.5" />
          Copy Prompt
        </Button>
      </div>

      {/* Dialog for displaying the plan prompt */}
      <PlanPromptDialog
        open={showPlanPromptDialog}
        onOpenChange={setShowPlanPromptDialog}
        planPrompt={planPrompt}
      />
    </div>
  );
};

export default ImplementationPlanActions;