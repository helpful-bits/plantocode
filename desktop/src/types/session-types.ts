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
  projectHash: string;
  taskType: TaskType;
  status: JobStatus;
  prompt: string;
  response?: string; // Responses are stored as strings, use response-utils for type-safe parsing
  errorMessage?: string;
  tokensSent?: number;
  tokensReceived?: number;
  modelUsed?: string;
  actualCost: number | null; // Server-authoritative cost - single source of truth for billing
  durationMs?: number; // Duration of LLM API call in milliseconds
  metadata?: JobMetadata | string | null;
  systemPromptTemplate?: string;
  createdAt: number;
  updatedAt?: number;
  startTime?: number;
  endTime?: number;
  cacheWriteTokens: number | null; // Cache tokens written during the request
  cacheReadTokens: number | null; // Cache tokens read from previous context
}

// Session structure - stores user context and preferences, NOT workflow artifacts
export type Session = {
  id: string;
  name: string; // User-provided name for the session
  projectDirectory: string;
  projectHash?: string; // Hashed project directory for database lookups
  taskDescription?: string; // Task description field
  searchTerm?: string; // Search filter for files
  updatedAt?: number; // Timestamp of last update (managed by repository)
  createdAt: number; // Timestamp when the session was created
  includedFiles: string[]; // Array of comparablePath strings (normalized, project-relative paths) that are selected
  forceExcludedFiles: string[]; // Array of comparablePath strings (normalized, project-relative paths) forced excluded even if they match inclusion criteria
  backgroundJobs?: BackgroundJob[]; // Associated background jobs
  searchSelectedFilesOnly: boolean; // Whether to search only in selected files
  modelUsed?: string; // The model used for this session
};
