export * from "./action-types"; // Keep action-types export
export * from "./session-types"; // Keep session-types export
export type OutputFormat = "diff" | "refactoring" | "path-finder" | "custom"; // Keep OutputFormat type
export type FileInfo = { path: string; size: number; included: boolean; forceExcluded: boolean }; // Keep FileInfo type
