"use client";

import { RefreshCw, Loader2, FileCode, Eye, AlertTriangle, XCircle } from "lucide-react";
import { useCallback, useState, useEffect, useMemo } from "react";

import { JobDetailsModal } from "@/app/components/background-jobs-sidebar/job-details-modal";
import { useNotification } from "@/contexts/notification-context";
import { useSessionStateContext } from "@/contexts/session";
import { useRuntimeConfig } from "@/contexts/runtime-config-context";
import { type BackgroundJob } from "@/types/session-types";
import { type CopyButtonConfig } from "@/types/config-types";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/ui/alert-dialog";
import { Button } from "@/ui/button";
import { getModelSettingsForProject } from "@/actions/project-settings.actions";
import {
  Card,
} from "@/ui/card";
import { ScrollArea } from "@/ui/scroll-area";
import { Alert, AlertDescription } from "@/ui/alert";
import { AnimatedNumber } from "@/ui";

import { estimatePromptTokensAction } from "@/actions/ai/prompt.actions";
import ImplementationPlanCard from "./_components/ImplementationPlanCard";
import PlanContentModal from "./_components/PlanContentModal";
import PromptCopyModal from "./_components/PromptCopyModal";
import { useImplementationPlansLogic } from "./_hooks/useImplementationPlansLogic";
import { usePromptCopyModal } from "./_hooks/usePromptCopyModal";
import { replacePlaceholders } from "./_utils/plan-content-parser";

interface ImplementationPlansPanelProps {
  sessionId: string | null;
  // Props from the create functionality
  projectDirectory?: string;
  taskDescription?: string;
  includedPaths?: string[];
  isCreatingPlan?: boolean;
  planCreationState?: "idle" | "submitting" | "submitted";
  onCreatePlan?: (taskDescription: string, includedPaths: string[]) => Promise<void>;
}

export function ImplementationPlansPanel({
  sessionId,
  projectDirectory,
  taskDescription,
  includedPaths,
  isCreatingPlan,
  planCreationState,
  onCreatePlan,
}: ImplementationPlansPanelProps) {
  const {
    implementationPlans,
    isLoading,
    copiedPlanId,
    jobForModal,
    jobToDelete,
    isDeleting,

    handleCopyToClipboard,
    handleDeletePlan,
    handleViewPlanDetails,
    handleClosePlanDetails,
    setJobToDelete,
    refreshJobs,
  } = useImplementationPlansLogic({ sessionId });

  // State for plan content modal - now only stores the jobId
  const [openedPlanJobId, setOpenedPlanJobId] = useState<string | null>(null);

  // Derive the live plan from the context using the jobId
  const livePlanForModal = useMemo(() => {
    if (!openedPlanJobId) return null;
    return implementationPlans.find(plan => plan.id === openedPlanJobId) || null;
  }, [openedPlanJobId, implementationPlans]);

  // Handle opening the plan content modal
  const handleViewPlanContent = useCallback((plan: BackgroundJob) => {
    setOpenedPlanJobId(plan.id);
  }, []);

  // Handle closing the plan content modal
  const handleClosePlanContentModal = useCallback(() => {
    setOpenedPlanJobId(null);
  }, []);

  const { currentSession } = useSessionStateContext();
  const { showNotification } = useNotification();
  
  // Prompt copy modal hook
  const promptCopyModal = usePromptCopyModal();
  
  // Token estimation state
  const [estimatedTokens, setEstimatedTokens] = useState<number | null>(null);
  const [previousEstimatedTokens, setPreviousEstimatedTokens] = useState<number | null>(null);
  const [isEstimatingTokens, setIsEstimatingTokens] = useState(false);
  
  // Runtime config for model context windows
  const { config: runtimeConfig } = useRuntimeConfig();
  
  // Implementation plan settings state
  const [implementationPlanSettings, setImplementationPlanSettings] = useState<CopyButtonConfig[] | null>(null);
  const [selectedStepNumber, setSelectedStepNumber] = useState<string | null>(null);

  // Validation for create functionality
  const canCreatePlan = Boolean(
    projectDirectory &&
    (taskDescription || currentSession?.taskDescription)?.trim() &&
    includedPaths?.length &&
    sessionId &&
    !isCreatingPlan
  );
  
  // Load implementation plan settings
  useEffect(() => {
    if (!projectDirectory) return;
    
    const loadSettings = async () => {
      try {
        const result = await getModelSettingsForProject(projectDirectory);
        if (result.isSuccess && result.data?.implementationPlan?.copyButtons) {
          setImplementationPlanSettings(result.data.implementationPlan.copyButtons);
        }
      } catch (error) {
        console.error('Failed to load implementation plan settings:', error);
      }
    };
    
    loadSettings();
  }, [projectDirectory]);
  
  // Handle copy button click
  const handleCopyButtonClick = useCallback(async (buttonConfig: CopyButtonConfig, plan: BackgroundJob) => {
    try {
      const fullPlan = plan.response || '';
      const processedContent = replacePlaceholders(buttonConfig.content, fullPlan, selectedStepNumber || undefined);
      
      await navigator.clipboard.writeText(processedContent);
      
      showNotification({
        title: "Copied to clipboard",
        message: `${buttonConfig.label} copied successfully`,
        type: "success",
        duration: 2000,
      });
    } catch (error) {
      console.error('Failed to copy button content:', error);
      showNotification({
        title: "Copy failed",
        message: "Failed to copy content to clipboard",
        type: "error",
        duration: 3000,
      });
    }
  }, [selectedStepNumber, showNotification]);

  // Token estimation effect
  useEffect(() => {
    if (!canCreatePlan) {
      setEstimatedTokens(null);
      return;
    }

    const estimateTokens = async () => {
      setIsEstimatingTokens(true);
      try {
        const finalTaskDescription = taskDescription || currentSession?.taskDescription || "";
        const finalIncludedPaths = includedPaths || [];

        const result = await estimatePromptTokensAction({
          sessionId: sessionId!,
          taskDescription: finalTaskDescription,
          projectDirectory: projectDirectory!,
          relevantFiles: finalIncludedPaths,
          projectStructure: undefined,
          taskType: "implementation_plan",
        });

        if (result.isSuccess && result.data) {
          setPreviousEstimatedTokens(estimatedTokens);
          setEstimatedTokens(result.data.totalTokens);
        } else {
          setPreviousEstimatedTokens(estimatedTokens);
          setEstimatedTokens(null);
        }
      } catch (error) {
        console.error("Failed to estimate tokens:", error);
        setEstimatedTokens(null);
      } finally {
        setIsEstimatingTokens(false);
      }
    };

    // Debounce token estimation
    const timeoutId = setTimeout(estimateTokens, 500);
    return () => clearTimeout(timeoutId);
  }, [canCreatePlan, sessionId, taskDescription, currentSession?.taskDescription, projectDirectory, includedPaths]);


  // Handle view prompt (renamed from copy prompt)
  const handleViewPrompt = useCallback(async () => {
    if (!canCreatePlan) {
      showNotification({
        title: "Cannot View Prompt",
        message: "Please ensure you have a project directory, task description, and selected files.",
        type: "error",
      });
      return;
    }

    const finalTaskDescription = taskDescription || currentSession?.taskDescription || "";
    const finalIncludedPaths = includedPaths || [];

    try {
      await promptCopyModal.openModal({
        sessionId: sessionId!,
        taskDescription: finalTaskDescription,
        projectDirectory: projectDirectory!,
        relevantFiles: finalIncludedPaths,
        projectStructure: undefined, // Could be enhanced later
      });
    } catch (error) {
      showNotification({
        title: "Failed to Load Prompt",
        message: error instanceof Error ? error.message : "An unknown error occurred",
        type: "error",
      });
    }
  }, [canCreatePlan, sessionId, taskDescription, currentSession?.taskDescription, projectDirectory, includedPaths, promptCopyModal, showNotification]);

  // Handle create plan using the context-provided function
  const handleCreatePlan = useCallback(async () => {
    if (!onCreatePlan || !canCreatePlan) return;

    const finalTaskDescription = taskDescription || currentSession?.taskDescription || "";
    const finalIncludedPaths = includedPaths || [];

    try {
      await onCreatePlan(finalTaskDescription, finalIncludedPaths);
    } catch (error) {
      showNotification({
        title: "Implementation Plan Creation Failed",
        message: error instanceof Error ? error.message : "Failed to create implementation plan",
        type: "error",
      });
    }
  }, [onCreatePlan, canCreatePlan, taskDescription, currentSession?.taskDescription, includedPaths, showNotification]);

  // Button text based on state
  const buttonText = isCreatingPlan
    ? "Creating..."
    : planCreationState === "submitted"
      ? "Started!"
      : "Create Implementation Plan";

  return (
    <div className="space-y-4 p-4">
      <header className="flex justify-between items-center mb-4">
        <h2 className="text-lg font-semibold text-foreground">Implementation Plans</h2>
        <Button
          variant="outline"
          size="sm"
          onClick={() => refreshJobs()}
          disabled={isLoading}
          className="bg-background/90 backdrop-blur-sm shadow-soft border-border/30 text-muted-foreground hover:bg-muted/50 hover:text-primary hover:border-primary/20"
        >
          <RefreshCw className="h-4 w-4 mr-2" />
          Refresh
        </Button>
      </header>

      {/* Create Implementation Plan Section */}
      {onCreatePlan && (
        <Card className="bg-card p-6 rounded-lg border border-border shadow-sm mb-6">
          <div>
            <h3 className="text-sm font-medium mb-3 text-foreground">Create New Plan</h3>
            
            {/* Token count display with warnings */}
            {(estimatedTokens !== null || isEstimatingTokens) && (
              <div className="mb-3">
                <div className="space-y-2">
                  <div className="text-xs text-muted-foreground">
                    Estimated tokens: <AnimatedNumber 
                      value={estimatedTokens} 
                      previousValue={previousEstimatedTokens}
                      className="text-foreground font-medium"
                    />
                  </div>
                    {estimatedTokens && runtimeConfig && (() => {
                      // Get the model config for implementation plan task
                      const implementationPlanModel = runtimeConfig.tasks?.implementationPlan?.model || runtimeConfig.defaultLlmModelId;
                      const modelInfo = runtimeConfig.providers?.flatMap(p => p.models).find(m => m.id === implementationPlanModel);
                      const contextWindow = modelInfo?.contextWindow;
                      
                      if (!contextWindow) return null;
                      
                      const tokenPercentage = (estimatedTokens / contextWindow) * 100;
                      
                      if (tokenPercentage > 100) {
                        return (
                          <Alert variant="destructive">
                            <XCircle className="h-4 w-4" />
                            <AlertDescription className="text-xs">
                              <strong>Prompt too large:</strong> {estimatedTokens.toLocaleString()} tokens exceeds the {contextWindow.toLocaleString()}-token limit for {modelInfo.name}. Please reduce the number of files or select a model with a larger context window.
                            </AlertDescription>
                          </Alert>
                        );
                      } else if (tokenPercentage > 90) {
                        return (
                          <Alert variant="warning">
                            <AlertTriangle className="h-4 w-4" />
                            <AlertDescription className="text-xs">
                              <strong>Large prompt:</strong> Using {Math.round(tokenPercentage)}% of {modelInfo.name}'s context window. Generation might be slow or fail. Consider reducing files.
                            </AlertDescription>
                          </Alert>
                        );
                      }
                      
                      return null;
                    })()}
                </div>
              </div>
            )}
            
            <div className="space-y-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleViewPrompt}
                disabled={!canCreatePlan}
                className="flex items-center justify-center w-full h-9"
              >
                <Eye className="h-4 w-4 mr-2" />
                View Prompt
              </Button>

              <Button
                variant="default"
                size="sm"
                onClick={handleCreatePlan}
                disabled={!canCreatePlan || (() => {
                  // Disable if tokens exceed context window
                  if (!estimatedTokens || !runtimeConfig) return false;
                  const implementationPlanModel = runtimeConfig.tasks?.implementationPlan?.model || runtimeConfig.defaultLlmModelId;
                  const modelInfo = runtimeConfig.providers?.flatMap(p => p.models).find(m => m.id === implementationPlanModel);
                  const contextWindow = modelInfo?.contextWindow;
                  return contextWindow ? estimatedTokens > contextWindow : false;
                })()}
                className="flex items-center justify-center w-full h-9"
              >
                <FileCode className="h-4 w-4 mr-2" />
                {buttonText}
              </Button>
            </div>
          </div>

          <p className="text-xs text-muted-foreground mt-3 text-balance">
            Creates an implementation plan based on your task description and
            selected files. Token count is estimated automatically. Use "View Prompt" to see the exact prompt that would be sent to the AI.
          </p>
        </Card>
      )}

      {/* Loading state */}
      {isLoading && implementationPlans.length === 0 && (
        <div className="flex items-center justify-center p-8 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin mr-2" />
          <span>Loading implementation plans...</span>
        </div>
      )}


      {/* Implementation Plans List */}
      {implementationPlans.length > 0 && (
        <ScrollArea className="h-[calc(100vh-300px)] pr-4">
          <div className="space-y-3">
            {implementationPlans.map((plan) => (
              <ImplementationPlanCard
                key={plan.id}
                plan={plan}
                onCopyContent={handleCopyToClipboard}
                onViewContent={handleViewPlanContent}
                onViewDetails={handleViewPlanDetails}
                onDelete={(jobId) => setJobToDelete(jobId)}
                isDeleting={isDeleting[plan.id] || false}
                copiedPlanId={copiedPlanId}
              />
            ))}
          </div>
        </ScrollArea>
      )}

      {/* Job Details Modal */}
      {jobForModal && (
        <JobDetailsModal
          job={jobForModal}
          onClose={handleClosePlanDetails}
        />
      )}

      {/* Plan Content Modal */}
      {livePlanForModal && (
        <PlanContentModal
          plan={livePlanForModal}
          open={openedPlanJobId !== null}
          onOpenChange={(open: boolean) => {
            if (!open) {
              handleClosePlanContentModal();
              setSelectedStepNumber(null);
            }
          }}
          onRefreshContent={refreshJobs}
          selectedStepNumber={selectedStepNumber}
          onStepSelect={setSelectedStepNumber}
          copyButtons={implementationPlanSettings || []}
          onCopyButtonClick={(buttonConfig) => handleCopyButtonClick(buttonConfig, livePlanForModal)}
        />
      )}

      {/* Prompt Copy Modal */}
      <PromptCopyModal
        open={promptCopyModal.isOpen}
        onOpenChange={promptCopyModal.closeModal}
        systemPrompt={promptCopyModal.promptData?.systemPrompt}
        userPrompt={promptCopyModal.promptData?.userPrompt}
        combinedPrompt={promptCopyModal.promptData?.combinedPrompt}
        isLoading={promptCopyModal.isLoading}
        error={promptCopyModal.error}
        sessionName={currentSession?.name || ""}
      />

      {/* Delete Confirmation Dialog */}
      <AlertDialog
        open={!!jobToDelete}
        onOpenChange={(open: boolean) => !open && setJobToDelete(undefined)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Implementation Plan</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this implementation plan? This
              action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setJobToDelete(undefined)}>
              Cancel
            </AlertDialogCancel>
            <Button
              variant="destructive"
              isLoading={Object.values(isDeleting).some(Boolean)}
              onClick={() => jobToDelete && handleDeletePlan(jobToDelete)}
            >
              Delete
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

export default ImplementationPlansPanel;
