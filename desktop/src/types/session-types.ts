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
 * Aligned with backend JobWorkerMetadata structure from desktop/src-tauri/src/jobs/types.rs
 */
export interface JobMetadata {
  // Core fields from JobWorkerMetadata - top level workflow metadata
  jobTypeForWorker?: string; // e.g., "PATH_FINDER", "TEXT_IMPROVEMENT"
  jobPayloadForWorker?: any; // The full JobPayload enum from backend - task-specific payload data nested
  jobPriorityForWorker?: number;
  workflowId?: string;
  workflowStage?: string; // e.g., "DirectoryTreeGeneration", "PathFinding", "ResultProcessing"
  
  // Additional parameters from backend - contains dynamic/custom metadata
  additionalParams?: Record<string, any>;

  // New field: Parsed jobPayloadForWorker for easier UI access
  parsedJobPayload?: any; // Deserialized jobPayloadForWorker content for easier component access

  // Common extracted fields for UI convenience - extracted from jobPayloadForWorker
  backgroundJobId?: string;
  sessionId?: string;
  taskDescription?: string;
  projectDirectory?: string;

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
  includedFiles: string[]; // Array of comparablePath strings (normalized, project-relative paths) that are selected
  forceExcludedFiles: string[]; // Array of comparablePath strings (normalized, project-relative paths) forced excluded even if they match inclusion criteria
  backgroundJobs?: BackgroundJob[]; // Associated background jobs
  codebaseStructure?: string; // ASCII structure of codebase
  searchSelectedFilesOnly: boolean; // Whether to search only in selected files
  modelUsed?: string; // The model used for this session
};
