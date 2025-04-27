// Define the possible statuses for background jobs processing
export type JobStatus = 'idle' | 'preparing' | 'running' | 'completed' | 'failed' | 'canceled';

// Type for API types
export type ApiType = 'gemini' | 'claude' | 'whisper';

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
    charsReceived: number;
    lastUpdate: number | null;
    createdAt: number;
    cleared?: boolean; // For history clearing functionality
    apiType: ApiType;
    taskType: TaskType;
    modelUsed: string | null;
    maxOutputTokens: number | null;
};

// Type for task-specific settings stored in the task_settings JSON column
export type TaskSettings = {
    [taskType in TaskType]?: {
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
    taskDescription: string;
    searchTerm: string;
    pastedPaths: string;
    titleRegex: string;
    contentRegex: string;
    isRegexActive: boolean;
    diffTemperature?: number; // Temperature setting for diff generation
    updatedAt?: number; // Timestamp of last update (managed by repository)
    includedFiles: string[]; // Paths relative to projectDirectory
    forceExcludedFiles: string[]; // Paths forced excluded
    // taskSettings field removed - now stored globally per project
    backgroundJobs?: BackgroundJob[];
};

// Action state type for server action responses
export type ActionState<T> = {
    isSuccess: boolean;
    message: string;
    data?: T;
    error?: Error;
    metadata?: Record<string, any>; // Optional metadata for API responses
};