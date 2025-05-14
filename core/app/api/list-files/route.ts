import { NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';
import { glob } from 'glob';
import { getAllNonIgnoredFiles } from '@core/lib/git-utils';
import { exec } from 'child_process';
import { normalizePath, makePathRelative, normalizePathForComparison } from '@core/lib/path-utils';

// Helper function to execute shell commands
const execAsync = (command: string, options?: { cwd?: string }): Promise<{ stdout: string, stderr: string }> => {
  return new Promise((resolve, reject) => {
    exec(command, options, (error, stdout, stderr) => {
      if (error) {
        reject(error);
      } else {
        resolve({ stdout: stdout.toString(), stderr: stderr.toString() });
      }
    });
  });
};

// Default directories to exclude (only used as fallback if getAllNonIgnoredFiles fails)
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
      
      console.log(`[list-files] Finding files in ${normalizedDir}`);
      
      // Variable to store our results
      let files: string[] = [];
      
      // First try to use git-based file discovery which respects .gitignore
      try {
        console.log(`[list-files] Attempting git-based file discovery in: ${normalizedDir}`);
        const { files: gitFiles, isGitRepo } = await getAllNonIgnoredFiles(normalizedDir);

        // Log helpful diagnostics about the git operation
        console.log(`[list-files] Git repo detection result: isGitRepo=${isGitRepo}, retrieved ${gitFiles.length} files`);

        // If this is a git repo, use the results from getAllNonIgnoredFiles
        if (isGitRepo) {
          // Convert relative paths to absolute with consistent path normalization
          const absoluteGitFiles = gitFiles.map(file => {
            // Ensure paths are normalized consistently
            const normalizedRelativePath = normalizePathForComparison(file);
            const absolutePath = path.join(normalizedDir, normalizedRelativePath);
            // Normalize the absolute path to ensure consistent forward slashes
            return normalizePath(absolutePath);
          });

          // Log some sample files for debugging
          if (absoluteGitFiles.length > 0) {
            console.log(`[list-files] Sample git files (after normalization): ${absoluteGitFiles.slice(0, 3).join(', ')}${absoluteGitFiles.length > 3 ? '...' : ''}`);
          }

          // Filter by pattern if needed
          if (pattern !== '**/*') {
            console.log(`[list-files] Applying specific pattern filter: ${pattern}`);
            // Apply pattern filter using glob
            const globOptions = {
              cwd: normalizedDir,
              absolute: true,
              nodir: true
            };

            // Get files that match the pattern
            const patternMatches = await glob(pattern, globOptions);
            console.log(`[list-files] Pattern matched ${patternMatches.length} files`);

            // Create a Set for faster lookups
            const matchSet = new Set(patternMatches.map(match => normalizePath(match)));

            // Filter git files to only include those that match the pattern
            const preFilterCount = absoluteGitFiles.length;
            files = absoluteGitFiles.filter(file => matchSet.has(normalizePath(file)));
            console.log(`[list-files] After pattern filtering: ${files.length} of ${preFilterCount} files remain`);
          } else {
            // Use all git files if no specific pattern
            files = absoluteGitFiles;
          }

          console.log(`[list-files] Found ${files.length} files using git-aware method (respecting .gitignore)`);
        } else {
          throw new Error("Not a git repository, falling back to glob");
        }
      } catch (gitError) {
        console.warn(`[list-files] Failed to use git-aware method, falling back to glob:`, gitError instanceof Error ? gitError.message : String(gitError));

        // Add more detailed logging to help debug Git issues
        try {
          console.log(`[list-files] Checking git status in ${normalizedDir}`);
          const { stdout: gitStatus } = await execAsync('git status --porcelain', { cwd: normalizedDir });
          console.log(`[list-files] Git status in ${normalizedDir}:`, gitStatus.slice(0, 200) + (gitStatus.length > 200 ? "..." : ""));
        } catch (statusError) {
          console.error(`[list-files] Error checking git status:`, statusError instanceof Error ? statusError.message : String(statusError));
          console.log(`[list-files] Directory may not be a git repository: ${normalizedDir}`);
        }

        // Fallback to glob if git method fails
        // Prepare glob options
        const globOptions = {
          cwd: normalizedDir,
          dot: false,     // Skip dotfiles by default
          nodir: true,    // Only include files, not directories
          absolute: true, // Return absolute paths
          ignore: Array.isArray(exclude) ? exclude.map(dir => `**/${dir}/**`) : undefined
        };

        try {
          console.log(`[list-files] Starting glob fallback with pattern: ${pattern}`);
          // Use glob to find files matching the pattern
          const globFiles = await glob(pattern, globOptions);

          // Normalize the paths consistently
          files = globFiles.map(file => normalizePath(file));

          console.log(`[list-files] Found ${files.length} files using glob fallback method`);

          // Log some sample files for debugging
          if (files.length > 0) {
            console.log(`[list-files] Sample glob files (after normalization): ${files.slice(0, 3).join(', ')}${files.length > 3 ? '...' : ''}`);
          }
        } catch (globError) {
          console.error(`[list-files] Glob fallback failed too:`, globError instanceof Error ? globError.message : String(globError));
          // Return an empty array rather than failing completely
          files = [];
          console.log(`[list-files] Returning empty file list due to glob failure`);
        }
      }
      
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
      
      // Process files to ensure path consistency before returning to client
      const processedFiles = (includeStats ? validFiles : files).map(file => {
        // Ensure all paths are normalized consistently
        return normalizePath(file);
      });

      // Add relative paths calculation
      const relativePathsMap: {[key: string]: string} = {};
      processedFiles.forEach(absolutePath => {
        // Create a relative path for each file (relative to the project directory)
        const relativePath = makePathRelative(absolutePath, normalizedDir);
        // Store in map for debugging and potentially future use
        relativePathsMap[absolutePath] = relativePath;
      });

      console.log(`[list-files] Processed ${processedFiles.length} files with consistent path normalization`);

      // Return success response with valid files and stats
      return NextResponse.json({
        files: processedFiles, // Return consistently normalized paths
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