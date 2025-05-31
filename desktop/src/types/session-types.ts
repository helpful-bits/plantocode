/**
 * Session and background jobs related types
 * These types represent the structures used for sessions and background jobs
 */

// Define the possible statuses for background jobs processing
export type JobStatus =
  | "idle"
  | "preparing"
  | "running"
  | "completed"
  | "failed"
  | "canceled"
  | "created"
  | "queued"
  | "acknowledged_by_worker"
  // New granular statuses for implementation plans and streaming jobs
  | "preparing_input" // Preparing input for LLM, e.g., loading files
  | "generating_stream" // Sending request to LLM and starting stream
  | "processing_stream" // Processing the incoming stream
  | "completed_by_tag"; // Stream completed early due to tag detection

// Constants for job status groups - use these instead of hardcoded arrays
export const JOB_STATUSES = {
  // Active job statuses (non-terminal)
  ACTIVE: [
    "idle",
    "preparing",
    "running",
    "queued",
    "created",
    "acknowledged_by_worker",
    "preparing_input",
    "generating_stream",
    "processing_stream",
  ] as JobStatus[],

  // Terminal job statuses
  TERMINAL: [
    "completed",
    "failed",
    "canceled",
    "completed_by_tag",
  ] as JobStatus[],

  // Specific status groups
  COMPLETED: ["completed", "completed_by_tag"] as JobStatus[],

  FAILED: ["failed", "canceled"] as JobStatus[],

  // All valid statuses
  ALL: [
    "idle",
    "preparing",
    "running",
    "queued",
    "created",
    "completed",
    "failed",
    "canceled",
    "acknowledged_by_worker",
    "preparing_input",
    "generating_stream",
    "processing_stream",
    "completed_by_tag",
  ] as JobStatus[],
};

// Type for API types
export type ApiType = "openrouter" | "filesystem";

/**
 * Task types supported by the application
 * Updated to include orchestrated workflow stage types
 */
export type TaskType =
  | "implementation_plan"
  | "path_finder"
  | "text_improvement"
  | "voice_transcription"
  | "text_correction"
  | "path_correction"
  | "guidance_generation"
  | "task_enhancement"
  | "generic_llm_stream"
  | "regex_summary_generation"
  | "regex_pattern_generation"
  | "file_finder_workflow"
  | "server_proxy_transcription"
  | "streaming"
  
  // New orchestrated workflow stage types
  | "directory_tree_generation"
  | "local_file_filtering"
  | "extended_path_finder"
  | "extended_path_correction"
  | "initial_path_finding"
  | "extended_path_finding"
  | "initial_path_correction"
  | "regex_generation"
  
  | "unknown";

/**
 * Interface defining structured job metadata
 * Standardizes the structure of BackgroundJob.metadata across frontend and backend
 */
export interface JobMetadata {
  // Common workflow fields
  workflowId?: string;
  workflowStage?: string; // e.g., "DirectoryTreeGeneration", "PathFinding", "ResultProcessing"
  jobTypeForWorker?: string; // e.g., "PATH_FINDER", "TEXT_IMPROVEMENT"
  jobPriorityForWorker?: number;

  // Streaming fields
  isStreaming?: boolean;
  streamProgress?: number; // Percentage 0-100
  responseLength?: number; // Characters received so far
  estimatedTotalLength?: number; // Estimated total characters for progress calculation
  lastStreamUpdateTime?: number; // Timestamp of last stream update
  streamStartTime?: number; // Timestamp when streaming started

  // Task-specific output fields
  outputPath?: string; // For implementation plans, file outputs, etc.
  targetField?: string; // For text improvement (e.g., "taskDescription", "titleRegex")
  sessionName?: string; // For implementation plans and session-related tasks

  // Path finder specific data
  pathFinderData?: {
    paths?: string[];
    count?: number;
    unverifiedPaths?: string[];
    searchTerm?: string;
    totalFound?: number;
  };

  // Regex generation specific data
  regexData?: {
    titleRegex?: string;
    contentRegex?: string;
    negativeTitleRegex?: string;
    negativeContentRegex?: string;
    titleRegexDescription?: string;
    contentRegexDescription?: string;
    negativeTitleRegexDescription?: string;
    negativeContentRegexDescription?: string;
    regexSummaryExplanation?: string;
  } | Record<string, any> | string; // Legacy support for string format

  // File finder workflow data
  fileFinderWorkflowData?: {
    stage?: string; // e.g., "tree_generation", "path_finding", "validation"
    treeGenerated?: boolean;
    pathsFound?: number;
    validatedPaths?: number;
  };

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

  // Legacy fields (for backward compatibility)
  pathCount?: number;
  pathData?: string;
  showPureContent?: boolean;

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
