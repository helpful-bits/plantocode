import { useState, useCallback, useEffect } from 'react';
import { type FileFinderWorkflowResult } from '@/actions/file-system/file-finder-workflow.actions';
import { useWorkflowTracker } from '@/hooks/use-workflow-tracker';
import { useWorkflowPerformanceMonitor } from '@/utils/workflow-performance-monitor';

export interface RustManagedWorkflowProps {
  activeSessionId: string;
  projectDirectory: string;
  taskDescription: string;
  excludedPaths: string[];
  replaceSelection: (paths: string[]) => void;
  extendSelection: (paths: string[]) => void;
  findFilesMode: "replace" | "extend";
  timeout?: number;
}

export function useRustManagedFileFinderWorkflow(props: RustManagedWorkflowProps) {
  const [workflowResult, setWorkflowResult] = useState<FileFinderWorkflowResult | null>(null);
  
  // Always use new workflow system
  const workflowTracker = useWorkflowTracker(
    props.activeSessionId,
    props.taskDescription,
    props.projectDirectory,
    props.excludedPaths,
    {
      autoStart: false,
      onComplete: (results) => {
        // Convert WorkflowResultsResponse to FileFinderWorkflowResult format
        const workflowResult: FileFinderWorkflowResult = {
          success: true,
          selectedFiles: results.finalPaths,
          intermediateData: {
            locallyFilteredFiles: results.intermediateData?.locallyFilteredFiles || [],
            initialVerifiedPaths: results.intermediateData?.initialVerifiedPaths || [],
            initialUnverifiedPaths: results.intermediateData?.initialUnverifiedPaths || [],
            initialCorrectedPaths: results.intermediateData?.initialCorrectedPaths || [],
            extendedVerifiedPaths: results.intermediateData?.extendedVerifiedPaths || [],
            extendedUnverifiedPaths: results.intermediateData?.extendedUnverifiedPaths || [],
            extendedCorrectedPaths: results.intermediateData?.extendedCorrectedPaths || [],
          },
        };
        
        setWorkflowResult(workflowResult);
        
        // Update file selection based on mode
        if (props.findFilesMode === "extend") {
          props.extendSelection(results.finalPaths);
        } else {
          props.replaceSelection(results.finalPaths);
        }
      },
      onError: (error) => {
        console.error('[useRustManagedFileFinderWorkflow] Workflow error:', error);
      },
    }
  );

  // Performance monitoring
  const performanceMonitor = useWorkflowPerformanceMonitor();

  // Monitor workflow state for performance tracking
  useEffect(() => {
    if (workflowTracker.workflowState) {
      performanceMonitor.updateFromState(workflowTracker.workflowState);
    }
  }, [workflowTracker.workflowState, performanceMonitor]);

  const resetWorkflowState = useCallback(() => {
    setWorkflowResult(null);
    workflowTracker.clearError();
  }, [workflowTracker]);


  const executeWorkflow = useCallback(async () => {
    setWorkflowResult(null);
    
    try {
      await workflowTracker.startWorkflow();
    } catch (error) {
      console.error('[useRustManagedFileFinderWorkflow] Failed to execute workflow:', error);
    }
  }, [workflowTracker]);

  return {
    // Core workflow state
    isWorkflowRunning: workflowTracker.isRunning,
    workflowError: workflowTracker.error?.message || null,
    workflowResult,
    currentStage: workflowTracker.currentStageName,
    stageMessage: workflowTracker.currentStageDescription,
    executeWorkflow,
    resetWorkflowState,
    
    // Workflow identification
    workflowId: workflowTracker.workflowState?.workflowId || null,
    
    // Enhanced workflow system capabilities
    newWorkflowSystem: {
      workflowState: workflowTracker.workflowState,
      progressPercentage: workflowTracker.progressPercentage,
      executionTime: workflowTracker.executionTime,
      isCompleted: workflowTracker.isCompleted,
      hasError: workflowTracker.hasError,
      results: workflowTracker.results,
      cancelWorkflow: workflowTracker.cancelWorkflow,
      retryWorkflow: workflowTracker.retryWorkflow,
      clearError: workflowTracker.clearError,
      workflowTracker: workflowTracker.workflowTracker,
    },
  };
}