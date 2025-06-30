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

// File info type - compatible with new git-based file discovery
export type FileInfo = {
  path: string;        // Relative path from project root
  name: string;        // File name
  size?: number;
  modifiedAt?: number;
  isBinary: boolean;
  included: boolean;
  excluded: boolean;
};
