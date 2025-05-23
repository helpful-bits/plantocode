/**
 * Utilities Index
 *
 * This file provides a central export point for all utility functions
 * used throughout the application. Instead of importing individual utilities
 * directly, modules should import them from this index file.
 *
 * This approach has several advantages:
 * - Provides a single point of entry for all utilities
 * - Makes it easier to refactor utility functions without breaking imports
 * - Prevents circular dependencies
 * - Improves code organization
 *
 * Utils are organized into logical categories for better discoverability.
 */

// API and Network utilities
// export * from './api-helpers'; // Module not found
export * from "./api-call-tracker";
export * from "./rate-limit";
export * from "./tracked-fetch";

// Data manipulation utilities
export * from "./string-utils";
export * from "./object-utils";
export * from "./array-utils";
export * from "./date-utils";
export * from "./hash";
// token-estimator.ts has been removed, now implemented directly where needed
export * from "./validation-utils";

// Async and functional utilities
export * from "./async-utils";
export * from "./function-utils";

// File system utilities
export * from "./file-access-utils";
export * from "./file-size";
export * from "./directory-tree";
export * from "./file-utils"; // Re-exports from specialized file utility modules
// Remove duplicate exports that are already exported in file-utils
// export * from "./file-binary-utils"; 
// export * from "./file-content-loader";
// export * from "./file-path-validator";
export * from "./git-utils";

// UI utilities
export * from "./ui-utils";
export * from "./dialog-utils";

// Application utilities
export * from "./constants";
export * from "./platform";
export * from "./error-handling";
export * from "./action-utils";
export * from "./job-comparison-utils";
// Export specific functions from job-status-utils to avoid conflict with date-utils exports
export {
  isJobTerminated,
  calculateJobDuration,
  formatJobDuration as formatJobStatusDuration,
  formatTimestamp as formatJobStatusTimestamp,
} from "./job-status-utils";
export * from "./migration-utils";
export * from "./common-utils";
export * from "./utils";
