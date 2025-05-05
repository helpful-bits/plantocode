import { NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';
import { glob } from 'glob';

const DEFAULT_EXCLUDED_DIRS = ['node_modules', '.git', '.next', 'dist', 'build'];

interface FileStats {
  size: number;
  mtimeMs: number;
  ctimeMs: number;
  birthtimeMs: number;
}

export async function POST(request: Request) {
  try {
    // Check if request has content before parsing
    const contentType = request.headers.get('content-type');
    if (!contentType || !contentType.includes('application/json')) {
      console.error('[list-files] Invalid content type:', contentType);
      return NextResponse.json(
        { error: 'Content-Type must be application/json' },
        { status: 400 }
      );
    }
    
    // Clone the request to read its body as text for better error handling
    const requestClone = request.clone();
    const bodyText = await requestClone.text();
    
    if (!bodyText || bodyText.trim() === '') {
      console.error('[list-files] Empty request body');
      return NextResponse.json(
        { error: 'Request body cannot be empty' },
        { status: 400 }
      );
    }
    
    // Parse the JSON safely
    let requestData;
    try {
      requestData = JSON.parse(bodyText);
    } catch (jsonError) {
      console.error('[list-files] JSON parse error:', jsonError);
      return NextResponse.json(
        { error: 'Invalid JSON in request body' },
        { status: 400 }
      );
    }
    
    const { directory, pattern = '**/*', includeStats = false, exclude = DEFAULT_EXCLUDED_DIRS } = requestData;
    
    // Validate directory parameter
    if (!directory) {
      console.warn('Missing directory parameter in request');
      return NextResponse.json(
        { error: 'Directory is required' },
        { status: 400 }
      );
    }

    // Validate pattern
    if (typeof pattern !== 'string') {
      console.warn('Invalid pattern parameter in request:', pattern);
      return NextResponse.json(
        { error: 'Pattern must be a string' },
        { status: 400 }
      );
    }
    
    // Normalize directory path to prevent directory traversal attacks
    const normalizedDir = path.normalize(directory);
    
    // Basic validation: ensure directory is absolute and doesn't contain suspicious patterns
    if (!path.isAbsolute(normalizedDir)) {
      console.warn(`Directory must be an absolute path: ${normalizedDir}`);
      return NextResponse.json(
        { error: 'Directory must be an absolute path' },
        { status: 400 }
      );
    }
    
    // Extra check for directory traversal attempts
    if (normalizedDir.includes('..')) {
      console.warn(`Possible directory traversal attempt detected: ${normalizedDir}`);
      return NextResponse.json(
        { error: 'Invalid directory path' },
        { status: 400 }
      );
    }

    try {
      console.log(`[list-files] Checking directory access: ${normalizedDir}`);
      // Make sure directory exists and is accessible
      await fs.access(normalizedDir, fs.constants.R_OK);
      
      // Get directory stats to ensure it's actually a directory
      const dirStats = await fs.stat(normalizedDir);
      if (!dirStats.isDirectory()) {
        console.error(`[list-files] Path exists but is not a directory: ${normalizedDir}`);
        return NextResponse.json(
          { error: 'Path exists but is not a directory' },
          { status: 400 }
        );
      }
      
      console.log(`[list-files] Finding files in ${normalizedDir} with pattern "${pattern}"`);
      
      // Prepare glob options
      const globOptions = { 
        cwd: normalizedDir,
        dot: false,     // Skip dotfiles by default
        nodir: true,    // Only include files, not directories
        absolute: true, // Return absolute paths
        ignore: Array.isArray(exclude) ? exclude.map(dir => `**/${dir}/**`) : undefined
      };
      
      // Use glob to find files matching the pattern - glob v11 returns promises directly
      const files = await glob(pattern, globOptions);
      
      console.log(`[list-files] Found ${files.length} files in ${normalizedDir}`);
      
      // Get file stats if requested
      let stats: FileStats[] = [];
      let validFiles: string[] = files;
      
      if (includeStats && files.length > 0) {
        console.log(`[list-files] Getting stats for ${files.length} files`);
        
        // Create a map to maintain the relationship between files and their stats
        const fileStatsMap = new Map<string, FileStats | null>();
        
        // Get stats for all files
        const statsWithNulls = await Promise.all(
          files.map(async (file) => {
            try {
              const stat = await fs.stat(file);
              const fileStats = {
                size: stat.size,
                mtimeMs: stat.mtimeMs,
                ctimeMs: stat.ctimeMs,
                birthtimeMs: stat.birthtimeMs
              };
              fileStatsMap.set(file, fileStats);
              return fileStats;
            } catch (err) {
              console.error(`[list-files] Error getting stats for ${file}:`, err);
              fileStatsMap.set(file, null);
              return null;
            }
          })
        );
        
        // Filter out files with failed stats if includeStats is true
        validFiles = files.filter(file => fileStatsMap.get(file) !== null);
        
        // Get the stats in the same order as validFiles
        stats = validFiles.map(file => fileStatsMap.get(file)).filter(Boolean) as FileStats[];
        
        console.log(`[list-files] Successfully got stats for ${stats.length} of ${files.length} files`);
        
        // If the number of valid files is significantly less than the original count, log a warning
        if (validFiles.length < files.length * 0.9) { // Less than 90% success rate
          console.warn(`[list-files] Warning: Only ${validFiles.length} of ${files.length} files (${((validFiles.length / files.length) * 100).toFixed(1)}%) have valid stats. Some files may be unreadable.`);
        }
      }
      
      // Return success response with valid files and stats
      return NextResponse.json({ 
        files: includeStats ? validFiles : files, // If includeStats is true, only return files that have valid stats
        ...(includeStats ? { stats } : {}),
        ...(includeStats && validFiles.length < files.length 
            ? { 
                warning: `${files.length - validFiles.length} files were excluded due to stat errors`,
                totalFoundBeforeFiltering: files.length 
              } 
            : {})
      });
    } catch (error) {
      console.error('[list-files] Error listing files:', error);
      
      // Handle specific error cases with appropriate status codes
      const errObj = error as NodeJS.ErrnoException;
      
      if (errObj.code === 'ENOENT') {
        console.error(`[list-files] Directory not found: ${directory}`);
        return NextResponse.json(
          { error: 'Directory not found' },
          { status: 404 }
        );
      }
      
      if (errObj.code === 'EACCES') {
        console.error(`[list-files] Permission denied accessing directory: ${directory}`);
        return NextResponse.json(
          { error: 'Permission denied accessing directory' },
          { status: 403 }
        );
      }
      
      if (errObj.code === 'ETIMEDOUT' || errObj.code === 'ECONNREFUSED' || errObj.code === 'EHOSTUNREACH') {
        console.error(`[list-files] Network error: ${errObj.code}`);
        return NextResponse.json(
          { error: `Network error: ${errObj.code}` },
          { status: 503 }
        );
      }
      
      // Generic error case
      return NextResponse.json(
        { error: `Failed to list files: ${errObj.message || 'Unknown error'}` },
        { status: 500 }
      );
    }
  } catch (error) {
    console.error('[list-files] Error parsing request:', error);
    return NextResponse.json(
      { error: 'Invalid request format' },
      { status: 400 }
    );
  }
} 