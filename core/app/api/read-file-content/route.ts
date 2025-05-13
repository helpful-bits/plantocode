import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';
import { getProjectImplementationPlansDirectory } from '@/lib/path-utils';

/**
 * API Route to read file content from a specific path
 * This is used primarily for reading large implementation plans that are stored on disk
 * rather than in the database response field
 */
export async function GET(request: NextRequest) {
  try {
    // Get parameters from the query
    const searchParams = request.nextUrl.searchParams;
    const filePath = searchParams.get('path') || searchParams.get('filePath');
    const projectDirectory = searchParams.get('projectDirectory');
    const forcedFormat = searchParams.get('format'); // Optional format parameter (e.g., 'text', 'json')

    // Return 400 if no path parameter
    if (!filePath) {
      return NextResponse.json(
        { error: 'Missing path or filePath parameter' },
        { status: 400 }
      );
    }

    // Determine the base directory for validation
    let baseDir: string;

    // If projectDirectory is provided, use it as the base
    if (projectDirectory) {
      baseDir = projectDirectory;
    } else {
      // Fall back to PROJECT_DIR environment variable
      const envProjectDir = process.env.PROJECT_DIR || '';
      if (!envProjectDir) {
        return NextResponse.json(
          { error: 'Project directory not configured and not provided in request' },
          { status: 400 }
        );
      }
      baseDir = envProjectDir;
    }

    // Normalize paths for security
    const normalizedBaseDir = path.normalize(baseDir);

    // Calculate allowable directories where files can be read from
    const plansDir = getProjectImplementationPlansDirectory(normalizedBaseDir);
    const outputDir = process.env.OUTPUT_DIR ? path.normalize(process.env.OUTPUT_DIR) : null;

    // Allowable directories: project dir, plans dir, and optional output dir
    const allowableDirs = [normalizedBaseDir, plansDir];
    if (outputDir) allowableDirs.push(outputDir);

    // Handle absolute and relative paths
    let absoluteFilePath: string;
    if (path.isAbsolute(filePath)) {
      // If path is absolute, normalize it for security
      absoluteFilePath = path.normalize(filePath);
    } else {
      // If path is relative, resolve it against the base directory
      absoluteFilePath = path.join(normalizedBaseDir, filePath);
    }

    // Check if file path is within any allowable directory
    // This mitigates path traversal attacks via proper path normalization and checking
    const isInAllowableDir = allowableDirs.some(dir =>
      absoluteFilePath.startsWith(dir) &&
      // Extra check to prevent partial prefix matches
      (absoluteFilePath === dir || absoluteFilePath.substring(dir.length).startsWith('/'))
    );

    // For security, only allow reading files in allowable directories
    if (!isInAllowableDir) {
      console.warn(`[API] Access denied for path: ${absoluteFilePath} (not in allowable directories)`);
      return NextResponse.json(
        { error: 'Security restriction: Access denied. Files must be within allowed project directories.' },
        { status: 403 }
      );
    }

    // Verify the file exists
    try {
      const fileStats = await fs.stat(absoluteFilePath);

      // Basic protection against huge files that might crash the server
      if (fileStats.size > 10 * 1024 * 1024) { // 10MB limit
        return NextResponse.json(
          { error: `File too large (${(fileStats.size/1024/1024).toFixed(1)}MB). Maximum allowed size is 10MB.` },
          { status: 413 }
        );
      }

      // Only allow reading regular files, not directories, symlinks, etc.
      if (!fileStats.isFile()) {
        return NextResponse.json(
          { error: 'The specified path is not a regular file' },
          { status: 400 }
        );
      }
    } catch (error) {
      // Determine if it's a not found error or something else
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return NextResponse.json(
          { error: `File not found: ${path.basename(absoluteFilePath)}` },
          { status: 404 }
        );
      } else if ((error as NodeJS.ErrnoException).code === 'EACCES') {
        return NextResponse.json(
          { error: `Permission denied: cannot access ${path.basename(absoluteFilePath)}` },
          { status: 403 }
        );
      } else {
        throw error; // Let the catch block handle other errors
      }
    }

    // Read the file content with proper error handling for large files
    try {
      const content = await fs.readFile(absoluteFilePath, 'utf8');

      // Determine content type based on optional format parameter or file extension
      const fileExtension = path.extname(absoluteFilePath).toLowerCase();

      // Return content based on format or extension
      if (forcedFormat === 'json' || (!forcedFormat && fileExtension === '.json')) {
        try {
          // Parse content as JSON for better viewing in UI
          const jsonContent = JSON.parse(content);

          return NextResponse.json({
            content,
            parsedContent: jsonContent,
            filePath: absoluteFilePath,
            fileSize: content.length,
            format: 'json'
          });
        } catch (jsonError) {
          // If parsing fails, return as text with a warning
          return NextResponse.json({
            content,
            filePath: absoluteFilePath,
            fileSize: content.length,
            format: 'text',
            warning: 'File has .json extension but could not be parsed as valid JSON'
          });
        }
      } else {
        // Return as plain text with file metadata
        return NextResponse.json({
          content,
          filePath: absoluteFilePath,
          fileSize: content.length,
          format: 'text'
        });
      }
    } catch (readError) {
      if ((readError as NodeJS.ErrnoException).code === 'ENOENT') {
        return NextResponse.json(
          { error: `File not found or was deleted: ${path.basename(absoluteFilePath)}` },
          { status: 404 }
        );
      } else if ((readError as NodeJS.ErrnoException).code === 'EISDIR') {
        return NextResponse.json(
          { error: `Cannot read a directory as a file: ${path.basename(absoluteFilePath)}` },
          { status: 400 }
        );
      } else {
        throw readError; // Let the catch block handle other errors
      }
    }
  } catch (error) {
    console.error('[API] Error reading file content:', error);

    // Provide more specific error messages for common errors
    if (error instanceof Error) {
      if (error.message.includes('EACCES')) {
        return NextResponse.json(
          { error: 'Permission denied: cannot access the requested file' },
          { status: 403 }
        );
      } else if (error.message.includes('ENOENT')) {
        return NextResponse.json(
          { error: 'File not found or has been deleted' },
          { status: 404 }
        );
      } else if (error.message.includes('EISDIR')) {
        return NextResponse.json(
          { error: 'The specified path is a directory, not a file' },
          { status: 400 }
        );
      } else if (error.message.includes('EMFILE') || error.message.includes('ENFILE')) {
        return NextResponse.json(
          { error: 'Server temporarily cannot open more files. Please try again later.' },
          { status: 503 }
        );
      }
    }

    // Generic error for other cases
    return NextResponse.json(
      { error: 'Failed to read file content: ' + (error instanceof Error ? error.message : String(error)) },
      { status: 500 }
    );
  }
}