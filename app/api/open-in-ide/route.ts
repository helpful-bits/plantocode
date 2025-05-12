import { NextRequest, NextResponse } from 'next/server';
import { execFile } from 'child_process';
import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';
import { existsSync } from 'fs';
import { getProjectSetting } from '@/actions/project-settings-actions';
import { OUTPUT_FILE_EDITOR_COMMAND_KEY } from '@/lib/constants';

export async function POST(request: NextRequest) {
  try {
    const { filePath, projectDirectory } = await request.json();

    if (!filePath || typeof filePath !== 'string') {
      return NextResponse.json({ error: 'File path is required and must be a string' }, { status: 400 });
    }

    if (!projectDirectory || typeof projectDirectory !== 'string') {
      return NextResponse.json({ error: 'Project directory is required and must be a string' }, { status: 400 });
    }

    // Get custom output file editor command from project settings
    const customCommand = await getProjectSetting(projectDirectory, OUTPUT_FILE_EDITOR_COMMAND_KEY);

    // Handle paths properly with security checks
    // Calculate absolute path depending on whether input is absolute or relative
    let absoluteFilePath: string;
    if (path.isAbsolute(filePath)) {
      absoluteFilePath = path.normalize(filePath);
    } else {
      // If it's a relative path, resolve against project directory
      absoluteFilePath = path.join(projectDirectory, filePath);
    }

    // Security check: Ensure file path is within allowed directories
    // Files should be either in project directory or the implementation_plans subdirectory
    const normalizedProjectDir = path.normalize(projectDirectory);
    const implPlansDir = path.join(normalizedProjectDir, 'implementation_plans');

    const allowedPaths = [normalizedProjectDir, implPlansDir];
    const isInAllowedPath = allowedPaths.some(allowedPath =>
      absoluteFilePath.startsWith(allowedPath) &&
      (absoluteFilePath === allowedPath || absoluteFilePath.substring(allowedPath.length).startsWith(path.sep))
    );

    if (!isInAllowedPath) {
      return NextResponse.json({
        error: 'Security restriction: File must be within project directory or implementation_plans directory'
      }, { status: 403 });
    }

    // Verify file exists
    if (!existsSync(absoluteFilePath)) {
      // Try to create directory if needed
      try {
        const dirPath = path.dirname(absoluteFilePath);
        if (!existsSync(dirPath)) {
          await fs.mkdir(dirPath, { recursive: true });
        }
      } catch (dirError) {
        console.error(`Error creating directories for ${absoluteFilePath}:`, dirError);
      }

      // Check again if file exists after directory creation
      if (!existsSync(absoluteFilePath)) {
        console.error(`[OpenInIDE] File not found: ${absoluteFilePath}`);
        return NextResponse.json({
          error: `File not found: ${path.basename(absoluteFilePath)}`
        }, { status: 404 });
      }
    }

    // File exists and is in allowed directory, open it
    return openFileWithIDE(absoluteFilePath, customCommand);
  } catch (error) {
    console.error('Error in open-in-ide route:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

function openFileWithIDE(resolvedFilePath: string, customCommand: string | null): NextResponse {
  let command: string;
  let args: string[] = [];
  
  // If custom command is provided, use it
  if (customCommand && customCommand.trim()) {
    // For simplicity, assume the stored command is just the executable name
    command = customCommand.trim();
    args = [resolvedFilePath];
    
    // Using custom command to open the file
  } else {
    // Fall back to OS-specific defaults
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
    
    // Using default command for this OS platform
  }

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
  return NextResponse.json({ 
    success: true, 
    message: 'File opened in editor', 
    customCommandUsed: !!customCommand 
  });
}
