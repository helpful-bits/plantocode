import { FilesMap as ProjectFilesMap } from "../use-project-file-list";

// Workflow stages - enum-like object for type safety and runtime checks
export const FILE_FINDER_WORKFLOW_STAGES = {
  IDLE: 'IDLE',
  GENERATING_DIR_TREE: 'GENERATING_DIR_TREE',
  GENERATING_REGEX: 'GENERATING_REGEX',
  LOCAL_FILTERING: 'LOCAL_FILTERING',
  INITIAL_PATH_FINDER: 'INITIAL_PATH_FINDER',
  INITIAL_PATH_CORRECTION: 'INITIAL_PATH_CORRECTION',
  EXTENDED_PATH_FINDER: 'EXTENDED_PATH_FINDER',
  EXTENDED_PATH_CORRECTION: 'EXTENDED_PATH_CORRECTION',
  COMPLETED: 'COMPLETED',
  FAILED: 'FAILED'
} as const;

// Type derived from the stages object
export type FileFinderWorkflowStage = typeof FILE_FINDER_WORKFLOW_STAGES[keyof typeof FILE_FINDER_WORKFLOW_STAGES];

// Job types used in the workflow
export type FileFinderJobType = 
  | 'regexPatternGeneration'
  | 'initialPathFinder'
  | 'initialPathCorrection'
  | 'extendedPathFinder'
  | 'extendedPathCorrection'
  | null;

// Raw regex patterns interface
export interface RawRegexPatterns {
  titleRegex?: string;
  contentRegex?: string;
  negativeTitleRegex?: string;
  negativeContentRegex?: string;
}

// Intermediate data accumulated throughout the workflow
export interface FileFinderIntermediateData {
  directoryTreeContent: string | null;
  rawRegexPatterns: RawRegexPatterns | null;
  locallyFilteredFiles: string[];
  initialPathFinderResult: { verified: string[]; unverified: string[] };
  initialCorrectedPaths: string[];
  extendedPathFinderResult: { verified: string[]; unverified: string[] };
  extendedCorrectedPaths: string[];
}

// Props for the File Finder workflow
export interface FileFinderWorkflowProps {
  activeSessionId: string;
  projectDirectory: string;
  taskDescription: string;
  excludedPaths: string[];
  rawFilesMap: ProjectFilesMap;
  replaceSelection: (paths: string[]) => void;
  extendSelection: (paths: string[]) => void;
  timeout?: number;
}