import { NextRequest, NextResponse } from 'next/server';
import * as fs from 'fs/promises';
import path from 'path';
import glob from 'glob';
import { promisify } from 'util';

const globPromise = promisify(glob);

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { directory, pattern = '**/*' } = body;

    if (!directory) {
      return NextResponse.json(
        { error: 'Directory path is required' },
        { status: 400 }
      );
    }

    // Safety check to ensure the directory exists
    try {
      await fs.access(directory, fs.constants.R_OK);
    } catch (error) {
      return NextResponse.json(
        { error: `Directory not found or not accessible: ${directory}` },
        { status: 404 }
      );
    }

    // Use glob to find files matching the pattern
    const files = await globPromise(pattern, {
      cwd: directory,
      nodir: true,
      absolute: true
    });

    // Return the list of file paths
    return NextResponse.json({ files });
  } catch (error) {
    console.error('Error listing files:', error);
    return NextResponse.json(
      { error: 'Failed to list files: ' + (error instanceof Error ? error.message : String(error)) },
      { status: 500 }
    );
  }
} 