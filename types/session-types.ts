// Define the possible statuses for background jobs processing
export type JobStatus = 'idle' | 'preparing' | 'running' | 'completed' | 'failed' | 'canceled' | 'created' | 'queued';

// Type for API types
export type ApiType = 'gemini' | 'claude' | 'whisper' | 'groq';

// Type for task types
export type TaskType = 
  | 'xml_generation' 
  | 'pathfinder' 
  | 'transcription' 
  | 'regex_generation'
  | 'path_correction'
  | 'text_improvement'
  | 'voice_correction'
  | 'task_enhancement'
  | 'guidance_generation'
  | 'task_guidance'
  | 'unknown';

// Type for individual background job (formerly GeminiRequest)
export type BackgroundJob = {
    id: string;
    sessionId: string;
    prompt: string;
    status: JobStatus;
    startTime: number | null;
    endTime: number | null;
    xmlPath: string | null;
    statusMessage: string | null;
    tokensReceived: number;
    tokensSent?: number; // Add token estimation for prompt
    charsReceived: number;
    lastUpdate: number | null;
    createdAt: number;
    updatedAt?: number;
    cleared?: boolean; // For history clearing functionality
    apiType: ApiType;
    taskType: TaskType;
    modelUsed: string | null;
    maxOutputTokens: number | null;
    // Additional properties used in the DB layer
    rawInput?: string;
    modelOutput?: string;
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
    includeSyntax?: boolean;
    temperature?: number;
    visible?: boolean;
    /**
     * Structured supplementary data for the job, such as token counts, 
     * file paths, or other structured information.
     * 
     * NOTE: This field is for auxiliary structured data only.
     * The primary textual output should always be stored in the 'response' field.
     */
    metadata?: {
        tokensReceived?: number;
        charsReceived?: number;
        [key: string]: any;
    } | null;
    /**
     * The primary field for storing the main textual output of a completed job.
     * This should contain the primary result such as:
     * - Transcription text
     * - Corrected text
     * - Improved text
     * - Generated guidance
     * - Regex patterns
     * - Any other textual content that represents the job's completed output
     */
    response?: string | null;
    /**
     * Detailed error message for failed jobs.
     * This field should be populated with a human-readable description of what went wrong
     * when a job fails (status = 'failed').
     */
    errorMessage?: string | null;
    // Removing redundant message field as statusMessage and errorMessage cover its use cases
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
    negativeTitleRegex?: string;
    negativeContentRegex?: string;
    isRegexActive: boolean;
    diffTemperature?: number; // Temperature setting for diff generation
    updatedAt?: number; // Timestamp of last update (managed by repository)
    createdAt: number; // Timestamp when the session was created
    includedFiles: string[]; // Paths relative to projectDirectory
    forceExcludedFiles: string[]; // Paths forced excluded
    // outputFormat is now handled via local storage
    // taskSettings field removed - now stored globally per project
    backgroundJobs?: BackgroundJob[];
    codebaseStructure?: string; // ASCII structure of codebase
};