"use client";

import React, { useState, useEffect } from "react";
import { Loader2, ClipboardCopy, Eye, FileCode } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useGeneratePrompt } from "../_contexts/generate-prompt-context";
import { useFileManagement } from "../_contexts/file-management-context";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { getImplementationPlanPromptAction } from "@/actions/implementation-plan-actions";
import { useNotification } from "@/lib/contexts/notification-context";
import { estimateTokens } from "@/lib/token-estimator";

const ActionSection = React.memo(function ActionSection() {
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
  
  // Add debug logging for the plan action state
  useEffect(() => {
    console.log("[ActionSection] Implementation plan action state:", {
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
      console.log("[ActionSection] Cannot generate prompt:", {
        hasProjectDirectory: Boolean(projectDirectory),
        hasTaskDescription: Boolean(taskState.taskDescription),
        hasIncludedPaths: fileState.includedPaths.length > 0
      });
      return;
    }
    
    setIsGeneratingPrompt(true);
    try {
      const result = await getImplementationPlanPromptAction({
        projectDirectory,
        taskDescription: taskState.taskDescription,
        relevantFiles: fileState.includedPaths,
        fileContentsMap: fileState.fileContentsMap
      });
      
      if (result.isSuccess && result.data?.prompt) {
        setGeneratedPrompt(result.data.prompt);
        setPromptGeneratedAt(new Date());
        showNotification({
          title: "Prompt Generated",
          message: "Implementation plan prompt has been generated successfully.",
          type: "success"
        });
      } else {
        showNotification({
          title: "Error",
          message: result.message || "Failed to generate plan prompt",
          type: "error"
        });
      }
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
      if (projectDirectory && taskState.taskDescription && fileState.includedPaths.length > 0) {
        setShowPlanPromptDialog(true);
        
        // Get the plan prompt but don't copy it
        const result = await getImplementationPlanPromptAction({
          projectDirectory,
          taskDescription: taskState.taskDescription,
          relevantFiles: fileState.includedPaths,
          fileContentsMap: fileState.fileContentsMap
        });
        
        if (result.isSuccess && result.data?.prompt) {
          setPlanPrompt(result.data.prompt);
        } else {
          showNotification({
            title: "Error",
            message: result.message || "Failed to generate plan prompt",
            type: "error"
          });
        }
      }
    } catch (error) {
      console.error("[handleViewPlanPrompt]", error);
      showNotification({
        title: "Error",
        message: error instanceof Error ? error.message : "Failed to generate plan prompt",
        type: "error"
      });
    }
  };

  return (
    <div className="space-y-4 bg-card p-4 rounded-lg border shadow-sm">
      <div>
        <h3 className="text-sm font-medium mb-3">Implementation Plans</h3>
        
        <Button
          variant="default"
          size="sm"
          onClick={handleGeneratePrompt}
          disabled={!canPerformPlanAction || isGeneratingPrompt}
          title="Generate the implementation plan prompt"
          className="flex items-center justify-center w-full"
        >
          {isGeneratingPrompt ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Generating Prompt...
            </>
          ) : (
            <>
              <FileCode className="h-4 w-4 mr-2" />
              Generate Implementation Plan Prompt
            </>
          )}
        </Button>
      </div>
      
      <p className="text-xs text-muted-foreground">
        This action generates a prompt that will be sent to an AI to create an implementation plan.
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
              className="text-xs"
            >
              <ClipboardCopy className="h-3 w-3 mr-2" />
              Copy
            </Button>
          </div>
          
          <pre className="bg-muted p-3 rounded-md overflow-auto whitespace-pre-wrap text-xs max-h-[300px]">
            {generatedPrompt}
          </pre>
          
          <div className="mt-4">
            <Button
              variant="default"
              size="sm"
              onClick={() => handleCreateImplementationPlan(fileState.includedPaths, fileState.fileContentsMap)}
              disabled={isCreatingPlan}
              className="flex items-center justify-center w-full bg-blue-600 hover:bg-blue-700 text-white"
            >
              {isCreatingPlan ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Creating Implementation Plan...
                </>
              ) : (
                <>
                  <FileCode className="h-4 w-4 mr-2" />
                  Create Implementation Plan
                </>
              )}
            </Button>
          </div>
        </div>
      )}
      
      {/* Dialog for displaying the plan prompt */}
      <Dialog open={showPlanPromptDialog} onOpenChange={setShowPlanPromptDialog}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-auto">
          <DialogHeader>
            <DialogTitle>Implementation Plan Prompt</DialogTitle>
            <DialogDescription>
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
                  showNotification({
                    title: "Copied!",
                    message: "Implementation plan prompt copied to clipboard.",
                    type: "success",
                    clipboardFeedback: true
                  });
                }}
                className="text-xs"
              >
                <ClipboardCopy className="h-3 w-3 mr-2" />
                Copy to Clipboard
              </Button>
            </div>
            
            <pre className="bg-muted p-4 rounded-md overflow-auto whitespace-pre-wrap text-xs max-h-[70vh]">
              {planPrompt || "Loading prompt..."}
            </pre>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
});

export default ActionSection;