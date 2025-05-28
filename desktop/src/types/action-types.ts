/**
 * Action related types
 * These types represent the structures used for actions and task types
 */

// Action state structure for all server actions
export type ActionState<TData = unknown> = {
  isSuccess: boolean;
  message?: string; // Keep message optional
  data?: TData;
  error?: Error;
  metadata?: Record<string, unknown>;
  clipboardFeedback?: boolean; // Indicates that clipboard feedback should be shown in the UI
};

// File info type
export type FileInfo = {
  path: string;
  size?: number;
  included: boolean;
  forceExcluded: boolean;
  comparablePath: string; // Required to match the project-file-list.ts definition
  isDir?: boolean; // Whether this is a directory
};
