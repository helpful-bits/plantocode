// Define the possible statuses for Gemini processing
export type GeminiStatus = 'idle' | 'running' | 'completed' | 'failed' | 'canceled'; // Keep GeminiStatus type

// Type for individual Gemini request
export type GeminiRequest = {
    id: string;
    sessionId: string;
    prompt: string;
    status: GeminiStatus;
    startTime: number | null;
    endTime: number | null;
    patchPath: string | null;
    statusMessage: string | null;
    tokensReceived: number;
    charsReceived: number;
    lastUpdate: number | null;
    createdAt: number;
};

// Session structure including Gemini processing state and file selections
export type Session = {
    id: string;
    name: string; // User-provided name for the session
    projectDirectory: string;
    taskDescription: string;
    searchTerm: string;
    pastedPaths: string;
    patternDescription: string;
    titleRegex: string;
    contentRegex: string;
    isRegexActive: boolean;
    geminiStatus: GeminiStatus; // Status of Gemini processing (non-optional)
    geminiStartTime?: number | null; // Unix timestamp (ms) when processing started
    geminiEndTime?: number | null;
    geminiPatchPath?: string | null; // Path to the saved patch file
    geminiStatusMessage?: string | null; // Error or success message from Gemini process
    geminiTokensReceived?: number; // Number of tokens received during streaming (optional)
    geminiCharsReceived?: number; // Number of characters received during streaming (optional)
    geminiLastUpdate?: number; // Timestamp of the last chunk update
    updatedAt?: number; // Timestamp of last update (managed by repository)
    includedFiles: string[]; // Paths relative to projectDirectory
    forceExcludedFiles: string[]; // Paths forced excluded
    geminiRequests?: GeminiRequest[]; // Optional array of Gemini requests
};