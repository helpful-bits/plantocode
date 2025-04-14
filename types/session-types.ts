import { OutputFormat } from ".";

export type Session = {
    id: string;
    name: string; // User-provided name
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
    forceExcludedFiles: string[]; // Paths relative to projectDirectory, forced exclusion
    outputFormat: OutputFormat;
    updatedAt?: number; // Timestamp of last update (optional)
};
