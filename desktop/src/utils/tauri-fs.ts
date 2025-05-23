/**
 * File System Utilities for Tauri
 *
 * Direct wrapper for Tauri filesystem commands.
 * Provides unified access to Tauri's filesystem API throughout the application.
 */

import { invoke as tauriInvoke, type InvokeArgs } from "@tauri-apps/api/core";

/**
 * Generic invoke wrapper for Tauri commands
 * This can be used for any Tauri command call
 */
export async function invoke<T>(command: string, args?: InvokeArgs): Promise<T> {
  return tauriInvoke<T>(command, args as InvokeArgs);
}

// Types based on file_system_commands.rs and existing usage
export interface NativeFileInfo {
  name: string;
  path: string;
  is_dir: boolean; // Corresponds to isDir in some TS code, Rust uses is_dir
  is_file: boolean; // Corresponds to isFile, Rust uses is_file
  is_symlink: boolean; // Rust uses is_symlink
  size?: number; // u64 in Rust
  created_at?: number; // u64 in Rust (timestamp)
  modified_at?: number; // u64 in Rust (timestamp)
  accessed_at?: number; // u64 in Rust (timestamp)
  is_hidden?: boolean;
  is_readable?: boolean;
  is_writable?: boolean;
}

export interface ListFilesResponse {
  path: string;
  files: NativeFileInfo[];
  count: number;
}


export async function getHomeDirectory(): Promise<string> {
  return tauriInvoke("get_home_directory_command");
}


export async function listFiles(
  directory: string,
  pattern?: string,
  includeStats?: boolean,
  exclude?: string[]
): Promise<NativeFileInfo[]> {
  const response = await tauriInvoke<ListFilesResponse>("list_files_command", {
    directory,
    pattern,
    includeStats,
    exclude,
  });
  return response.files;
}

export async function createDirectory(
  path: string,
  projectDirectory?: string
): Promise<void> {
  return tauriInvoke("create_directory_command", {
    path,
    projectDirectory,
  });
}

export async function readFileContent(
  path: string,
  projectDirectory?: string,
  encoding?: string
): Promise<string> {
  // encoding param is noted, Rust side read_file_to_string implies UTF-8
  const response = await tauriInvoke<{ content: string }>(
    "read_file_content_command",
    {
      path,
      projectDirectory,
      encoding,
    }
  );
  return response.content;
}

export async function writeFileContent(
  path: string,
  content: string,
  projectDirectory?: string
): Promise<void> {
  return tauriInvoke("write_file_content_command", {
    path,
    content,
    projectDirectory,
  });
}

export async function createUniqueFilepath(args: {
  requestId: string;
  sessionName: string;
  extension: string;
  projectDirectory?: string;
  targetDirName?: string;
}): Promise<string> {
  return tauriInvoke("create_unique_filepath_command", {
    requestId: args.requestId,
    sessionName: args.sessionName,
    extension: args.extension,
    projectDirectory: args.projectDirectory,
    targetDirName: args.targetDirName,
  });
}

export async function deleteFile(
  path: string,
  projectDirectory?: string
): Promise<void> {
  return tauriInvoke("delete_file_command", {
    path,
    projectDirectory,
  });
}

export async function moveFile(
  sourcePath: string,
  destinationPath: string,
  projectDirectory?: string,
  overwrite?: boolean
): Promise<void> {
  return tauriInvoke("move_file_command", {
    sourcePath,
    destinationPath,
    projectDirectory,
    overwrite,
  });
}

export async function pathJoin(...paths: string[]): Promise<string> {
  return tauriInvoke("path_join_command", { paths });
}

export async function pathDirname(path: string): Promise<string> {
  return tauriInvoke("path_dirname_command", { path });
}

export async function pathBasename(path: string): Promise<string> {
  return tauriInvoke("path_basename_command", { path });
}

export async function pathExtname(path: string): Promise<string> {
  return tauriInvoke("path_extname_command", { path });
}

export async function getAppDataDirectory(): Promise<string> {
  return tauriInvoke("get_app_data_directory_command");
}

export async function sanitizeFilename(name: string): Promise<string> {
  return tauriInvoke("sanitize_filename_command", { name });
}

export async function normalizePath(
  path: string,
  addTrailingSlash?: boolean
): Promise<string> {
  return tauriInvoke("normalize_path_command", { path, addTrailingSlash });
}

export async function getTempDir(): Promise<string> {
  return tauriInvoke("get_temp_dir_command");
}

