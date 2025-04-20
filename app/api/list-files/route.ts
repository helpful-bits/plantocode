import { NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';
import glob from 'glob';
import { promisify } from 'util';

const globPromise = promisify(glob);

export async function POST(request: Request) {
  try {
    const { directory, pattern = '**/*', includeStats = false } = await request.json();
    
    if (!directory) {
      return NextResponse.json(
        { error: 'Directory is required' },
        { status: 400 }
      );
    }

    try {
      // Make sure directory exists
      await fs.access(directory);
      
      // Use glob to find files matching the pattern
      const files = await globPromise(pattern, { 
        cwd: directory,
        dot: false,
        nodir: true,
        absolute: true
      });
      
      let stats = [];
      
      // Get file stats if requested
      if (includeStats) {
        stats = await Promise.all(
          files.map(async (file) => {
            try {
              const stat = await fs.stat(file);
              return {
                size: stat.size,
                mtimeMs: stat.mtimeMs,
                ctimeMs: stat.ctimeMs,
                birthtimeMs: stat.birthtimeMs
              };
            } catch (err) {
              console.error(`Error getting stats for ${file}:`, err);
              return {};
            }
          })
        );
      }
      
      return NextResponse.json({ 
        files,
        ...(includeStats ? { stats } : {})
      });
    } catch (error) {
      console.error('Error listing files:', error);
      
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return NextResponse.json(
          { error: 'Directory not found' },
          { status: 404 }
        );
      }
      
      return NextResponse.json(
        { error: `Failed to list files: ${(error as Error).message}` },
        { status: 500 }
      );
    }
  } catch (error) {
    console.error('Error in list-files API route:', error);
    return NextResponse.json(
      { error: 'Invalid request' },
      { status: 400 }
    );
  }
} 