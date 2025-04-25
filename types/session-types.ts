// Define the possible statuses for Gemini processing
export type GeminiStatus = 'idle' | 'preparing' | 'running' | 'completed' | 'failed' | 'canceled'; // Added 'preparing' state

// Type for individual Gemini request
export type GeminiRequest = {
    id: string;
    sessionId: string;
    prompt: string;
    status: GeminiStatus;
    startTime: number | null;
    endTime: number | null;
    xmlPath: string | null;
    patchPath?: string | null; // Kept for backwards compatibility
    statusMessage: string | null;
    tokensReceived: number;
    charsReceived: number;
    lastUpdate: number | null;
    createdAt: number;
    cleared?: boolean; // Added for history clearing functionality
};

// Session structure including Gemini processing state and file selections
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
    modelUsed?: string; // Added for model selection
    updatedAt?: number; // Timestamp of last update (managed by repository)
    includedFiles: string[]; // Paths relative to projectDirectory
    forceExcludedFiles: string[]; // Paths forced excluded
    geminiRequests?: GeminiRequest[]; // Optional array of Gemini requests
};