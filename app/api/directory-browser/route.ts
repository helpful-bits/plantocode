import { NextRequest, NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';
import { existsSync } from 'fs';
import { normalizePath } from '@/lib/path-utils'; // Keep normalizePath import

/**
 * API endpoint for directory browsing
 * This serves as a fallback for clients that don't support server actions directly
 */
export async function POST(request: NextRequest) {
  try {
    const { action, directoryPath } = await request.json();

    if (!action) {
      return NextResponse.json({ error: 'Action is required' }, { status: 400 });
    }

    // Get home directory
    if (action === 'getHomeDirectory') {
      try {
        const homeDir = normalizePath(os.homedir());
        return NextResponse.json({ 
          isSuccess: true, 
          message: "Home directory retrieved",
          data: homeDir
        });
      } catch (error) {
        console.error("Error getting home directory:", error);
        return NextResponse.json({ 
          isSuccess: false, 
          message: error instanceof Error ? error.message : "Failed to get home directory" 
        }, { status: 500 });
      }
    }

    // Select directory
    if (action === 'selectDirectory') {
      if (!directoryPath) {
        return NextResponse.json({ 
          isSuccess: false, 
          message: "Directory path is required"
        }, { status: 400 });
      }

      try {
        const resolvedPath = normalizePath(path.resolve(directoryPath)); // Normalize path

        // Check if path exists
        if (!existsSync(resolvedPath)) {
          return NextResponse.json({ 
            isSuccess: false, 
            message: "Directory does not exist"
          }, { status: 404 });
        }

        // Check if it's a directory
        const stats = await fs.stat(resolvedPath);
        if (!stats.isDirectory()) {
          return NextResponse.json({ 
            isSuccess: false, 
            message: "Path exists but is not a directory"
          }, { status: 400 });
        }

        // Check read access
        try {
          await fs.access(resolvedPath, fs.constants.R_OK);
        } catch (error) {
          return NextResponse.json({ 
            isSuccess: false, 
            message: "Directory exists but cannot be read. Please check permissions."
          }, { status: 403 });
        }

        return NextResponse.json({
          isSuccess: true,
          message: "Directory selected successfully",
          data: resolvedPath
        });
      } catch (error) {
        console.error(`Error selecting directory ${directoryPath}:`, error);
        return NextResponse.json({ 
          isSuccess: false, 
          message: error instanceof Error ? error.message : "Failed to select directory"
        }, { status: 500 });
      }
    }

    // List directories
    if (action === 'listDirectories') {
      if (!directoryPath) {
        return NextResponse.json({ 
          isSuccess: false, 
          message: "Directory path is required",
          data: { currentPath: "", parentPath: null, directories: [] }
        }, { status: 400 });
      }

      try {
        const resolvedPath = normalizePath(path.resolve(directoryPath)); // Normalize path

        // Check if path exists
        if (!existsSync(resolvedPath)) {
          return NextResponse.json({ 
            isSuccess: false, 
            message: "Directory does not exist",
            data: { currentPath: resolvedPath, parentPath: null, directories: [] }
          }, { status: 404 });
        }

        // Check if it's a directory
        const stats = await fs.stat(resolvedPath);
        if (!stats.isDirectory()) {
          return NextResponse.json({ 
            isSuccess: false, 
            message: "Path exists but is not a directory",
            data: { currentPath: resolvedPath, parentPath: null, directories: [] }
          }, { status: 400 });
        }

        // Get parent directory
        const parentPath = path.dirname(resolvedPath) !== resolvedPath
          ? normalizePath(path.dirname(resolvedPath))
          : null;

        // Read directory contents
        let files: string[];
        try {
          files = await fs.readdir(resolvedPath);
        } catch (error) {
          return NextResponse.json({ 
            isSuccess: false, 
            message: "Directory exists but cannot be read. Please check permissions.",
            data: { currentPath: resolvedPath, parentPath, directories: [] }
          }, { status: 403 });
        }

        // Filter for directories and add metadata
        const directories: { name: string; path: string; isAccessible: boolean }[] = [];
        
        for (const file of files) {
          const fullPath = normalizePath(path.join(resolvedPath, file)); // Normalize full path
          
          try {
            const fileStats = await fs.stat(fullPath);
            if (fileStats.isDirectory()) {
              directories.push({
                name: file,
                path: fullPath,
                isAccessible: true
              });
            }
          } catch (error) {
            // Handle permission issues for individual directories
            if (error instanceof Error && error.message.includes('permission denied')) {
              directories.push({
                name: file,
                path: fullPath,
                isAccessible: false
              });
            }
            // Skip other errors (might be symlinks, etc.)
          }
        }

        // Sort directories alphabetically
        directories.sort((a, b) => a.name.localeCompare(b.name));

        return NextResponse.json({
          isSuccess: true,
          message: `Found ${directories.length} directories`,
          data: {
            currentPath: resolvedPath,
            parentPath,
            directories
          }
        });
      } catch (error) {
        console.error(`Error listing directories in ${directoryPath}:`, error);
        return NextResponse.json({ 
          isSuccess: false, 
          message: error instanceof Error ? error.message : "Failed to list directories",
          data: { currentPath: directoryPath, parentPath: null, directories: [] }
        }, { status: 500 });
      }
    }

    // Unsupported action
    return NextResponse.json({ error: 'Unsupported action' }, { status: 400 });
  } catch (error) {
    console.error('Error in directory-browser API route:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
} 