/**
 * Session and background jobs related types
 * These types represent the structures used for sessions and background jobs
 */

// Import job status types and constants from consolidated definitions
import { type JobStatus, JOB_STATUSES } from './task-type-defs';
export { type JobStatus, JOB_STATUSES };

// Type for API types
export type ApiType = "openrouter" | "filesystem";

// Import task types and metadata from consolidated definitions
import { type TaskType, TaskTypeDetails } from './task-type-defs';
export { type TaskType, TaskTypeDetails };

/**
 * Interface defining structured job metadata
 * Aligned with backend JobWorkerMetadata structure
 */
export interface JobMetadata {
  // Core fields from JobWorkerMetadata - top level workflow metadata
  jobTypeForWorker?: string; // e.g., "PATH_FINDER", "TEXT_IMPROVEMENT"
  jobPayloadForWorker?: any; // The full JobPayload enum from backend - task-specific payload data nested
  jobPriorityForWorker?: number;
  workflowId?: string;
  workflowStage?: string; // e.g., "DirectoryTreeGeneration", "PathFinding", "ResultProcessing"
  additionalParams?: any; // Additional metadata from backend

  // Common extracted fields for UI convenience - extracted from jobPayloadForWorker
  backgroundJobId?: string;
  sessionId?: string;
  taskDescription?: string;
  projectDirectory?: string;
  targetField?: string; // Extracted from jobPayloadForWorker.data.targetField

  // Streaming fields
  isStreaming?: boolean;
  streamProgress?: number; // Percentage 0-100
  responseLength?: number; // Characters received so far
  estimatedTotalLength?: number; // Estimated total characters for progress calculation
  lastStreamUpdateTime?: number; // Timestamp of last stream update
  streamStartTime?: number; // Timestamp when streaming started

  // Output fields
  outputPath?: string; // For implementation plans, file outputs, etc.
  sessionName?: string; // For implementation plans and session-related tasks

  // Retry and error handling
  retryCount?: number;
  errors?: Array<{
    attempt: number;
    time: string;
    message: string;
  }>;

  // Model and token information
  modelUsed?: string;
  tokensUsed?: number;

  // Allow additional dynamic fields for extensibility
  [key: string]: unknown;
}

/**
 * Background Job interface matching the Rust BackgroundJob struct
 * All properties use camelCase for UI consumption, Tauri handles snake_case conversion automatically
 */
export interface BackgroundJob {
  id: string;
  sessionId: string;
  apiType: ApiType;
  taskType: TaskType;
  status: JobStatus;
  createdAt: number;
  updatedAt?: number;
  startTime?: number;
  endTime?: number;
  lastUpdate?: number;
  prompt: string;
  response?: string;
  projectDirectory?: string;
  tokensSent?: number;
  tokensReceived?: number;
  totalTokens?: number;
  inputCost?: number;
  outputCost?: number;
  totalCost?: number;
  charsReceived?: number;
  statusMessage?: string;
  errorMessage?: string;
  modelUsed?: string;
  maxOutputTokens?: number;
  temperature?: number;
  includeSyntax?: boolean;
  metadata?: JobMetadata | string | null;
  systemPromptId?: string; // ID of the system prompt used for this job
}

// Session structure including background jobs and task settings
export type Session = {
  id: string;
  name: string; // User-provided name for the session
  projectDirectory: string;
  projectHash?: string; // Hashed project directory for database lookups
  taskDescription?: string; // Task description field
  searchTerm?: string; // Search filter for files
  titleRegex?: string; // Regex for file titles
  contentRegex?: string; // Regex for file contents
  negativeTitleRegex?: string; // Negative regex for file titles
  negativeContentRegex?: string; // Negative regex for file contents
  titleRegexDescription?: string; // Natural language description for title regex
  contentRegexDescription?: string; // Natural language description for content regex
  negativeTitleRegexDescription?: string; // Natural language description for negative title regex
  negativeContentRegexDescription?: string; // Natural language description for negative content regex
  regexSummaryExplanation?: string; // Human-readable summary of all regex filters
  isRegexActive: boolean; // Whether regex filtering is active
  updatedAt?: number; // Timestamp of last update (managed by repository)
  createdAt: number; // Timestamp when the session was created
  includedFiles: string[]; // Paths relative to projectDirectory that are selected
  forceExcludedFiles: string[]; // Paths forced excluded even if they match inclusion criteria
  backgroundJobs?: BackgroundJob[]; // Associated background jobs
  codebaseStructure?: string; // ASCII structure of codebase
  searchSelectedFilesOnly: boolean; // Whether to search only in selected files
  modelUsed?: string; // The model used for this session
};
