/**
 * TypeScript types for the File Finder Workflow system
 * These types provide comprehensive type safety for the new multi-stage workflow architecture
 */

// Core workflow stage definitions - aligned with backend WorkflowStage enum string representations
// These match the SCREAMING_SNAKE_CASE enum variants from the Rust backend
export type WorkflowStage =
  | 'ROOT_FOLDER_SELECTION'
  | 'REGEX_FILE_FILTER'
  | 'FILE_RELEVANCE_ASSESSMENT'
  | 'EXTENDED_PATH_FINDER'
  | 'PATH_CORRECTION'
  | 'WEB_SEARCH_PROMPTS_GENERATION'
  | 'WEB_SEARCH_EXECUTION';

// Workflow status - matches backend WorkflowStatus string representations
export type WorkflowStatus =
  | 'Created'
  | 'Running'
  | 'Paused'
  | 'Completed'
  | 'Failed'
  | 'Canceled';

// Workflow status constants - organized by category for easy use
export const WORKFLOW_STATUSES = {
  CREATED: 'Created' as const,
  RUNNING: 'Running' as const,
  PAUSED: 'Paused' as const,
  COMPLETED: 'Completed' as const,
  FAILED: 'Failed' as const,
  CANCELED: 'Canceled' as const,
  
  // Status groups for filtering/logic
  ACTIVE: ['Created', 'Running', 'Paused'] as WorkflowStatus[],
  TERMINAL: ['Completed', 'Failed', 'Canceled'] as WorkflowStatus[],
  TERMINAL_SUCCESS: ['Completed'] as WorkflowStatus[],
  TERMINAL_FAILURE: ['Failed', 'Canceled'] as WorkflowStatus[],
  
  // Backend string representations (lowercase)
  BACKEND: {
    CREATED: 'created' as const,
    RUNNING: 'running' as const,
    PAUSED: 'paused' as const,
    COMPLETED: 'completed' as const,
    FAILED: 'failed' as const,
    CANCELED: 'canceled' as const,
  }
} as const;

// Job status enum aligned with backend JobStatus string representations
export type JobStatus =
  | 'idle'
  | 'created'
  | 'queued'
  | 'acknowledgedByWorker'
  | 'preparing'
  | 'preparingInput'
  | 'generatingStream'
  | 'processingStream'
  | 'running'
  | 'completedByTag'
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
  durationMs?: number; // Duration of LLM API call in milliseconds
  errorMessage?: string;
  subStatusMessage?: string;
  actualCost?: number | null | undefined; // Server-provided cost from API responses
}

// Complete workflow state
export interface WorkflowState {
  workflowId: string;
  sessionId: string;
  projectHash: string;
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
  totalActualCost?: number | null | undefined; // Total server-provided cost across all stages
}

// Command response types
export interface WorkflowCommandResponse {
  workflowId: string;
  firstStageJobId: string;
  status: string;
}

// Response from get_workflow_status command - matches WorkflowStatusResponse in backend
export interface WorkflowStatusResponse {
  workflowId: string;
  sessionId: string;
  status: string; // String representation from backend (lowercase: "running", "completed", etc.)
  currentStage: string; // Human-readable display name from WorkflowStage::display_name()
  progressPercentage: number;
  stageStatuses: StageStatus[]; // All stages with their current status
  errorMessage?: string;
  createdAt?: number; // Unix timestamp
  updatedAt?: number; // Unix timestamp
  completedAt?: number; // Unix timestamp
  totalExecutionTimeMs?: number; // Total workflow execution time
  projectHash?: string;
  taskDescription?: string;
  projectDirectory?: string;
  excludedPaths?: string[];
  timeoutMs?: number;
}

// Stage status from backend - matches StageStatus struct in file_finder_workflow_commands.rs
export interface StageStatus {
  stageName: string; // Human-readable display name from WorkflowStage::display_name()
  taskType: string;
  jobId?: string; // Populated from WorkflowStageJob.jobId for active/completed stages
  status: string; // String representation of JobStatus from backend
  progressPercentage: number;
  startedAt?: string; // ISO string timestamp
  completedAt?: string; // ISO string timestamp
  dependsOn?: string;
  createdAt?: string; // ISO string timestamp
  errorMessage?: string;
  executionTimeMs?: number; // Calculated execution time for this specific stage
  durationMs?: number; // Duration of LLM API call in milliseconds
  subStatusMessage?: string; // Detailed stage progress message
  actualCost?: number | null | undefined; // Server-provided cost from API responses
}

// Results from completed workflow
export interface WorkflowResultsResponse {
  workflowId: string;
  selectedFiles: string[];
  stageResults: Record<string, any>;
  totalExecutionTime: number;
  intermediateData?: WorkflowIntermediateData;
  totalActualCost?: number | null | undefined; // Total server-provided cost across all stages
}

// Detailed intermediate data from workflow stages
export interface WorkflowIntermediateData {
  directoryTreeContent?: string;
  rawRegexPatterns?: any;
  locallyFilteredFiles: string[];
  aiFilteredFiles: string[];
  initialVerifiedPaths: string[];
  initialUnverifiedPaths: string[];
  initialCorrectedPaths: string[];
  extendedVerifiedPaths: string[];
  extendedUnverifiedPaths: string[];
  extendedCorrectedPaths: string[];
  webSearchPrompts?: string[];
  webSearchResults?: string[];
  workflowCompletionMessage?: string;
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
  status: (typeof WORKFLOW_STATUSES.BACKEND)[keyof typeof WORKFLOW_STATUSES.BACKEND];
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

// Cleanup function
export type UnsubscribeFunction = () => void;