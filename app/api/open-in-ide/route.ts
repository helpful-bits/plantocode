import { NextRequest, NextResponse } from 'next/server';
import { execFile } from 'child_process'; // Use execFile for security
import { promises as fs } from 'fs';
import path from 'path'; // Keep path import
import os from 'os';
import { existsSync } from 'fs';
import { getAppOutputFilesDirectory, getFilename as getPatchFilename } from '@/lib/path-utils'; // Keep path-utils import
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

    // Resolve the path to handle potential relative paths
    const resolvedFilePath = path.resolve(filePath);
    // Security check: verify file exists
    try {
      if (!existsSync(resolvedFilePath)) {
        // If file doesn't exist at the provided path, try creating directories if needed
        try {
          // Create directories if needed
          await fs.mkdir(path.dirname(resolvedFilePath), { recursive: true });
        } catch (dirError) {
          console.error(`Error creating directories for ${resolvedFilePath}:`, dirError);
        }
        
        // Check if maybe just the directory was missing
        if (existsSync(resolvedFilePath)) {
          return openFileWithIDE(resolvedFilePath, customCommand);
        }
        
        // Try different path variations for implementation plans
        // 1. Check if this is an implementation plan file (typically has .xml extension and 'plan_' prefix)
        const isImplementationPlan = path.basename(resolvedFilePath).startsWith('plan_') && 
                                   path.extname(resolvedFilePath) === '.xml';
        
        if (isImplementationPlan && projectDirectory) {
          // Try standard implementation plans directory paths
          const implPlansDirectPaths = [
            // Standard location within project directory
            path.join(projectDirectory, 'implementation_plans', path.basename(resolvedFilePath)),
            // Alternative location sometimes used
            path.join(projectDirectory, 'output', 'implementation_plans', path.basename(resolvedFilePath))
          ];
          
          // Check each potential path
          for (const potentialPath of implPlansDirectPaths) {
            if (existsSync(potentialPath)) {
              // Found implementation plan at alternative path
              return openFileWithIDE(potentialPath, customCommand);
            }
          }
        }
        
        // If still not found, check if it might be in the fallback location
        const filename = getPatchFilename(resolvedFilePath);
        const fallbackPath = path.join(getAppOutputFilesDirectory(), filename);
        
        if (existsSync(fallbackPath)) {
          // Use the fallback path instead
          // Found file at fallback path
          return openFileWithIDE(fallbackPath, customCommand);
        }
        
        // Final attempt: extract just the filename and look for it in implementation_plans directory
        const baseFilename = path.basename(resolvedFilePath);
        if (projectDirectory && baseFilename) {
          const projectImplPlanDir = path.join(projectDirectory, 'implementation_plans');
          if (existsSync(projectImplPlanDir)) {
            // Get all files in the implementation_plans directory
            try {
              const files = await fs.readdir(projectImplPlanDir);
              // Look for files that contain parts of the requested filename
              const similarFiles = files.filter(file => 
                file.includes(baseFilename) || baseFilename.includes(file)
              );
              
              if (similarFiles.length > 0) {
                // Use the first matching file
                const matchPath = path.join(projectImplPlanDir, similarFiles[0]);
                // Found similar implementation plan by partial match
                return openFileWithIDE(matchPath, customCommand);
              }
            } catch (readError) {
              console.error(`[OpenInIDE] Error reading implementation_plans directory:`, readError);
            }
          }
        }
        
        console.error(`[OpenInIDE] File not found after trying multiple paths: ${resolvedFilePath}`);
        return NextResponse.json({ error: 'File not found' }, { status: 404 });
      }
      
      return openFileWithIDE(resolvedFilePath, customCommand);
    } catch (err) {
      console.error(`File access error for ${resolvedFilePath}:`, err);
      return NextResponse.json({ error: 'File not found or inaccessible' }, { status: 404 });
    }
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
