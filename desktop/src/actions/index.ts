/**
 * Action Layer
 *
 * This module exports all application actions.
 * All actions directly use Tauri commands to communicate with the Rust backend,
 * ensuring that all business logic is centralized in the Rust code.
 * The actions provide a thin abstraction over the Tauri commands with proper
 * error handling and type safety.
 */

// Export grouped actions by domain
export * from "./background-jobs";
export * from "./ai";
export * from "./file-system";
export * from "./path-finder";
export * from "./project-settings.actions";
export * from "./session";
export * from "./voice-transcription";
export * from "./project-directory";
