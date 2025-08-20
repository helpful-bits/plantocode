"use client";

import { FileCode, Eye, ClipboardCopy, Loader2 } from "lucide-react";
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
import { ModelSelectorToggle } from "./_components/ModelSelectorToggle";
import { setProjectTaskSetting } from "@/actions/project-settings.actions";
import { type ModelInfo } from "@/types/config-types";
import { getProjectTaskModelSettings } from "@/actions/project-settings.actions";
import { getBackgroundJobAction } from "@/actions/background-jobs/jobs.actions";
import {
  Card,
} from "@/ui/card";
import { ScrollArea } from "@/ui/scroll-area";
import { AnimatedNumber } from "@/ui";

import { estimatePromptTokensAction } from "@/actions/ai/prompt.actions";
import ImplementationPlanCard from "./_components/ImplementationPlanCard";
import PlanContentModal from "./_components/PlanContentModal";
import PromptCopyModal from "./_components/PromptCopyModal";
import { MergePlansSection } from "./_components/MergePlansSection";
import { useImplementationPlansLogic } from "./_hooks/useImplementationPlansLogic";
import { usePromptCopyModal } from "./_hooks/usePromptCopyModal";
import { replacePlaceholders } from "@/utils/placeholder-utils";
import { getContentForStep } from "./_utils/plan-content-parser";
import { normalizeJobResponse } from '@/utils/response-utils';
import { usePlausible } from "@/hooks/use-plausible";

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
  const { trackEvent } = usePlausible();
  const {
    implementationPlans,
    isLoading,
    jobForModal,
    jobToDelete,
    isDeleting,
    selectedPlanIds,
    mergeInstructions,
    isMerging,

    handleDeletePlan,
    handleViewPlanDetails,
    handleClosePlanDetails,
    setJobToDelete,
    refreshJobs,
    handleTogglePlanSelection,
    handleMergeInstructionsChange,
    handleMergePlans,
  } = useImplementationPlansLogic({ sessionId });

  // State for plan content modal - now only stores the jobId
  const [openedPlanJobId, setOpenedPlanJobId] = useState<string | null>(null);

  // Derive the live plan from the context using the jobId
  const livePlanForModal = useMemo(() => {
    if (!openedPlanJobId) return null;
    return implementationPlans.find(plan => plan.id === openedPlanJobId) || null;
  }, [openedPlanJobId, implementationPlans]);

  // Get current plan index and navigation info
  const currentPlanIndex = useMemo(() => {
    if (!openedPlanJobId) return -1;
    return implementationPlans.findIndex(plan => plan.id === openedPlanJobId);
  }, [openedPlanJobId, implementationPlans]);

  const hasPreviousPlan = currentPlanIndex > 0;
  const hasNextPlan = currentPlanIndex >= 0 && currentPlanIndex < implementationPlans.length - 1;

  // Handle navigation between plans
  const handleNavigateToPlan = useCallback((direction: 'previous' | 'next') => {
    if (currentPlanIndex === -1) return;
    
    const newIndex = direction === 'previous' ? currentPlanIndex - 1 : currentPlanIndex + 1;
    if (newIndex >= 0 && newIndex < implementationPlans.length) {
      setOpenedPlanJobId(implementationPlans[newIndex].id);
    }
  }, [currentPlanIndex, implementationPlans]);

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
  const [selectedModelId, setSelectedModelId] = useState<string | undefined>(undefined);
  const [allowedModelsForPlan, setAllowedModelsForPlan] = useState<ModelInfo[]>([]);
  
  // Preloaded prompt content state
  const [preloadedPromptContent, setPreloadedPromptContent] = useState<string | null>(null);
  const [isPreloadingPrompt, setIsPreloadingPrompt] = useState(false);
  
  // Preloaded plan content state for copy buttons
  const [preloadedPlanContent, setPreloadedPlanContent] = useState<Record<string, string>>({});
  const [isPreloadingPlan, setIsPreloadingPlan] = useState<Record<string, boolean>>({});

  // Clear preloaded content when dependencies change
  useEffect(() => {
    setPreloadedPromptContent(null);
    setPreloadedPlanContent({});
  }, [taskDescription, currentSession?.taskDescription, includedPaths, sessionId, projectDirectory]);

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
        const result = await getProjectTaskModelSettings(projectDirectory);
        if (result.isSuccess && result.data?.implementationPlan?.copyButtons) {
          setImplementationPlanSettings(result.data.implementationPlan.copyButtons);
        }
      } catch (error) {
        console.error('Failed to load implementation plan settings:', error);
      }
    };
    
    loadSettings();
  }, [projectDirectory]);
  
  useEffect(() => {
    if (!projectDirectory || !runtimeConfig) return;
    
    const loadModelConfig = async () => {
      try {
        const result = await getProjectTaskModelSettings(projectDirectory);
        if (result.isSuccess && result.data?.implementationPlan) {
          const planConfig = result.data.implementationPlan;
          const currentModel = planConfig.model;
          const allowedModelIds = planConfig.allowedModels || [];
          const uniqueAllowedModelIds = [...new Set(allowedModelIds)];
          
          const availableModels = runtimeConfig.providers?.flatMap(p => p.models) || [];
          const filteredModels = availableModels
            .filter(model => uniqueAllowedModelIds.includes(model.id))
            .reduce((acc, model) => {
              if (!acc.some(m => m.id === model.id)) {
                acc.push(model);
              }
              return acc;
            }, [] as typeof availableModels)
            .sort((a, b) => {
              const providerCompare = a.providerName.localeCompare(b.providerName);
              if (providerCompare !== 0) return providerCompare;
              return a.name.localeCompare(b.name);
            });
          
          setSelectedModelId(currentModel);
          setAllowedModelsForPlan(filteredModels);
        }
      } catch (error) {
        console.error('Failed to load model configuration:', error);
      }
    };
    
    loadModelConfig();
  }, [projectDirectory, runtimeConfig]);
  
  // Handle preload plan content on hover
  const handlePreloadPlanContent = useCallback(async (plan: BackgroundJob) => {
    // Check if already loading or content exists
    if (isPreloadingPlan[plan.id] || preloadedPlanContent[plan.id]) {
      return;
    }

    setIsPreloadingPlan(prev => ({ ...prev, [plan.id]: true }));
    try {
      const fullJobResult = await getBackgroundJobAction(plan.id);
      
      if (fullJobResult.isSuccess && fullJobResult.data) {
        const fullPlan = fullJobResult.data.response || '';
        const parsedPlanContent = normalizeJobResponse(fullPlan).content;
        setPreloadedPlanContent(prev => ({ ...prev, [plan.id]: parsedPlanContent }));
      }
    } catch (error) {
      console.error('Failed to preload plan content:', error);
    } finally {
      setIsPreloadingPlan(prev => ({ ...prev, [plan.id]: false }));
    }
  }, [isPreloadingPlan, preloadedPlanContent]);

  // Handle copy button click
  const handleCopyButtonClick = useCallback(async (buttonConfig: CopyButtonConfig, plan: BackgroundJob) => {
    try {
      // Use preloaded content if available, otherwise fetch it
      let parsedPlanContent = preloadedPlanContent[plan.id];
      
      if (!parsedPlanContent) {
        // Fallback to fetching if not preloaded
        const fullJobResult = await getBackgroundJobAction(plan.id);
        
        if (!fullJobResult.isSuccess || !fullJobResult.data) {
          throw new Error(fullJobResult.message || 'Failed to fetch full job details');
        }
        
        const fullPlan = fullJobResult.data.response || '';
        parsedPlanContent = normalizeJobResponse(fullPlan).content;
      }
      
      const data = {
        IMPLEMENTATION_PLAN: parsedPlanContent,
        STEP_CONTENT: selectedStepNumber ? getContentForStep(parsedPlanContent, selectedStepNumber) : ''
      };
      const processedContent = replacePlaceholders(buttonConfig.content, data);
      
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
  }, [selectedStepNumber, showNotification, preloadedPlanContent]);

  // Token estimation effect
  useEffect(() => {
    if (!canCreatePlan || !selectedModelId) {
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
          taskType: "implementation_plan",
          model: selectedModelId
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
  }, [canCreatePlan, sessionId, taskDescription, currentSession?.taskDescription, projectDirectory, includedPaths, selectedModelId]);


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
      });
    } catch (error) {
      showNotification({
        title: "Failed to Load Prompt",
        message: error instanceof Error ? error.message : "An unknown error occurred",
        type: "error",
      });
    }
  }, [canCreatePlan, sessionId, taskDescription, currentSession?.taskDescription, projectDirectory, includedPaths, promptCopyModal, showNotification]);

  // Handle preload prompt on hover
  const handlePreloadPrompt = useCallback(async () => {
    if (!canCreatePlan || isPreloadingPrompt) {
      return;
    }

    const finalTaskDescription = taskDescription || currentSession?.taskDescription || "";
    const finalIncludedPaths = includedPaths || [];

    setIsPreloadingPrompt(true);
    try {
      const { getPromptAction } = await import("@/actions/ai/prompt.actions");
      const result = await getPromptAction({
        sessionId: sessionId!,
        taskDescription: finalTaskDescription,
        projectDirectory: projectDirectory!,
        relevantFiles: finalIncludedPaths,
        taskType: "implementation_plan"
      });

      if (result.isSuccess && result.data) {
        setPreloadedPromptContent(result.data.combinedPrompt);
      }
    } catch (error) {
      console.error("Failed to preload prompt:", error);
    } finally {
      setIsPreloadingPrompt(false);
    }
  }, [canCreatePlan, isPreloadingPrompt, taskDescription, currentSession?.taskDescription, includedPaths, sessionId, projectDirectory]);

  // State for copy button loading
  const [isLoadingPrompt, setIsLoadingPrompt] = useState(false);

  // Handle copy prompt
  const handleCopyPrompt = useCallback(async () => {
    if (!canCreatePlan) {
      showNotification({
        title: "Cannot Copy Prompt",
        message: "Please ensure you have a project directory, task description, and selected files.",
        type: "error",
      });
      return;
    }

    try {
      // Use preloaded content if available
      if (preloadedPromptContent) {
        await navigator.clipboard.writeText(preloadedPromptContent);
        
        showNotification({
          title: "Copied to clipboard",
          message: "Implementation plan prompt copied successfully",
          type: "success",
          duration: 2000,
        });
        return;
      }

      // Fallback to loading content if not preloaded
      setIsLoadingPrompt(true);
      const finalTaskDescription = taskDescription || currentSession?.taskDescription || "";
      const finalIncludedPaths = includedPaths || [];

      const { getPromptAction } = await import("@/actions/ai/prompt.actions");
      const result = await getPromptAction({
        sessionId: sessionId!,
        taskDescription: finalTaskDescription,
        projectDirectory: projectDirectory!,
        relevantFiles: finalIncludedPaths,
        taskType: "implementation_plan"
      });

      if (result.isSuccess && result.data) {
        await navigator.clipboard.writeText(result.data.combinedPrompt);
        
        showNotification({
          title: "Copied to clipboard",
          message: "Implementation plan prompt copied successfully",
          type: "success",
          duration: 2000,
        });
      } else {
        showNotification({
          title: "Failed to Copy Prompt",
          message: result.message || "Failed to load prompt",
          type: "error",
        });
      }
    } catch (error) {
      showNotification({
        title: "Failed to Copy Prompt",
        message: error instanceof Error ? error.message : "An unknown error occurred",
        type: "error",
      });
    } finally {
      setIsLoadingPrompt(false);
    }
  }, [canCreatePlan, preloadedPromptContent, sessionId, taskDescription, currentSession?.taskDescription, projectDirectory, includedPaths, showNotification]);

  // Handle create plan using the context-provided function
  const handleCreatePlan = useCallback(async () => {
    if (!onCreatePlan || !canCreatePlan) return;

    const finalTaskDescription = taskDescription || currentSession?.taskDescription || "";
    const finalIncludedPaths = includedPaths || [];

    try {
      // Track implementation plan creation
      trackEvent('desktop_plan_created', {
        files_count: finalIncludedPaths.length,
        has_task_description: Boolean(finalTaskDescription.trim())
      });
      
      await onCreatePlan(finalTaskDescription, finalIncludedPaths);
    } catch (error) {
      showNotification({
        title: "Implementation Plan Creation Failed",
        message: error instanceof Error ? error.message : "Failed to create implementation plan",
        type: "error",
      });
    }
  }, [onCreatePlan, canCreatePlan, taskDescription, currentSession?.taskDescription, includedPaths, showNotification]);

  // Memoized callback for clearing selection
  const handleClearSelection = useCallback(() => {
    handleMergeInstructionsChange("");
    selectedPlanIds.forEach(id => handleTogglePlanSelection(id));
  }, [selectedPlanIds, handleTogglePlanSelection, handleMergeInstructionsChange]);

  const handleModelSelect = useCallback(async (modelId: string) => {
    if (!projectDirectory) return;
    
    setSelectedModelId(modelId);
    
    try {
      await setProjectTaskSetting(
        projectDirectory,
        'implementationPlan',
        'model',
        modelId
      );
    } catch (error) {
      console.error('Failed to save model selection:', error);
      showNotification({
        title: "Failed to save model selection",
        message: error instanceof Error ? error.message : "Unknown error",
        type: "error",
      });
    }
  }, [projectDirectory, showNotification]);

  // Button text based on state
  const buttonText = isCreatingPlan
    ? "Creating..."
    : planCreationState === "submitted"
      ? "Started!"
      : "Create Implementation Plan";

  // Derive max output tokens from runtime config
  const maxOutputTokens = runtimeConfig?.tasks?.implementationPlan?.maxTokens ?? 0;

  return (
    <div 
      className="space-y-4 p-4"
      onMouseEnter={handlePreloadPrompt}
    >
      <header className="flex justify-between items-center mb-4">
        <h2 className="text-lg font-semibold text-foreground">Implementation Plans</h2>
        <div className="flex items-center gap-2">
          {onCreatePlan && allowedModelsForPlan.length > 1 && (
            <ModelSelectorToggle
              models={allowedModelsForPlan}
              selectedModelId={selectedModelId}
              onSelect={handleModelSelect}
              estimatedTokens={estimatedTokens}
              maxOutputTokens={maxOutputTokens}
            />
          )}
        </div>
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
                    Estimated tokens*: <AnimatedNumber 
                      value={estimatedTokens} 
                      previousValue={previousEstimatedTokens}
                      className="text-foreground font-medium"
                    />
                  </div>
                  <div className="text-xs text-muted-foreground/70">
                    * This is an estimate. The final token count will be provided by your AI provider after processing and may differ between providers for the same content.
                  </div>
                </div>
              </div>
            )}
            
            <div className="space-y-2">
              <div className="flex gap-2">
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
                  variant="outline"
                  size="sm"
                  onClick={handleCopyPrompt}
                  onMouseEnter={handlePreloadPrompt}
                  disabled={isLoadingPrompt}
                  className="flex items-center justify-center w-full h-9"
                >
                  <ClipboardCopy className="h-4 w-4 mr-2" />
                  Copy
                </Button>
              </div>

              <Button
                variant="default"
                size="sm"
                onClick={handleCreatePlan}
                disabled={!canCreatePlan || (() => { if (!estimatedTokens || !runtimeConfig || !selectedModelId) return false; const modelInfo = allowedModelsForPlan.find(m => m.id === selectedModelId); const contextWindow = modelInfo?.contextWindow; if (!contextWindow) return false; const maxOutputTokens = runtimeConfig.tasks?.implementationPlan?.maxTokens ?? 0; return (estimatedTokens + maxOutputTokens) > contextWindow; })()}
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


      {/* Merge Plans Section */}
      {selectedPlanIds.length > 0 && (
        <MergePlansSection
          selectedCount={selectedPlanIds.length}
          mergeInstructions={mergeInstructions}
          isMerging={isMerging}
          onMergeInstructionsChange={handleMergeInstructionsChange}
          onMerge={handleMergePlans}
          onClearSelection={handleClearSelection}
        />
      )}

      {/* Implementation Plans List */}
      {implementationPlans.length > 0 && (
        <ScrollArea className="h-[calc(100vh-300px)] pr-4">
          <div className="space-y-3">
            {implementationPlans.map((plan) => (
              <ImplementationPlanCard
                key={plan.id}
                plan={plan}
                onViewContent={handleViewPlanContent}
                onViewDetails={handleViewPlanDetails}
                onDelete={(jobId) => {
                  const planToDelete = implementationPlans.find(p => p.id === jobId);
                  if (planToDelete) setJobToDelete(planToDelete);
                }}
                isDeleting={isDeleting[plan.id] || false}
                copyButtons={implementationPlanSettings || []}
                onCopyButtonClick={(buttonConfig) => handleCopyButtonClick(buttonConfig, plan)}
                onPreloadPlanContent={() => handlePreloadPlanContent(plan)}
                isSelected={selectedPlanIds.includes(plan.id)}
                onToggleSelection={handleTogglePlanSelection}
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
          // Navigation props
          currentIndex={currentPlanIndex}
          totalPlans={implementationPlans.length}
          hasPrevious={hasPreviousPlan}
          hasNext={hasNextPlan}
          onNavigate={handleNavigateToPlan}
          // Selection props
          isSelected={selectedPlanIds.includes(livePlanForModal.id)}
          onSelect={handleTogglePlanSelection}
          // Merge instructions props
          mergeInstructions={mergeInstructions}
          onMergeInstructionsChange={handleMergeInstructionsChange}
          selectedCount={selectedPlanIds.length}
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
              onClick={handleDeletePlan}
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
