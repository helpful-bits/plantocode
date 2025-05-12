import { NextRequest, NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';
import { existsSync } from 'fs';
import { getProjectImplementationPlansDirectory } from '@/lib/path-utils';

export async function POST(request: NextRequest) {
  try {
    const { filePath, content, projectDirectory } = await request.json();

    // Validate request parameters
    if (!filePath || typeof filePath !== 'string') {
      return NextResponse.json(
        { error: 'File path is required and must be a string' },
        { status: 400 }
      );
    }

    if (!projectDirectory || typeof projectDirectory !== 'string') {
      return NextResponse.json(
        { error: 'Project directory is required and must be a string' },
        { status: 400 }
      );
    }

    if (content === undefined) {
      return NextResponse.json(
        { error: 'Content is required' },
        { status: 400 }
      );
    }

    // Normalize paths
    const normalizedProjectDir = path.normalize(projectDirectory);
    const plansDir = getProjectImplementationPlansDirectory(normalizedProjectDir);
    
    // Calculate absolute file path
    let absoluteFilePath: string;
    if (path.isAbsolute(filePath)) {
      absoluteFilePath = path.normalize(filePath);
    } else {
      // If path is relative, resolve against project directory
      absoluteFilePath = path.join(normalizedProjectDir, filePath);
    }

    // Security check: ensure the file path is within allowable directories
    const allowableDirs = [normalizedProjectDir, plansDir];
    const isInAllowableDirs = allowableDirs.some(dir =>
      absoluteFilePath.startsWith(dir) &&
      // Extra check to prevent partial prefix matches
      (absoluteFilePath === dir || absoluteFilePath.substring(dir.length).startsWith(path.sep))
    );

    if (!isInAllowableDirs) {
      return NextResponse.json(
        { error: 'Security restriction: File must be within the project directory or implementation_plans directory' },
        { status: 403 }
      );
    }

    // Ensure the directory exists
    const dirPath = path.dirname(absoluteFilePath);
    if (!existsSync(dirPath)) {
      await fs.mkdir(dirPath, { recursive: true });
    }

    // Write the file
    await fs.writeFile(absoluteFilePath, content, 'utf8');

    return NextResponse.json({
      success: true,
      message: 'File written successfully',
      path: absoluteFilePath
    });
  } catch (error) {
    console.error('Error writing file:', error);
    
    // Provide more specific error messages based on error type
    if (error instanceof Error) {
      if (error.message.includes('EACCES')) {
        return NextResponse.json(
          { error: 'Permission denied: Cannot write to the specified file' },
          { status: 403 }
        );
      } else if (error.message.includes('ENOENT')) {
        return NextResponse.json(
          { error: 'Directory does not exist and could not be created' },
          { status: 404 }
        );
      }
    }
    
    return NextResponse.json(
      { error: 'Failed to write file: ' + (error instanceof Error ? error.message : String(error)) },
      { status: 500 }
    );
  }
}