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

export interface JobMetadata {
  jobPayloadForWorker?: any;
  workflowId?: string;
  taskData?: Record<string, any>;
  [key: string]: unknown;
}

export interface BackgroundJob {
  id: string;
  sessionId: string;
  taskType: TaskType;
  status: JobStatus;
  prompt: string;
  response?: string;
  errorMessage?: string;
  tokensSent?: number;
  tokensReceived?: number;
  modelUsed?: string;
  metadata?: JobMetadata | string | null;
  createdAt: number;
  updatedAt?: number;
  startTime?: number;
  endTime?: number;
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
  searchSelectedFilesOnly: boolean; // Whether to search only in selected files
  modelUsed?: string; // The model used for this session
};
