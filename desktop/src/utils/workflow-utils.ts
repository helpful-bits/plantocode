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

/**
 * WorkflowTracker class for managing File Finder Workflows
 * Provides a high-level interface for workflow lifecycle management
 */
export class WorkflowTracker {
  private workflowId: string;
  private sessionId: string;
  private pollInterval: number;
  private pollTimer: NodeJS.Timeout | null = null;
  private eventUnlisten: UnlistenFn | null = null;
  private progressCallbacks: Set<WorkflowProgressCallback> = new Set();
  private completeCallbacks: Set<WorkflowCompleteCallback> = new Set();
  private errorCallbacks: Set<WorkflowErrorCallback> = new Set();
  private isDestroyed = false;

  private constructor(
    workflowId: string,
    sessionId: string,
    pollInterval = 1000
  ) {
    this.workflowId = workflowId;
    this.sessionId = sessionId;
    this.pollInterval = pollInterval;
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
      tracker.startPolling();
      return tracker;
    } catch (error) {
      console.error("Error", error);
      throw new WorkflowError(
        `Failed to start workflow: ${error instanceof Error ? error.message : 'Unknown error'}`,
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
        "get_file_finder_workflow_status",
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
      // Use the cancel command that delegates to WorkflowOrchestrator::cancel_workflow
      await invoke<void>("cancel_file_finder_workflow", {
        workflowId: this.workflowId,
      });
      this.stopPolling();
    } catch (error) {
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
        "get_file_finder_workflow_results",
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
    this.stopPolling();
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

  // Private methods

  private startPolling(): void {
    if (this.pollTimer || this.isDestroyed) return;

    this.pollTimer = setInterval(async () => {
      try {
        const state = await this.getStatus();
        this.notifyProgress(state);

        if (state.status === 'Completed') {
          try {
            const results = await this.getResults();
            this.notifyComplete(results);
          } catch (error) {
            // Results fetch failed, but workflow is complete
            console.warn('Failed to fetch workflow results:', error);
          }
          this.stopPolling();
        } else if (state.status === 'Failed' || state.status === 'Canceled') {
          this.stopPolling();
        }
      } catch (error) {
        // Error already handled in getStatus, just stop polling
        this.stopPolling();
      }
    }, this.pollInterval);
  }

  private stopPolling(): void {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
  }

  private async setupEventListener(): Promise<void> {
    try {
      // Listen for workflow status events (file-finder-workflow-status)
      this.eventUnlisten = await listen<WorkflowStatusEvent>(
        'file-finder-workflow-status',
        (event) => {
          const statusEvent = event.payload;
          if (statusEvent.workflowId === this.workflowId) {
            // Convert status event to workflow state
            const state = this.mapStatusEventToState(statusEvent);
            this.notifyProgress(state);
            
            // Check if workflow completed
            if (statusEvent.status === 'Completed') {
              this.handleWorkflowCompletion();
            }
          }
        }
      );
      
      // Also listen for stage events (file-finder-workflow-stage) 
      const stageUnlisten = await listen<WorkflowStageEvent>(
        'file-finder-workflow-stage',
        (event) => {
          const stageEvent = event.payload;
          if (stageEvent.workflowId === this.workflowId) {
            // Update our internal state based on stage event
            this.handleStageEvent(stageEvent);
          }
        }
      );
      
      // Combine the unlisten functions
      const originalUnlisten = this.eventUnlisten;
      this.eventUnlisten = () => {
        originalUnlisten();
        stageUnlisten();
      };
    } catch (error) {
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
        stage: this.mapStageNameToType(status.stageName),
        jobId: status.jobId || '',
        status: this.mapJobStatusString(status.status),
        dependsOn: status.dependsOn,
        createdAt: status.createdAt ? new Date(status.createdAt).getTime() : Date.now(),
        startedAt: status.startedAt ? new Date(status.startedAt).getTime() : undefined,
        completedAt: status.completedAt ? new Date(status.completedAt).getTime() : undefined,
        executionTimeMs,
        errorMessage: status.errorMessage,
      };
    });
    
    // Determine current stage from stageJobs
    const currentStage = this.determineCurrentStage(stageJobs, response.currentStage);
    
    // Calculate total execution time - prioritize response value, fallback to calculation
    const totalExecutionTimeMs = response.totalExecutionTimeMs || 
      this.calculateTotalExecutionTime(stageJobs, response.createdAt, response.completedAt);
    
    return {
      workflowId: response.workflowId,
      sessionId: response.sessionId || this.sessionId,
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
      intermediateData: {
        directoryTreeContent: undefined,
        rawRegexPatterns: undefined,
        locallyFilteredFiles: [],
        initialVerifiedPaths: [],
        initialUnverifiedPaths: [],
        initialCorrectedPaths: [],
        extendedVerifiedPaths: [],
        extendedUnverifiedPaths: [],
        extendedCorrectedPaths: [],
      },
    };
  }

  private mapStatusEventToState(event: WorkflowStatusEvent): WorkflowState {
    // This is a simplified mapping based on status events
    // Note: stageJobs array is empty as event-based updates may not fully populate the WorkflowState
    // The notifyProgress method calls getStatus which fetches full state, mitigating this limitation
    return {
      workflowId: event.workflowId,
      sessionId: this.sessionId,
      status: event.status,
      stageJobs: [], // Event-based updates don't provide full stage job details
      progressPercentage: event.progress,
      currentStage: event.currentStage ? this.mapStageNameToType(event.currentStage) : undefined,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      errorMessage: event.errorMessage,
      taskDescription: '',
      projectDirectory: '',
      excludedPaths: [],
      timeoutMs: undefined,
      intermediateData: {
        directoryTreeContent: undefined,
        rawRegexPatterns: undefined,
        locallyFilteredFiles: [],
        initialVerifiedPaths: [],
        initialUnverifiedPaths: [],
        initialCorrectedPaths: [],
        extendedVerifiedPaths: [],
        extendedUnverifiedPaths: [],
        extendedCorrectedPaths: [],
      },
    };
  }
  
  private handleStageEvent(event: WorkflowStageEvent): void {
    // Update internal state based on stage events
    // For now, we log the event and rely on polling for full state updates
    // Future enhancement: merge stage event data with current workflow state
    console.debug('Stage event received:', {
      workflowId: event.workflowId,
      stage: event.stage,
      jobId: event.jobId,
      status: event.status,
      message: event.message
    });
    
    // Trigger a fresh status fetch to get updated state
    // This ensures UI reflects the latest stage changes
    this.getStatus().then(state => {
      this.notifyProgress(state);
    }).catch(error => {
      console.warn('Failed to fetch updated status after stage event:', error);
    });
  }
  
  private async handleWorkflowCompletion(): Promise<void> {
    try {
      const results = await this.getResults();
      this.notifyComplete(results);
    } catch (error) {
      console.warn('Failed to fetch workflow results on completion:', error);
    }
    this.stopPolling();
  }

  private mapWorkflowStatusString(status: string): WorkflowState['status'] {
    switch (status.toLowerCase()) {
      case 'running':
        return 'Running';
      case 'completed':
        return 'Completed';
      case 'failed':
        return 'Failed';
      case 'canceled':
        return 'Canceled';
      case 'created':
      default:
        return 'Created';
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
  
  private mapStageNameToType(stageName: string): WorkflowStage {
    // Handle both SCREAMING_SNAKE_CASE from Rust backend and human-readable formats
    const normalizedStage = stageName.toUpperCase().replace(/[\s-]/g, '_');
    
    switch (normalizedStage) {
      case 'GENERATING_DIR_TREE':
      case 'GENERATING_DIRECTORY_TREE':
        return 'GENERATING_DIR_TREE';
      case 'GENERATING_REGEX':
      case 'GENERATING_REGEX_PATTERNS':
        return 'GENERATING_REGEX';
      case 'LOCAL_FILTERING':
      case 'LOCAL_FILE_FILTERING':
        return 'LOCAL_FILTERING';
      case 'INITIAL_PATH_FINDER':
      case 'INITIAL_PATH_FINDING':
        return 'INITIAL_PATH_FINDER';
      case 'INITIAL_PATH_CORRECTION':
        return 'INITIAL_PATH_CORRECTION';
      case 'EXTENDED_PATH_FINDER':
      case 'EXTENDED_PATH_FINDING':
        return 'EXTENDED_PATH_FINDER';
      case 'EXTENDED_PATH_CORRECTION':
        return 'EXTENDED_PATH_CORRECTION';
      default:
        console.warn(`Unknown stage name: ${stageName}, defaulting to GENERATING_DIR_TREE`);
        return 'GENERATING_DIR_TREE';
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
      return this.mapStageNameToType(responseCurrentStage);
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
  /**
   * Calculate overall progress percentage from stage jobs
   */
  calculateProgress(stageJobs: any[]): number {
    if (stageJobs.length === 0) return 0;
    
    const totalStages = 7; // Updated to match backend: GENERATING_DIR_TREE, GENERATING_REGEX, LOCAL_FILTERING, INITIAL_PATH_FINDER, INITIAL_PATH_CORRECTION, EXTENDED_PATH_FINDER, EXTENDED_PATH_CORRECTION
    const completedStages = stageJobs.filter(job => job.status === 'completed' || job.status === 'completed_by_tag').length;
    const runningStages = stageJobs.filter(job => 
      job.status === 'running' || 
      job.status === 'preparing' || 
      job.status === 'preparing_input' ||
      job.status === 'generating_stream' ||
      job.status === 'processing_stream'
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
      'GENERATING_DIR_TREE': 'Generating Directory Tree',
      'GENERATING_REGEX': 'Generating Regex Patterns',
      'LOCAL_FILTERING': 'Local File Filtering',
      'INITIAL_PATH_FINDER': 'Initial Path Finding',
      'INITIAL_PATH_CORRECTION': 'Initial Path Correction',
      'EXTENDED_PATH_FINDER': 'Extended Path Finding',
      'EXTENDED_PATH_CORRECTION': 'Extended Path Correction',
    };
    return stageNames[stage] || stage;
  },

  /**
   * Get stage description
   */
  getStageDescription(stage: string): string {
    const descriptions: Record<string, string> = {
      'GENERATING_DIR_TREE': 'Analyzing project structure and generating directory tree',
      'GENERATING_REGEX': 'Creating regex patterns based on task description',
      'LOCAL_FILTERING': 'Filtering files based on local patterns and criteria',
      'INITIAL_PATH_FINDER': 'Finding initial relevant paths using AI analysis',
      'INITIAL_PATH_CORRECTION': 'Correcting and validating initial file paths',
      'EXTENDED_PATH_FINDER': 'Finding additional relevant paths for comprehensive results',
      'EXTENDED_PATH_CORRECTION': 'Final path correction and validation',
    };
    return descriptions[stage] || 'Processing stage';
  },

  /**
   * Check if workflow is in a terminal state
   */
  isTerminalState(status: string): boolean {
    return ['Completed', 'Failed', 'Canceled'].includes(status);
  },

  /**
   * Check if workflow is running
   */
  isRunning(status: string): boolean {
    return status === 'Running';
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
  sessionId: string,
  pollInterval = 1000
): Promise<WorkflowTracker> {
  const tracker = new (WorkflowTracker as any)(workflowId, sessionId, pollInterval);
  
  // Verify the workflow exists by getting its status
  try {
    await tracker.getStatus();
    tracker.startPolling();
    return tracker;
  } catch (error) {
    tracker.destroy();
    throw error;
  }
}