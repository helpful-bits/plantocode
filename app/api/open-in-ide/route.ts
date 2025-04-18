import { NextRequest, NextResponse } from 'next/server';
import { execFile } from 'child_process'; // Use execFile for security
import { promises as fs } from 'fs';
import path from 'path'; // Keep path import
import os from 'os';
import { existsSync } from 'fs';
import { getAppPatchesDirectory, getPatchFilename } from '@/lib/path-utils'; // Keep path-utils import

export async function POST(request: NextRequest) {
  try {
    const { filePath } = await request.json();

    if (!filePath || typeof filePath !== 'string') {
      return NextResponse.json({ error: 'File path is required and must be a string' }, { status: 400 });
    }

    // Resolve the path to handle potential relative paths
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

function openFileWithIDE(resolvedFilePath: string): NextResponse {
  let command: string;
  let args: string[] = [];
  
  switch (os.platform()) {
    case 'darwin': // macOS
      // Use 'open' which should handle opening the file with the default app or IDE
      command = 'idea' // '/usr/bin/open';
      args = [resolvedFilePath];
      break;
    case 'win32': // Windows
      // Use 'start' which is a built-in command
      command = 'cmd.exe';
      // Use /c to run the command and exit, start "" handles paths with spaces
      args = ['/c', 'start', '""', resolvedFilePath];
      break;
    default: // Linux and others
      command = 'xdg-open';
      args = [resolvedFilePath];
      break;
  }

  console.log(`[OpenInIDE] Executing: ${command} ${args.join(' ')}`);

  // Execute the command
  // Use execFile for better security - avoids shell interpretation of the file path
  execFile(command, args, (error, stdout, stderr) => {
    if (error) { // Check for error
      // Log the error but don't block the response, as the command might still partially succeed
      // or the error might be non-critical (e.g., editor already open)
      console.error(`Error opening file: ${error.message}`);
      // Cannot return NextResponse from callback, logging is sufficient
    }
  });

  // Assume success and return immediately - the OS handles opening the file
  return NextResponse.json({ success: true, message: 'File opened in default editor' });
}
