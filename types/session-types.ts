import { OutputFormat } from "."; // Keep OutputFormat import

// Define the possible statuses for Gemini processing
export type GeminiStatus = 'idle' | 'running' | 'completed' | 'failed' | 'canceled'; // Keep GeminiStatus type

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
    codebaseStructure: string;
    includedFiles: string[]; // Paths relative to projectDirectory
    forceExcludedFiles: string[]; // Paths forced excluded
    outputFormat: OutputFormat;
    customFormat: string;
    geminiStatus: GeminiStatus; // Status of Gemini processing (non-optional)
    geminiStartTime?: number | null; // Unix timestamp (ms) when processing started
    geminiEndTime?: number | null;
    geminiPatchPath?: string | null; // Path to the saved patch file
    geminiStatusMessage?: string | null;
    geminiTokensReceived?: number; // Number of tokens received during streaming (optional)
    geminiCharsReceived?: number; // Number of characters received during streaming
    geminiLastUpdate?: number; // Timestamp of the last chunk update
    updatedAt?: number; // Timestamp of last update (managed by repository)
};