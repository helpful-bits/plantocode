"use server";

import { promises as fs } from "fs";
import path from "path";
import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

async function getAllNonIgnoredFiles(dir: string): Promise<string[]> {
  try {
    const { stdout } = await execAsync('git ls-files --cached --others --exclude-standard', { cwd: dir });
    return stdout.split('\n').filter(Boolean);
  } catch (error) {
    console.error('Error getting non-ignored files:', error);
    return [];
  }
}

async function isBinaryFile(buffer: Buffer): Promise<boolean> {
  const hasNullByte = buffer.includes(0);
  if (hasNullByte) return true;

  const nonPrintable = buffer.filter(byte => (byte < 32 && byte !== 9 && byte !== 10 && byte !== 13) || byte >= 127);
  const ratio = nonPrintable.length / buffer.length;
  
  return ratio > 0.1;
}

const BINARY_EXTENSIONS = new Set([
  // Images
  '.jpg', '.jpeg', '.png', '.gif', '.bmp', '.ico', '.webp', '.svg',
  // Fonts
  '.woff', '.woff2', '.ttf', '.eot', '.otf',
  // Audio/Video
  '.mp3', '.mp4', '.wav', '.avi', '.mov',
  // Archives
  '.zip', '.rar', '.7z', '.tar', '.gz',
  // Documents
  '.pdf', '.doc', '.docx', '.xls', '.xlsx',
  // Other
  '.exe', '.dll', '.so', '.dylib'
]);

export async function readDirectoryAction(projectDirectory: string) {
  try {
    const finalDirectory = projectDirectory?.trim() || process.env.PROJECT_DIRECTORY;

    if (!finalDirectory) {
      throw new Error("No project directory provided");
    }

    const files = await getAllNonIgnoredFiles(finalDirectory);
    
    if (files.length === 0) {
      throw new Error("No files found. Is this a git repository?");
    }

    const fileContents: { [key: string]: string } = {};

    for (const file of files) {
      try {
        const fullPath = path.join(finalDirectory, file);
        
        const ext = path.extname(file).toLowerCase();
        if (BINARY_EXTENSIONS.has(ext)) {
          continue;
        }

        const buffer = await fs.readFile(fullPath);
        
        if (await isBinaryFile(buffer)) {
          continue;
        }

        fileContents[file] = buffer.toString('utf-8');
      } catch (error) {
        console.warn(`Failed to read file ${file}:`, error);
      }
    }

    return { 
      isSuccess: true as const, 
      data: fileContents 
    };
  } catch (error) {
    return { 
      isSuccess: false as const, 
      message: error instanceof Error ? error.message : "Failed to read directory" 
    };
  }
} 