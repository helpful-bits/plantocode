"use server";

import { promises as fs } from 'fs';
import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export interface DeprecatedFile {
  path: string;
  newLocation?: string;
}

export async function findDeprecatedFiles(projectDir: string): Promise<DeprecatedFile[]> {
  try {
    // Use git ls-files to get all tracked files
    // Explicitly set shell path to avoid ENOENT errors in restricted environments
    const { stdout } = await execAsync('git ls-files', {
      cwd: projectDir,
      shell: '/bin/sh' });
    const files = stdout.split('\n').filter(Boolean);
    
    const deprecatedFiles: DeprecatedFile[] = [];
    
    for (const file of files) {
      const fullPath = path.join(projectDir, file);
      try {
        const content = await fs.readFile(fullPath, 'utf-8');
        const lines = content.split('\n');
        
        // Look for the deprecation marker in the first few lines
        const firstLines = lines.slice(0, 3).join('\n');
        if (firstLines.includes('=DEPRECATED=')) {
          // Try to find the new location comment
          const newLocationMatch = firstLines.match(/\/\/ .*moved to ([^*\n]+)/);
          deprecatedFiles.push({
            path: file,
            newLocation: newLocationMatch ? newLocationMatch[1].trim() : undefined
          });
        }
      } catch (error) {
        console.error(`Error reading file ${file}:`, error);
      }
    }
    
    return deprecatedFiles;
  } catch (error) {
    console.error('Error finding deprecated files:', error);
    return [];
  }
} 