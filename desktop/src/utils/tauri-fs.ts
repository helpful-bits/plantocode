/**
 * File System Utilities for Tauri
 *
 * Direct wrapper for Tauri filesystem commands.
 * Provides unified access to Tauri's filesystem API throughout the application.
 */

import { invoke as tauriInvoke, type InvokeArgs } from "@tauri-apps/api/core";
import { type DirectoryTreeOptions } from "@/types/tauri-commands";

/**
 * Generic invoke wrapper for Tauri commands
 * This can be used for any Tauri command call
 */
export async function invoke<T>(command: string, args?: InvokeArgs): Promise<T> {
  return tauriInvoke<T>(command, args as InvokeArgs);
}

// Types based on NativeFileInfoRs in models.rs
export interface NativeFileInfo {
  path: string;        // Relative path to the queried directory
  name: string;        // Base name of the file/directory
  isDir: boolean;      // Whether this is a directory
  isFile: boolean;     // Whether this is a regular file
  isSymlink: boolean;  // Whether this is a symbolic link
  size?: number;       // File size in bytes (None for directories)
  createdAt?: number;  // Creation timestamp in milliseconds
  modifiedAt?: number; // Modification timestamp in milliseconds
  accessedAt?: number; // Access timestamp in milliseconds
  isHidden?: boolean;  // Whether the file is hidden
  isReadable?: boolean; // Whether the file is readable
  isWritable?: boolean; // Whether the file is writable
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
  const response = await tauriInvoke<NativeFileInfo[]>("list_files_command", {
    directory,
    pattern: pattern ?? null,
    include_stats: includeStats ?? null,
    exclude: exclude ?? null,
  });
  return response;
}


export async function createDirectory(
  path: string,
  projectDirectory?: string
): Promise<void> {
  return tauriInvoke("create_directory_command", {
    path,
    projectDirectory: projectDirectory ?? null,
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
      projectDirectory: projectDirectory ?? null,
      encoding: encoding ?? null,
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
    projectDirectory: projectDirectory ?? null,
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
    projectDirectory: args.projectDirectory ?? null,
    targetDirName: args.targetDirName ?? null,
  });
}

export async function deleteFile(
  path: string,
  projectDirectory?: string
): Promise<void> {
  return tauriInvoke("delete_file_command", {
    path,
    projectDirectory: projectDirectory ?? null,
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
    projectDirectory: projectDirectory ?? null,
    overwrite: overwrite ?? null,
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
  return tauriInvoke("normalize_path_command", { 
    path, 
    addTrailingSlash: addTrailingSlash ?? null 
  });
}

export async function getTempDir(): Promise<string> {
  return tauriInvoke("get_temp_dir_command");
}

export async function isAbsolute(path: string): Promise<boolean> {
  return tauriInvoke("path_is_absolute_command", { path });
}

export async function generateDirectoryTree(
  projectDirectory: string,
  options?: DirectoryTreeOptions
): Promise<string> {
  return tauriInvoke("generate_directory_tree_command", {
    projectDirectory,
    options: options ?? null,
  });
}