import { useState, useCallback, useEffect } from 'react';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import { executeFileFinderWorkflowAction, type FileFinderWorkflowArgs, type FileFinderWorkflowResult } from '@/actions/file-system/file-finder-workflow.actions';

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

export interface WorkflowProgress {
  workflowId: string;
  stage: string;
  status: string;
  message: string;
  data?: any;
}
export function useRustManagedFileFinderWorkflow(props: RustManagedWorkflowProps) {
  const [isWorkflowRunning, setIsWorkflowRunning] = useState(false);
  const [workflowError, setWorkflowError] = useState<string | null>(null);
  const [workflowResult, setWorkflowResult] = useState<FileFinderWorkflowResult | null>(null);
  const [currentStage, setCurrentStage] = useState<string | undefined>(undefined);
  const [stageMessage, setStageMessage] = useState<string | undefined>(undefined);

  const resetWorkflowState = useCallback(() => {
    setWorkflowError(null);
    setWorkflowResult(null);
    setCurrentStage(undefined);
    setStageMessage(undefined);
  }, []);

  // Listen for workflow progress events
  useEffect(() => {
    let unlisten: UnlistenFn | null = null;

    const setupListener = async () => {
      try {
        unlisten = await listen<WorkflowProgress>('file-finder-workflow-progress', (event) => {
          const progress = event.payload;
          
          const expectedWorkflowId = `workflow_${props.activeSessionId}`;
          if (progress.workflowId === expectedWorkflowId) {
            setCurrentStage(progress.stage);
            setStageMessage(progress.message);
            setWorkflowError(null);
          }
        });
      } catch (error) {
        console.warn('Failed to setup workflow progress listener:', error);
      }
    };

    setupListener();

    return () => {
      if (unlisten) {
        unlisten();
      }
    };
  }, [props.activeSessionId]);

  const executeWorkflow = useCallback(async () => {
    setIsWorkflowRunning(true);
    setWorkflowError(null);
    setWorkflowResult(null);
    setCurrentStage(undefined);
    setStageMessage(undefined);

    try {
      const args: FileFinderWorkflowArgs = {
        sessionId: props.activeSessionId,
        taskDescription: props.taskDescription,
        projectDirectory: props.projectDirectory,
        excludedPaths: props.excludedPaths,
        timeoutMs: props.timeout,
      };

      const result = await executeFileFinderWorkflowAction(args);

      if (!result.isSuccess || !result.data) {
        setWorkflowError(result.message || 'Workflow failed');
        return;
      }

      if (!result.data.success) {
        setWorkflowError(result.data.errorMessage || 'Workflow completed with errors');
        return;
      }

      // Update the file selection with the results based on mode
      if (props.findFilesMode === "extend") {
        props.extendSelection(result.data.selectedFiles);
      } else {
        props.replaceSelection(result.data.selectedFiles);
      }
      
      setWorkflowResult(result.data);
      
    } catch (error) {
      setWorkflowError(`Workflow execution failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsWorkflowRunning(false);
      // Clear stage info after a delay when workflow completes
      setTimeout(() => {
        setCurrentStage(undefined);
        setStageMessage(undefined);
      }, 2000);
    }
  }, [props]);

  return {
    isWorkflowRunning,
    workflowError,
    workflowResult,
    currentStage,
    stageMessage,
    executeWorkflow,
    resetWorkflowState,
  };
}