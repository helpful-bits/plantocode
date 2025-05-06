// Define the possible statuses for background jobs processing
export type JobStatus = 'idle' | 'preparing' | 'running' | 'completed' | 'failed' | 'canceled' | 'created' | 'queued';

// Constants for job status groups - use these instead of hardcoded arrays
export const JOB_STATUSES = {
  // Active job statuses (non-terminal)
  ACTIVE: ['idle', 'preparing', 'running', 'queued', 'created'] as JobStatus[],
  // Terminal job statuses
  TERMINAL: ['completed', 'failed', 'canceled'] as JobStatus[],
  // Specific status groups
  COMPLETED: ['completed'] as JobStatus[],
  FAILED: ['failed', 'canceled'] as JobStatus[],
  // All valid statuses
  ALL: ['idle', 'preparing', 'running', 'queued', 'created', 'completed', 'failed', 'canceled'] as JobStatus[]
};

// Type for API types
export type ApiType = 'gemini' | 'claude' | 'whisper' | 'groq';

// Type for task types
export type TaskType = 
  | 'pathfinder' 
  | 'transcription' 
  | 'regex_generation'
  | 'path_correction'
  | 'text_improvement'
  | 'voice_correction'
  | 'task_enhancement'
  | 'guidance_generation'
  | 'task_guidance'
  | 'implementation_plan'
  | 'unknown';

// Type for AI background job
export type BackgroundJob = {
    // Core identifying fields
    id: string;
    sessionId: string;
    apiType: ApiType;
    taskType: TaskType;
    status: JobStatus;
    
    // Timestamps
    createdAt: number;
    updatedAt?: number;
    startTime: number | null;
    endTime: number | null;
    lastUpdate: number | null;
    
    // Input and output content
    prompt: string;       // The user-provided input text
    
    /**
     * The primary field for storing the main textual output of a completed job.
     * This contains the primary result such as:
     * - Transcription text
     * - Corrected text
     * - Improved text
     * - Generated guidance
     * - Regex patterns
     * - Implementation plans
     * - Any other textual content that represents the job's completed output
     */
    response: string | null;
    
    // Project information
    projectDirectory?: string; // The project directory this job relates to
    
    // Token and performance tracking
    tokensSent: number;   // Token count for input
    tokensReceived: number; // Token count for output
    totalTokens: number;  // Total tokens (input + output)
    charsReceived: number; // Character count for response
    
    // Status and error information
    statusMessage: string | null;
    /**
     * Detailed error message for failed jobs.
     * This field should be populated with a human-readable description of what went wrong
     * when a job fails (status = 'failed').
     */
    errorMessage: string | null;
    
    // Model configuration
    modelUsed: string | null;
    maxOutputTokens: number | null;
    temperature?: number;
    includeSyntax?: boolean;
    
    // Output file paths
    outputFilePath: string | null;
    
    // Visibility/management flags
    cleared?: boolean;   // For history clearing functionality
    visible?: boolean;   // Whether the job should be shown in the UI
    
    /**
     * Structured supplementary data for the job, such as token counts, 
     * file paths, or other structured information.
     * 
     * This can include information like the target form field to update,
     * indicated by 'targetField' (e.g., 'taskDescription', 'pastedPaths').
     * 
     * NOTE: This field is for auxiliary structured data only.
     * The primary textual output should always be stored in the 'response' field.
     */
    metadata?: {
        targetField?: string; // Field in the form that should be updated with response
        [key: string]: any;
    } | null;
};

// Type for task-specific settings stored in the task_settings JSON column
export type TaskSettings = {
    [taskType in TaskType]: {
        model: string;
        maxTokens: number;
        temperature?: number;
    };
};

// Session structure including background jobs and task settings
export type Session = {
    id: string;
    name: string; // User-provided name for the session
    projectDirectory: string;
    projectHash?: string; // Hashed project directory for database lookups
    taskDescription: string;
    searchTerm: string;
    pastedPaths: string;
    titleRegex: string;
    contentRegex: string;
    negativeTitleRegex: string;
    negativeContentRegex: string;
    isRegexActive: boolean;
    diffTemperature?: number; // Temperature setting for diff generation
    updatedAt?: number; // Timestamp of last update (managed by repository)
    createdAt: number; // Timestamp when the session was created
    includedFiles: string[]; // Paths relative to projectDirectory
    forceExcludedFiles: string[]; // Paths forced excluded
    backgroundJobs?: BackgroundJob[];
    codebaseStructure?: string; // ASCII structure of codebase
    searchSelectedFilesOnly?: boolean; // Whether to search only in selected files
};