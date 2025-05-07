"use server";

import { makePathRelative, normalizePathForComparison } from '@/lib/path-utils';

/**
 * Extract file paths from a response containing XML tags
 * 
 * @param responseText The response text containing XML tags with file paths
 * @param projectDirectory Optional project directory to make paths relative to
 * @returns Array of extracted (and potentially relativized) file paths
 */
export async function extractFilePathsFromTags(
  responseText: string, 
  projectDirectory?: string
): Promise<string[]> {
  const paths: string[] = [];
  
  // Match <file path="..."> or <file>path</file> patterns
  const filePathRegex = /<file(?:\s+path="([^"]+)"|[^>]*)>(?:([^<]+)<\/file>)?/g;
  let match;
  
  while ((match = filePathRegex.exec(responseText)) !== null) {
    const attributePath = match[1]; // path from attribute
    const contentPath = match[2]; // path from content
    
    if (attributePath) {
      const trimmedPath = attributePath.trim();
      // If projectDirectory is provided and path is absolute, try to make it relative
      if (projectDirectory && (trimmedPath.startsWith('/') || /^[A-Za-z]:[\\\/]/.test(trimmedPath))) {
        paths.push(makePathRelative(trimmedPath, projectDirectory));
      } else {
        paths.push(trimmedPath);
      }
    } else if (contentPath) {
      const trimmedPath = contentPath.trim();
      // If projectDirectory is provided and path is absolute, try to make it relative
      if (projectDirectory && (trimmedPath.startsWith('/') || /^[A-Za-z]:[\\\/]/.test(trimmedPath))) {
        paths.push(makePathRelative(trimmedPath, projectDirectory));
      } else {
        paths.push(trimmedPath);
      }
    }
  }
  
  return paths;
}

/**
 * Extract file paths without relying on XML tags
 * 
 * @param responseText The response text to extract paths from
 * @param projectDirectory Optional project directory to make paths relative to
 * @returns Array of extracted (and potentially relativized) file paths
 */
export async function extractPotentialFilePaths(
  responseText: string,
  projectDirectory?: string
): Promise<string[]> {
  const paths: string[] = [];
  
  // Split by newlines and process each line
  const lines = responseText.split('\n');
  
  // Common file extensions to help identify legitimate paths
  const commonExtensions = new Set([
    '.js', '.jsx', '.ts', '.tsx', '.py', '.java', '.c', '.cpp', '.h', '.hpp',
    '.go', '.rb', '.php', '.html', '.css', '.scss', '.json', '.xml', '.yaml', 
    '.yml', '.md', '.txt', '.sh', '.bat', '.ps1', '.sql', '.graphql', '.prisma',
    '.vue', '.svelte', '.dart', '.kt', '.swift', '.m', '.rs', '.toml'
  ]);
  
  // Regex to identify invalid path characters
  const invalidPathChars = /[<>:"|?*\x00-\x1F]/;
  
  // Regex to detect line formatting that's likely not a file path
  const nonPathLineFormats = /^(note|remember|important|tip|hint|warning|error|caution|attention|info):/i;
  
  // Regex to match common code file pattern: [dir/]file.ext
  const filePathPattern = /^(?:(?:\.{1,2}\/)?[\w-]+\/)*[\w-]+\.\w+$/;
  
  for (const line of lines) {
    const trimmedLine = line.trim();
    
    // Skip empty lines, lines that look like XML tags, or commented lines
    if (!trimmedLine || 
        trimmedLine.startsWith('<') || 
        trimmedLine.startsWith('#') ||
        trimmedLine.startsWith('//') ||
        trimmedLine.startsWith('/*') ||
        trimmedLine.startsWith('*')) {
      continue;
    }
    
    // Skip lines that are likely prose or instructions
    if (nonPathLineFormats.test(trimmedLine)) {
      continue;
    }
    
    // Remove numbering/bullets at the start of lines (common in LLM responses)
    const cleanedLine = trimmedLine.replace(/^[\d\.\s-]+/, '').trim();
    
    // Skip if it's empty after cleaning
    if (!cleanedLine) continue;
    
    // Skip lines that look like they're just regular text (too many spaces, parentheses, etc.)
    if (cleanedLine.split(' ').length > 2) continue;
    
    // Skip if it's too short to be a valid path
    if (cleanedLine.length < 4) continue;
    
    // Skip lines that don't look like file paths (no extension or directory separator)
    if (!cleanedLine.includes('.') && !cleanedLine.includes('/')) continue;
    
    // Require at least one path separator to avoid single filenames
    if (!cleanedLine.includes('/') && !cleanedLine.includes('\\')) continue;
    
    // Check for common file extensions
    const hasValidExtension = Array.from(commonExtensions).some(ext => 
      cleanedLine.toLowerCase().endsWith(ext)
    );
    
    // Skip if no valid extension found and it doesn't look like a directory path
    if (!hasValidExtension && !cleanedLine.endsWith('/')) continue;
    
    // Skip paths with invalid characters
    if (invalidPathChars.test(cleanedLine)) continue;
    
    // Skip extremely long paths (likely not valid)
    if (cleanedLine.length > 255) continue;
    
    // Skip if the line contains HTML/Markdown formatting
    if (cleanedLine.includes('</') || cleanedLine.includes('](')) continue;
    
    // Skip likely descriptive text that happens to contain periods and slashes
    if (cleanedLine.includes(':') && !cleanedLine.includes(':/')) continue;
    
    // Apply stricter regex pattern for common file path format
    if (!filePathPattern.test(cleanedLine) && 
        !cleanedLine.startsWith('/') && 
        !cleanedLine.startsWith('./') &&
        !cleanedLine.startsWith('../')) {
      continue;
    }
    
    // Check if it has a minimum number of path segments for typical codebase paths
    const pathSegments = cleanedLine.split('/').filter(Boolean);
    if (pathSegments.length < 2 && !cleanedLine.startsWith('./')) continue;
    
    // Process the path: if it's absolute and we have a project directory, make it relative
    if (projectDirectory && (cleanedLine.startsWith('/') || /^[A-Za-z]:[\\\/]/.test(cleanedLine))) {
      paths.push(makePathRelative(cleanedLine, projectDirectory));
    } else {
      // Already relative or we don't have a project directory
      paths.push(cleanedLine);
    }
  }
  
  return paths;
}