"use client";

import { normalizePath } from "@/lib/path-utils";
import path from "path";

/**
 * Determines if a file should be included by default in the prompt generation
 * based on file path characteristics. Used for initial file selection.
 */
export const shouldIncludeByDefault = (filePath: string): boolean => {
  // Since we're using git and respecting .gitignore, we only need to exclude
  // a few specific patterns for files that might be in the repo but usually shouldn't be included
  const lowercasePath = filePath.toLowerCase();
  
  // Skip log files, lock files, and large generated files
  if (
    lowercasePath.endsWith('.log') ||
    lowercasePath.endsWith('.lock') ||
    lowercasePath.endsWith('.min.js') ||
    lowercasePath.endsWith('.min.css') ||
    lowercasePath.endsWith('.map') ||
    lowercasePath.includes('dist/') || 
    lowercasePath.includes('build/') ||
    lowercasePath.includes('/vendor/') ||
    lowercasePath.includes('package-lock.json') ||
    lowercasePath.includes('yarn.lock') ||
    lowercasePath.includes('pnpm-lock.yaml')
  ) {
    return false;
  }
  
  // Include almost everything else
  return true;
};

/**
 * Normalizes a file path based on the project directory.
 * Handles both absolute and relative paths, ensuring consistent path format.
 */
export const normalizeFilePath = (filePath: string, projectDirectory?: string): string => {
  // Handle empty path case
  if (!filePath) return '';
  
  // First normalize the path to handle any platform specific separators
  const normalizedPath = normalizePath(filePath);
  
  // If no project directory, just return normalized path
  if (!projectDirectory) return normalizedPath;
  
  // First handle absolute path case
  if (path.isAbsolute(normalizedPath)) {
    // Check if the absolute path is within the project directory
    const normalizedProjectDir = normalizePath(projectDirectory);
    if (normalizedPath.startsWith(normalizedProjectDir)) {
      // Convert to relative path within the project
      return normalizedPath.slice(normalizedProjectDir.length + 1);
    }
    return normalizedPath; // Return absolute path as-is
  }
  
  // For relative paths, clean up any ../ and ./ prefixes for consistency
  return normalizePath(filePath);
}; 