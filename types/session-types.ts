import { OutputFormat } from ".";

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
    customFormat: string; // Custom format instructions if outputFormat is 'custom'
    geminiStatus: GeminiStatus; // Status of Gemini processing (non-optional)
    geminiStartTime?: number | null;
    geminiEndTime?: number | null;
    geminiPatchPath?: string | null; // Path to the saved patch file
    geminiStatusMessage?: string | null;
    updatedAt?: number; // Timestamp of last update (managed by repository)
};