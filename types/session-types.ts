import { OutputFormat } from ".";

export interface Session {
  id: string; // Unique identifier (e.g., timestamp)
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
  forceExcludedFiles: string[]; // Paths relative to projectDirectory
  outputFormat: OutputFormat; // Format this session was saved under
