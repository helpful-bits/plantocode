import { NextRequest, NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';
import { existsSync } from 'fs';

export async function POST(request: NextRequest) {
  try {
    const { directoryPath, projectDirectory } = await request.json();

    if (!directoryPath || typeof directoryPath !== 'string') {
      return NextResponse.json(
        { error: 'Directory path is required and must be a string' },
        { status: 400 }
      );
    }

    if (!projectDirectory || typeof projectDirectory !== 'string') {
      return NextResponse.json(
        { error: 'Project directory is required and must be a string' },
        { status: 400 }
      );
    }

    // Resolve the directory path
    const normalizedProjectDir = path.normalize(projectDirectory);
    
    // Check if path is absolute
    let absoluteDirPath: string;
    if (path.isAbsolute(directoryPath)) {
      absoluteDirPath = path.normalize(directoryPath);
    } else {
      // Resolve relative to project directory
      absoluteDirPath = path.join(normalizedProjectDir, directoryPath);
    }

    // Security check: ensure directory path is within the project directory
    if (!absoluteDirPath.startsWith(normalizedProjectDir)) {
      return NextResponse.json(
        { error: 'Security restriction: Directory must be within the project directory' },
        { status: 403 }
      );
    }

    // Check if directory already exists
    if (existsSync(absoluteDirPath)) {
      // Directory already exists, just return success
      return NextResponse.json({
        success: true,
        message: 'Directory already exists',
        created: false,
        path: absoluteDirPath
      });
    }

    // Create the directory
    await fs.mkdir(absoluteDirPath, { recursive: true });

    return NextResponse.json({
      success: true,
      message: 'Directory created successfully',
      created: true,
      path: absoluteDirPath
    });
  } catch (error) {
    console.error('Error creating directory:', error);
    
    return NextResponse.json(
      { error: 'Failed to create directory: ' + (error instanceof Error ? error.message : String(error)) },
      { status: 500 }
    );
  }
}