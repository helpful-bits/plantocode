export * from "./action-types"; // Keep action-types export
export * from "./session-types";
export type FileInfo = { 
  path: string; 
  size?: number; 
  included: boolean; 
  forceExcluded: boolean;
  comparablePath?: string; // Added to match the project-file-list.ts definition
}; // Keep FileInfo type

