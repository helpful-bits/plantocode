/**
 * Frontend workflow utilities and WorkflowTracker class
 * Provides comprehensive workflow management functionality
 */

import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import type {
  WorkflowState,
  WorkflowCommandResponse,
  WorkflowStatusResponse,
  WorkflowResultsResponse,
  WorkflowStatusEvent,
  WorkflowStageEvent,
  WorkflowError as WorkflowErrorType,
  WorkflowProgressCallback,
  WorkflowCompleteCallback,
  WorkflowErrorCallback,
  UnsubscribeFunction,
  WorkflowConfiguration,
  StageStatus,
  WorkflowStage,
} from "@/types/workflow-types";
import { WORKFLOW_STATUSES } from "@/types/workflow-types";

/**
 * WorkflowTracker class for managing File Finder Workflows
 * Provides a high-level interface for workflow lifecycle management
 */
export class WorkflowTracker {
  private workflowId: string;
  private sessionId: string;
  private eventUnlisten: UnlistenFn | null = null;
  private progressCallbacks: Set<WorkflowProgressCallback> = new Set();
  private completeCallbacks: Set<WorkflowCompleteCallback> = new Set();
  private errorCallbacks: Set<WorkflowErrorCallback> = new Set();
  private isDestroyed = false;
  private completionHandled = false;

  private constructor(
    workflowId: string,
    sessionId: string
  ) {
    this.workflowId = workflowId;
    this.sessionId = sessionId;
    this.setupEventListener();
  }

  /**
   * Start a new workflow and return tracker instance
   */
  static async startWorkflow(
    sessionId: string,
    taskDescription: string,
    projectDirectory: string,
    excludedPaths: string[] = [],
    config: WorkflowConfiguration = {}
  ): Promise<WorkflowTracker> {
    try {
      // Start the orchestrated workflow - this initiates the workflow orchestrator
      const response = await invoke<WorkflowCommandResponse>(
        "start_file_finder_workflow",
        {
          sessionId,
          taskDescription,
          projectDirectory,
          excludedPaths,
          timeoutMs: config.timeoutMs,
        }
      );

      const tracker = new WorkflowTracker(response.workflowId, sessionId);
      return tracker;
    } catch (error) {
      console.error("Error starting workflow:", error);
      
      // Extract meaningful error message from Tauri command error
      let errorMessage = 'Unknown error';
      if (error instanceof Error) {
        errorMessage = error.message;
      } else if (typeof error === 'string') {
        errorMessage = error;
      }
      
      // Pass through the original error message without wrapping
      throw new WorkflowError(
        errorMessage,
        '', // workflowId not available yet
        undefined,
        undefined,
        'WORKFLOW_START_FAILED'
      );
    }
  }

  /**
   * Get current workflow status
   */
  async getStatus(): Promise<WorkflowState> {
    if (this.isDestroyed) {
      throw new Error('WorkflowTracker has been destroyed');
    }

    try {
      const response = await invoke<WorkflowStatusResponse>(
        "get_workflow_status",
        { workflowId: this.workflowId }
      );

      return this.mapStatusResponseToState(response);
    } catch (error) {
      const workflowError = new WorkflowError(
        `Failed to get workflow status: ${error instanceof Error ? error.message : 'Unknown error'}`,
        this.workflowId,
        undefined,
        undefined,
        'STATUS_FETCH_FAILED'
      );
      this.notifyError(workflowError);
      throw workflowError;
    }
  }

  /**
   * Cancel the workflow
   */
  async cancel(): Promise<void> {
    if (this.isDestroyed) {
      throw new Error('WorkflowTracker has been destroyed');
    }

    
    try {
      const { cancelWorkflowAction } = await import("@/actions/workflows/workflow.actions");
      const result = await cancelWorkflowAction(this.workflowId);
      
      if (!result.isSuccess) {
        throw new Error(result.message || 'Failed to cancel workflow');
      }
    } catch (error) {
      console.error(`Failed to cancel workflow ${this.workflowId}:`, error);
      const workflowError = new WorkflowError(
        `Failed to cancel workflow: ${error instanceof Error ? error.message : 'Unknown error'}`,
        this.workflowId,
        undefined,
        undefined,
        'CANCEL_FAILED'
      );
      this.notifyError(workflowError);
      throw workflowError;
    }
  }

  /**
   * Get final results (only available when completed)
   */
  async getResults(): Promise<WorkflowResultsResponse> {
    if (this.isDestroyed) {
      throw new Error('WorkflowTracker has been destroyed');
    }

    try {
      const results = await invoke<WorkflowResultsResponse>(
        "get_workflow_results",
        { workflowId: this.workflowId }
      );
      return results;
    } catch (error) {
      const workflowError = new WorkflowError(
        `Failed to get workflow results: ${error instanceof Error ? error.message : 'Unknown error'}`,
        this.workflowId,
        undefined,
        undefined,
        'RESULTS_FETCH_FAILED'
      );
      this.notifyError(workflowError);
      throw workflowError;
    }
  }

  /**
   * Subscribe to workflow progress updates
   */
  onProgress(callback: WorkflowProgressCallback): UnsubscribeFunction {
    this.progressCallbacks.add(callback);
    return () => this.progressCallbacks.delete(callback);
  }

  /**
   * Subscribe to workflow completion
   */
  onComplete(callback: WorkflowCompleteCallback): UnsubscribeFunction {
    this.completeCallbacks.add(callback);
    return () => this.completeCallbacks.delete(callback);
  }

  /**
   * Subscribe to workflow errors
   */
  onError(callback: WorkflowErrorCallback): UnsubscribeFunction {
    this.errorCallbacks.add(callback);
    return () => this.errorCallbacks.delete(callback);
  }

  /**
   * Clean up resources
   */
  destroy(): void {
    this.isDestroyed = true;
    this.removeEventListener();
    this.progressCallbacks.clear();
    this.completeCallbacks.clear();
    this.errorCallbacks.clear();
  }

  /**
   * Get workflow ID
   */
  getWorkflowId(): string {
    return this.workflowId;
  }

  /**
   * Get session ID
   */
  getSessionId(): string {
    return this.sessionId;
  }

  /**
   * Refresh the workflow state and notify progress callbacks
   */
  async refreshState(): Promise<void> {
    if (this.isDestroyed) {
      throw new Error('WorkflowTracker has been destroyed');
    }

    try {
      const currentState = await this.getStatus();
      this.notifyProgress(currentState);
    } catch (error) {
      console.error('Error refreshing workflow state:', error);
      throw error;
    }
  }

  // Private methods

  private async setupEventListener(): Promise<void> {
    let statusUnlisten: UnlistenFn | null = null;
    let stageUnlisten: UnlistenFn | null = null;
    
    try {
      // Listen for workflow status events (workflow-status)
      statusUnlisten = await listen<WorkflowStatusEvent>(
        'workflow-status',
        (event) => {
          const statusEvent = event.payload;
          if (statusEvent.workflowId === this.workflowId) {
            // Always fetch fresh state from backend when status changes
            this.getStatus().then(fullState => {
              this.notifyProgress(fullState);
              
              // Check if workflow completed or failed
              if (statusEvent.status === WORKFLOW_STATUSES.BACKEND.COMPLETED && !this.completionHandled) {
                this.handleWorkflowCompletion();
              } else if (statusEvent.status === WORKFLOW_STATUSES.BACKEND.FAILED || statusEvent.status === WORKFLOW_STATUSES.BACKEND.CANCELED) {
                this.handleWorkflowFailure(statusEvent);
              }
            }).catch(error => {
              console.warn('Failed to fetch full state after status event:', error);
            });
          }
        }
      );
      
      // Also listen for stage events (workflow-stage) 
      stageUnlisten = await listen<WorkflowStageEvent>(
        'workflow-stage',
        (event) => {
          const stageEvent = event.payload;
          if (stageEvent.workflowId === this.workflowId) {
            // Update our internal state based on stage event
            this.handleStageEvent();
          }
        }
      );
      
      // Combine the unlisten functions with proper error handling
      this.eventUnlisten = () => {
        try {
          statusUnlisten?.();
        } catch (error) {
          console.warn('Error cleaning up status event listener:', error);
        }
        try {
          stageUnlisten?.();
        } catch (error) {
          console.warn('Error cleaning up stage event listener:', error);
        }
      };
    } catch (error) {
      // Cleanup partial listeners on error
      try {
        statusUnlisten?.();
      } catch (cleanupError) {
        console.warn('Error cleaning up partial status listener:', cleanupError);
      }
      try {
        stageUnlisten?.();
      } catch (cleanupError) {
        console.warn('Error cleaning up partial stage listener:', cleanupError);
      }
      console.warn('Failed to setup workflow event listeners:', error);
    }
  }

  private removeEventListener(): void {
    if (this.eventUnlisten) {
      this.eventUnlisten();
      this.eventUnlisten = null;
    }
  }

  private mapStatusResponseToState(response: WorkflowStatusResponse): WorkflowState {
    // Convert stage statuses to stage jobs with comprehensive mapping
    const stageJobs = response.stageStatuses.map(status => {
      const executionTimeMs = this.calculateStageExecutionTime(status);
      
      return {
        stage: WorkflowUtils.mapTaskTypeToEnum(status.taskType) || 'REGEX_FILE_FILTER',
        jobId: status.jobId || '',
        status: this.mapJobStatusString(status.status),
        dependsOn: status.dependsOn,
        createdAt: status.createdAt ? new Date(status.createdAt).getTime() : Date.now(),
        startedAt: status.startedAt ? new Date(status.startedAt).getTime() : undefined,
        completedAt: status.completedAt ? new Date(status.completedAt).getTime() : undefined,
        executionTimeMs,
        errorMessage: status.errorMessage,
        actualCost: status.actualCost, // Server-provided cost from API responses
      };
    });
    
    // Determine current stage from stageJobs
    const currentStage = this.determineCurrentStage(stageJobs, response.currentStage);
    
    // Calculate total execution time - prioritize response value, fallback to calculation
    const totalExecutionTimeMs = response.totalExecutionTimeMs || 
      this.calculateTotalExecutionTime(stageJobs, response.createdAt, response.completedAt);
    
    // Calculate total cost from stage jobs
    const totalActualCost = stageJobs.reduce((sum, job) => sum + (job.actualCost || 0), 0) || undefined;
    
    return {
      workflowId: response.workflowId,
      sessionId: response.sessionId || this.sessionId,
      projectHash: response.sessionId || this.sessionId,
      status: this.mapWorkflowStatusString(response.status),
      stageJobs,
      progressPercentage: response.progressPercentage,
      currentStage,
      createdAt: response.createdAt || Date.now(),
      updatedAt: response.updatedAt || Date.now(),
      completedAt: response.completedAt,
      totalExecutionTimeMs,
      errorMessage: response.errorMessage,
      taskDescription: response.taskDescription || '',
      projectDirectory: response.projectDirectory || '',
      excludedPaths: response.excludedPaths || [],
      timeoutMs: response.timeoutMs,
      totalActualCost, // Total server-provided cost across all stages
      intermediateData: {
        directoryTreeContent: undefined,
        rawRegexPatterns: undefined,
        locallyFilteredFiles: [],
        aiFilteredFiles: [],
        initialVerifiedPaths: [],
        initialUnverifiedPaths: [],
        initialCorrectedPaths: [],
        extendedVerifiedPaths: [],
        extendedUnverifiedPaths: [],
        extendedCorrectedPaths: [],
      },
    };
  }

  
  private handleStageEvent(): void {
    // Update internal state based on stage events
    // Since polling is disabled, we rely entirely on events for state updates
    
    // NOTE: We no longer fetch fresh status since polling is disabled
    // The status events provide comprehensive workflow state updates
    // Stage events are supplementary and don't require additional status fetches
  }
  
  private async handleWorkflowCompletion(): Promise<void> {
    // Mark completion as handled to prevent duplicate calls
    this.completionHandled = true;
    
    try {
      const results = await this.getResults();
      this.notifyComplete(results);
    } catch (error) {
      console.warn('Failed to fetch workflow results on completion:', error);
    }
  }

  private handleWorkflowFailure(statusEvent: WorkflowStatusEvent): void {
    // Create detailed error message from status event
    let errorMessage = statusEvent.errorMessage || statusEvent.message || 'Workflow failed';
    
    // Enhance error message with context if available
    if (statusEvent.currentStage) {
      errorMessage = `${errorMessage} (Stage: ${statusEvent.currentStage})`;
    }
    
    const workflowError = new WorkflowError(
      errorMessage,
      this.workflowId,
      statusEvent.currentStage,
      statusEvent.errorMessage,
      statusEvent.status === WORKFLOW_STATUSES.BACKEND.CANCELED ? 'WORKFLOW_CANCELED' : 'WORKFLOW_FAILED'
    );
    
    // Reset internal state to ensure clean retry
    this.completionHandled = false;
    
    this.notifyError(workflowError);
  }


  private mapWorkflowStatusString(status: string): WorkflowState['status'] {
    const lowerStatus = status.toLowerCase();
    switch (lowerStatus) {
      case WORKFLOW_STATUSES.BACKEND.RUNNING:
        return WORKFLOW_STATUSES.RUNNING;
      case WORKFLOW_STATUSES.BACKEND.COMPLETED:
        return WORKFLOW_STATUSES.COMPLETED;
      case WORKFLOW_STATUSES.BACKEND.FAILED:
        return WORKFLOW_STATUSES.FAILED;
      case WORKFLOW_STATUSES.BACKEND.CANCELED:
        return WORKFLOW_STATUSES.CANCELED;
      case WORKFLOW_STATUSES.BACKEND.PAUSED:
        return WORKFLOW_STATUSES.PAUSED;
      case WORKFLOW_STATUSES.BACKEND.CREATED:
      default:
        return WORKFLOW_STATUSES.CREATED;
    }
  }
  
  private mapJobStatusString(status: string): any {
    switch (status.toLowerCase()) {
      case 'idle':
      case 'created':
      case 'queued':
        return 'queued';
      case 'acknowledged_by_worker':
      case 'preparing':
      case 'preparing_input':
      case 'generating_stream':
      case 'processing_stream':
      case 'running':
        return 'running';
      case 'completed':
      case 'completed_by_tag':
        return 'completed';
      case 'failed':
        return 'failed';
      case 'canceled':
        return 'canceled';
      default:
        return 'idle';
    }
  }
  

  private notifyProgress(state: WorkflowState): void {
    this.progressCallbacks.forEach(callback => {
      try {
        callback(state);
      } catch (error) {
        console.error('Error in progress callback:', error);
      }
    });
  }

  private notifyComplete(results: WorkflowResultsResponse): void {
    this.completeCallbacks.forEach(callback => {
      try {
        callback(results);
      } catch (error) {
        console.error('Error in complete callback:', error);
      }
    });
  }

  private notifyError(error: WorkflowError): void {
    this.errorCallbacks.forEach(callback => {
      try {
        callback(error);
      } catch (callbackError) {
        console.error('Error in error callback:', callbackError);
      }
    });
  }
  
  private calculateStageExecutionTime(status: StageStatus): number | undefined {
    if (!status.startedAt) return undefined;
    
    const startTime = new Date(status.startedAt).getTime();
    if (status.completedAt) {
      const endTime = new Date(status.completedAt).getTime();
      return endTime - startTime;
    }
    
    // For running stages, calculate current execution time
    if (status.status.toLowerCase() === 'running' || 
        status.status.toLowerCase() === 'preparing' ||
        status.status.toLowerCase() === 'processing_stream') {
      return Date.now() - startTime;
    }
    
    return undefined;
  }
  
  private determineCurrentStage(stageJobs: any[], responseCurrentStage: string): WorkflowStage | undefined {
    // First, try to use the current stage from the response
    if (responseCurrentStage) {
      return WorkflowUtils.mapTaskTypeToEnum(responseCurrentStage) || undefined;
    }
    
    // Find the first running stage
    const runningStage = stageJobs.find(job => 
      job.status === 'running' || 
      job.status === 'preparing' || 
      job.status === 'processing_stream'
    );
    
    if (runningStage) {
      return runningStage.stage;
    }
    
    // Find the first pending stage (after completed stages)
    const pendingStage = stageJobs.find(job => 
      job.status === 'queued' || 
      job.status === 'idle' || 
      job.status === 'created'
    );
    
    return pendingStage?.stage;
  }
  
  private calculateTotalExecutionTime(stageJobs: any[], createdAt?: number, completedAt?: number): number | undefined {
    if (!createdAt) return undefined;
    
    if (completedAt) {
      return completedAt - createdAt;
    }
    
    // For running workflows, calculate current total time
    const hasRunningStages = stageJobs.some(job => 
      job.status === 'running' || 
      job.status === 'preparing' || 
      job.status === 'processing_stream'
    );
    
    if (hasRunningStages) {
      return Date.now() - createdAt;
    }
    
    return undefined;
  }
}

/**
 * Custom Error class for workflow-related errors
 */
class WorkflowError extends Error implements WorkflowErrorType {
  workflowId: string;
  stage?: any;
  jobId?: string;
  code?: string;

  constructor(
    message: string,
    workflowId: string,
    stage?: any,
    jobId?: string,
    code?: string
  ) {
    super(message);
    this.name = 'WorkflowError';
    this.workflowId = workflowId;
    this.stage = stage;
    this.jobId = jobId;
    this.code = code;
  }
}

/**
 * Utility functions for workflow management
 */
export const WorkflowUtils = {
  mapTaskTypeToEnum(taskType: string): WorkflowStage | null {
    const upperCaseTaskType = taskType.toUpperCase();
    const validStages: WorkflowStage[] = [
      'ROOT_FOLDER_SELECTION',
      'REGEX_FILE_FILTER',
      'FILE_RELEVANCE_ASSESSMENT', 
      'EXTENDED_PATH_FINDER',
      'PATH_CORRECTION',
      'WEB_SEARCH_PROMPTS_GENERATION',
      'WEB_SEARCH_EXECUTION'
    ];
    return validStages.includes(upperCaseTaskType as WorkflowStage) ? (upperCaseTaskType as WorkflowStage) : null;
  },

  /**
   * Calculate overall progress percentage from stage jobs
   */
  calculateProgress(stageJobs: any[]): number {
    if (stageJobs.length === 0) return 0;
    
    const totalStages = 5; // Updated to match FileFinderWorkflow: ROOT_FOLDER_SELECTION, REGEX_FILE_FILTER, FILE_RELEVANCE_ASSESSMENT, EXTENDED_PATH_FINDER, PATH_CORRECTION
    const completedStages = stageJobs.filter(job => job.status === 'completed' || job.status === 'completedByTag').length;
    const runningStages = stageJobs.filter(job => 
      job.status === 'running' || 
      job.status === 'preparing' || 
      job.status === 'preparingInput' ||
      job.status === 'generatingStream' ||
      job.status === 'processingStream'
    ).length;
    
    // Give partial credit for running stages
    const progress = (completedStages + (runningStages * 0.5)) / totalStages;
    return Math.min(Math.max(progress * 100, 0), 100);
  },

  /**
   * Get human-readable stage name
   */
  getStageName(stage: string): string {
    const stageNames: Record<string, string> = {
      'ROOT_FOLDER_SELECTION': 'Root Folder Selection',
      'REGEX_FILE_FILTER': 'Filtering Files with Regex',
      'FILE_RELEVANCE_ASSESSMENT': 'AI File Relevance Assessment',
      'EXTENDED_PATH_FINDER': 'Extended Path Finding',
      'PATH_CORRECTION': 'Path Correction',
      'WEB_SEARCH_PROMPTS_GENERATION': 'Web Search Prompts Generation',
      'WEB_SEARCH_EXECUTION': 'Web Search Execution',
    };
    return stageNames[stage] || stage;
  },

  /**
   * Get stage description
   */
  getStageDescription(stage: string): string {
    const descriptions: Record<string, string> = {
      'ROOT_FOLDER_SELECTION': 'Selecting the root folder for file analysis',
      'REGEX_FILE_FILTER': 'Creating regex patterns to filter relevant files',
      'FILE_RELEVANCE_ASSESSMENT': 'Using AI to assess relevance of filtered files to the task',
      'EXTENDED_PATH_FINDER': 'Finding additional relevant paths for comprehensive results',
      'PATH_CORRECTION': 'Path correction and validation',
      'WEB_SEARCH_PROMPTS_GENERATION': 'Generating sophisticated research prompts for web search',
      'WEB_SEARCH_EXECUTION': 'Executing web searches and synthesizing results into actionable insights',
    };
    return descriptions[stage] || 'Processing stage';
  },

  /**
   * Check if workflow is in a terminal state
   */
  isTerminalState(status: string): boolean {
    return WORKFLOW_STATUSES.TERMINAL.includes(status as any);
  },

  /**
   * Check if workflow is running
   */
  isRunning(status: string): boolean {
    return status === WORKFLOW_STATUSES.RUNNING;
  },

  /**
   * Format execution time
   */
  formatExecutionTime(timeMs?: number): string {
    if (!timeMs) return 'N/A';
    
    if (timeMs < 1000) {
      return `${timeMs}ms`;
    } else if (timeMs < 60000) {
      return `${(timeMs / 1000).toFixed(1)}s`;
    } else {
      const minutes = Math.floor(timeMs / 60000);
      const seconds = Math.floor((timeMs % 60000) / 1000);
      return `${minutes}m ${seconds}s`;
    }
  },
};

/**
 * Create a workflow tracker from an existing workflow ID
 * Useful for reconnecting to workflows in progress
 */
export async function createWorkflowTracker(
  workflowId: string,
  sessionId: string
): Promise<WorkflowTracker> {
  const tracker = new (WorkflowTracker as any)(workflowId, sessionId);
  
  // Event-based updates will handle workflow state changes
  // Note: getStatus() calls may fail for completed workflows due to cleanup
  return tracker;
}