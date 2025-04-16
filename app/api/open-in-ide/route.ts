import { NextRequest, NextResponse } from 'next/server';
import { exec } from 'child_process';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';
import { existsSync } from 'fs';
import { getAppPatchesDirectory, getPatchFilename } from '@/lib/path-utils';

export async function POST(request: NextRequest) {
  try {
    const { filePath } = await request.json();

    if (!filePath || typeof filePath !== 'string') {
      return NextResponse.json({ error: 'File path is required and must be a string' }, { status: 400 });
    }

    // Resolve the path to prevent path traversal issues
    const resolvedFilePath = path.resolve(filePath);

    // Security check: verify file exists
    try {
      if (!existsSync(resolvedFilePath)) {
        // If file doesn't exist at the provided path, check if it might be in the fallback location
        const filename = getPatchFilename(resolvedFilePath);
        const fallbackPath = path.join(getAppPatchesDirectory(), filename);
        
        if (existsSync(fallbackPath)) {
          // Use the fallback path instead
          return openFileWithIDE(fallbackPath);
        }
        
        return NextResponse.json({ error: 'File not found' }, { status: 404 });
      }
      
      return openFileWithIDE(resolvedFilePath);
    } catch (err) {
      console.error(`File access error for ${resolvedFilePath}:`, err);
      return NextResponse.json({ error: 'File not found or inaccessible' }, { status: 404 });
    }
  } catch (error) {
    console.error('Error in open-in-ide route:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

function openFileWithIDE(resolvedFilePath: string) {
  // Determine platform-specific command
  // Ensure filePath is quoted to handle spaces or special characters
  const quotedPath = `"${resolvedFilePath}"`;
  let command;
  
  switch (os.platform()) {
    case 'darwin': // macOS
      command = `idea ${quotedPath}`;
      break;
    case 'win32': // Windows
      // 'start ""' is used to handle paths with spaces correctly
      command = `start "" ${quotedPath}`;
      break;
    default: // Linux and others
      command = `xdg-open ${quotedPath}`;
      break;
  }

  // Execute the command
  exec(command, (error) => {
    if (error) {
      console.error(`Error opening file: ${error.message}`);
      return NextResponse.json({ error: `Failed to open file: ${error.message}` }, { status: 500 });
    }
  });

  return NextResponse.json({ success: true, message: 'File opened in default editor' });
}
