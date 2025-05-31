/**
 * TypeScript types for the File Finder Workflow system
 * These types provide comprehensive type safety for the new multi-stage workflow architecture
 */

// Core workflow stage definitions - aligned with backend WorkflowStage enum string representations
export type WorkflowStage =
  | 'GENERATING_DIR_TREE'
  | 'GENERATING_REGEX'
  | 'LOCAL_FILTERING'
  | 'INITIAL_PATH_FINDER'
  | 'INITIAL_PATH_CORRECTION'
  | 'EXTENDED_PATH_FINDER'
  | 'EXTENDED_PATH_CORRECTION';

export type WorkflowStatus =
  | 'Created'
  | 'Running'
  | 'Paused'
  | 'Completed'
  | 'Failed'
  | 'Canceled';

// Job status enum aligned with backend JobStatus
export type JobStatus =
  | 'idle'
  | 'created'
  | 'queued'
  | 'acknowledged_by_worker'
  | 'preparing'
  | 'preparing_input'
  | 'generating_stream'
  | 'processing_stream'
  | 'running'
  | 'completed_by_tag'
  | 'completed'
  | 'failed'
  | 'canceled';

// Individual stage job within a workflow
export interface WorkflowStageJob {
  stage: WorkflowStage;
  jobId: string;
  status: JobStatus;
  dependsOn?: string;
  createdAt: number;
  startedAt?: number;
  completedAt?: number;
  executionTimeMs?: number;
  errorMessage?: string;
  subStatusMessage?: string;
}

// Complete workflow state
export interface WorkflowState {
  workflowId: string;
  sessionId: string;
  status: WorkflowStatus;
  stageJobs: WorkflowStageJob[];
  progressPercentage: number;
  currentStage?: WorkflowStage; // Made optional since it comes from current stage calculation
  createdAt: number;
  updatedAt: number;
  completedAt?: number;
  totalExecutionTimeMs?: number;
  errorMessage?: string;
  taskDescription: string;
  projectDirectory: string;
  excludedPaths: string[];
  timeoutMs?: number;
  intermediateData: WorkflowIntermediateData;
}

// Command response types
export interface WorkflowCommandResponse {
  workflowId: string;
  firstStageJobId: string;
  status: string;
}

export interface WorkflowStatusResponse {
  workflowId: string;
  status: string; // String representation from backend
  currentStage: string; // String representation from backend  
  progressPercentage: number;
  stageStatuses: StageStatus[]; // Rich structure containing all stage information
  errorMessage?: string;
  createdAt?: number;
  updatedAt?: number;
  completedAt?: number;
  totalExecutionTimeMs?: number; // Total workflow execution time
  sessionId?: string;
  taskDescription?: string;
  projectDirectory?: string;
  excludedPaths?: string[];
  timeoutMs?: number;
}

export interface StageStatus {
  stageName: string;
  jobId?: string; // Should be reliably available for failed stages
  status: string;
  progressPercentage: number;
  startedAt?: string;
  completedAt?: string;
  dependsOn?: string;
  createdAt?: string;
  errorMessage?: string;
  executionTimeMs?: number; // Execution time for this specific stage
  subStatusMessage?: string; // Detailed stage progress message
}

// Results from completed workflow
export interface WorkflowResultsResponse {
  workflowId: string;
  finalPaths: string[];
  stageResults: Record<string, any>;
  totalExecutionTime: number;
  intermediateData?: WorkflowIntermediateData;
}

// Detailed intermediate data from workflow stages
export interface WorkflowIntermediateData {
  directoryTreeContent?: string;
  rawRegexPatterns?: any;
  locallyFilteredFiles: string[];
  initialVerifiedPaths: string[];
  initialUnverifiedPaths: string[];
  initialCorrectedPaths: string[];
  extendedVerifiedPaths: string[];
  extendedUnverifiedPaths: string[];
  extendedCorrectedPaths: string[];
}

// Progress event payload from backend
export interface WorkflowProgressEvent {
  workflowId: string;
  stage: string; // String representation from backend
  status: string; // String representation from backend
  message: string;
  data?: any;
}

// Status event from backend (file-finder-workflow-status)
export interface WorkflowStatusEvent {
  workflowId: string;
  status: WorkflowStatus;
  progress: number;
  currentStage?: string;
  message: string;
  errorMessage?: string;
}

// Stage event from backend (file-finder-workflow-stage)
export interface WorkflowStageEvent {
  workflowId: string;
  stage: WorkflowStage;
  jobId: string;
  status: JobStatus;
  message: string;
  errorMessage?: string;
  data?: any;
}

// Error types
export interface WorkflowError extends Error {
  workflowId: string;
  stage?: WorkflowStage;
  jobId?: string;
  code?: string;
}

// Performance monitoring types
export interface WorkflowMetrics {
  workflowId: string;
  totalExecutionTime: number;
  stageExecutionTimes: Record<WorkflowStage, number>;
  memoryUsage: {
    peak: number;
    average: number;
  };
  throughput: {
    filesProcessed: number;
    filesPerSecond: number;
  };
}

export interface StageMetrics {
  stage: WorkflowStage;
  executionTime: number;
  inputSize: number;
  outputSize: number;
  memoryUsage: number;
  success: boolean;
  errorMessage?: string;
}

export interface PerformanceInsights {
  averageExecutionTime: number;
  slowestStage: WorkflowStage;
  fastestStage: WorkflowStage;
  failureRate: number;
  recommendations: string[];
}

// Workflow configuration
export interface WorkflowConfiguration {
  timeoutMs?: number;
  maxRetries?: number;
  excludedPaths?: string[];
  stageSettings?: {
    [K in WorkflowStage]?: Record<string, any>;
  };
}

// Event listener types
export type WorkflowProgressCallback = (state: WorkflowState) => void;
export type WorkflowCompleteCallback = (results: WorkflowResultsResponse) => void;
export type WorkflowErrorCallback = (error: WorkflowError) => void;

// Subscription cleanup function
export type UnsubscribeFunction = () => void;