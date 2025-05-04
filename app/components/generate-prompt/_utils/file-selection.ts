/**
 * Determines if a file should be included by default based on its path
 * This is used when loading files to pre-select common source files
 * @param filePath The path to the file to check
 * @returns A boolean indicating whether the file should be included by default
 */
export function shouldIncludeByDefault(filePath: string): boolean {
  if (!filePath) return false;
  
  const normalizedPath = filePath.toLowerCase().replace(/\\/g, '/');
  
  // Skip common files and directories to exclude
  const excludePatterns = [
    // Build directories
    /\/dist\//,
    /\/build\//,
    /\/out\//,
    /\/coverage\//,
    /\/.next\//,
    
    // Package manager directories
    /\/node_modules\//,
    
    // Git directories
    /\/.git\//,
    
    // Cache directories
    /\/.cache\//,
    
    // Common large binary files
    /\.(jpg|jpeg|png|gif|mp4|mp3|mov|zip|tar|gz)$/,
    
    // Common binary or output files
    /\.(o|obj|exe|dll|so|pyc|class)$/,
    
    // Lock files
    /package-lock\.json$/,
    /yarn\.lock$/,
    /pnpm-lock\.yaml$/,
    
    // Log files
    /\.(log|logs)$/,
    
    // Large data files
    /\.(csv|tsv)$/,
    
    // Config files that are usually not relevant
    /\.env\./,
    /\.eslintrc/,
    /\.prettier/
  ];
  
  // Check if the file matches any exclusion patterns
  for (const pattern of excludePatterns) {
    if (pattern.test(normalizedPath)) {
      return false;
    }
  }
  
  // Include common source files by default
  const includePatterns = [
    // Source files
    /\.(js|jsx|ts|tsx|vue|svelte)$/,
    /\.(py|rb|php|java|c|cpp|cs|go|rs|swift)$/,
    
    // Config and manifest files
    /package\.json$/,
    /tsconfig\.json$/,
    /vite\.config\./,
    /webpack\.config\./,
    
    // Documentation files
    /readme\.md$/i,
    /contributing\.md$/i,
    
    // HTML and CSS files
    /\.(html|css|scss|sass|less)$/,
  ];
  
  // Check if the file matches any inclusion patterns
  for (const pattern of includePatterns) {
    if (pattern.test(normalizedPath)) {
      return true;
    }
  }
  
  // Default to not including (only explicitly matched files are included)
  return false;
} 