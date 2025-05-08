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
    const filePath = searchParams.get('filePath');
    const projectDirectory = searchParams.get('projectDirectory');

    // Return 400 if no path parameter
    if (!filePath) {
      return NextResponse.json(
        { error: 'Missing filePath parameter' },
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

    // Normalize paths
    const normalizedFilePath = path.normalize(filePath);
    const normalizedBaseDir = path.normalize(baseDir);
    
    // Calculate the implementation plans directory
    const plansDir = getProjectImplementationPlansDirectory(normalizedBaseDir);
    
    // Check if the file is within the project directory or implementation plans directory
    const isInPlansDir = normalizedFilePath.startsWith(plansDir);
    const isInProjectDir = normalizedFilePath.startsWith(normalizedBaseDir);
    
    // For security, only allow reading files in the project directory
    if (!isInPlansDir && !isInProjectDir) {
      return NextResponse.json(
        { error: 'Invalid file path - access denied. Files must be within the project directory or implementation plans directory.' },
        { status: 403 }
      );
    }

    // Check if file exists
    try {
      await fs.access(normalizedFilePath);
    } catch (error) {
      return NextResponse.json(
        { error: `File not found: ${normalizedFilePath}` },
        { status: 404 }
      );
    }

    // Read the file content
    const content = await fs.readFile(normalizedFilePath, 'utf8');

    // Return the file content
    return NextResponse.json({
      content,
      filePath: normalizedFilePath,
    });
  } catch (error) {
    console.error('[API] Error reading file content:', error);
    return NextResponse.json(
      { error: 'Failed to read file content: ' + (error instanceof Error ? error.message : String(error)) },
      { status: 500 }
    );
  }
}