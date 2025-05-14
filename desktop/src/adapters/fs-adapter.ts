/**
 * File System Adapter for Desktop
 * 
 * This adapter connects the core application's file system operations
 * to our Tauri-compatible implementations. It acts as a bridge between
 * the core application and the desktop-specific file system utilities.
 */

import fsManager from '../utils/fs-manager';
import * as pathUtils from '../utils/path-utils';

/**
 * Provides the desktop-compatible file system manager
 */
export const getFsManager = () => {
  return fsManager;
};

/**
 * Adapter function for path.join operations
 */
export const joinPaths = (...paths: string[]): string => {
  return pathUtils.join(...paths);
};

/**
 * Adapter function for path.dirname operations
 */
export const getDirname = (path: string): string => {
  return pathUtils.dirname(path);
};

/**
 * Adapter function for path.basename operations
 */
export const getBasename = (path: string): string => {
  return pathUtils.basename(path);
};

/**
 * Adapter function for path.extname operations
 */
export const getExtname = (path: string): string => {
  return pathUtils.extname(path);
};

/**
 * Adapter function for process.cwd() replacement
 */
export const getAppDirectory = (): string => {
  return pathUtils.getAppDirectory();
};

/**
 * Normalize a file path
 */
export const normalizePath = (path: string, addTrailingSlash = false): string => {
  return pathUtils.normalizePath(path, addTrailingSlash);
};

/**
 * Read file content
 */
export const readFile = async (
  path: string, 
  encoding: 'utf8' | 'utf-8' | 'ascii' | 'base64' = 'utf8'
): Promise<string> => {
  return fsManager.readFile(path, encoding);
};

/**
 * Write content to a file
 */
export const writeFile = async (
  path: string, 
  data: string | Uint8Array
): Promise<void> => {
  return fsManager.writeFile(path, data);
};

/**
 * Create a unique file path for output files
 */
export const createUniqueFilePath = async (
  requestId: string,
  sessionName: string,
  projectDir?: string,
  extension: string = 'xml',
  targetDirName?: string
): Promise<string> => {
  return fsManager.createUniqueFilePath(
    requestId,
    sessionName,
    projectDir,
    extension,
    targetDirName
  );
};

/**
 * Get the temporary directory
 */
export const getTempDir = async (): Promise<string> => {
  return fsManager.getTempDir();
};