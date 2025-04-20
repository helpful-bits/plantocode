/**
 * XML Preview utility for testing patterns against actual file content
 * This is a diagnostic tool to be used before applying XML changes
 */

import { promises as fs } from 'fs';
import * as path from 'path';
import { XmlChangeSet, XmlFileChange, XmlOperation } from './xml-utils'; 
import { normalizePath } from './path-utils';
import { fixRegexPattern } from './xml-utils';

/**
 * Results of previewing a pattern match
 */
export interface PatternPreviewResult {
  pattern: string;
  filePath: string;
  success: boolean;
  matchCount: number;
  samples: string[];
  matchMethod?: 'exact-text' | 'normalized-text' | 'whitespace-normalized' | 'regex' | 'none';
  error?: string;
  autoFixed?: boolean;
  fixedDetails?: string[];
}

/**
 * Results of previewing an entire XML change set
 */
export interface XmlPreviewResult {
  success: boolean;
  message: string;
  fileResults: {
    filePath: string;
    fileExists: boolean;
    operations: PatternPreviewResult[];
  }[];
}

/**
 * Test a pattern against file content using multiple strategies
 */
export async function previewPatternMatch(
  pattern: string,
  filePath: string,
  fileContent: string
): Promise<PatternPreviewResult> {
  const result: PatternPreviewResult = {
    pattern,
    filePath,
    success: false,
    matchCount: 0,
    samples: [],
  };
  
  // Skip empty patterns
  if (!pattern || pattern.trim() === '') {
    result.success = true; // Empty patterns for create operations are valid
    result.matchMethod = 'none';
    return result;
  }
  
  try {
    // Method 1: Try direct text matching first (most reliable)
    if (fileContent.includes(pattern)) {
      console.log(`[XML Preview] Using exact text match for ${filePath}`);
      result.success = true;
      result.matchCount = countOccurrences(fileContent, pattern);
      result.matchMethod = 'exact-text';
      
      // Get samples (with some context)
      const samples = getSamplesWithContext(fileContent, pattern);
      result.samples = samples;
      
      return result;
    }
    
    // Method 2: Try with normalized line endings
    const normalizedPattern = pattern.replace(/\r\n/g, '\n');
    const normalizedContent = fileContent.replace(/\r\n/g, '\n');
    
    if (normalizedContent.includes(normalizedPattern)) {
      console.log(`[XML Preview] Using normalized line endings text match for ${filePath}`);
      result.success = true;
      result.matchCount = countOccurrences(normalizedContent, normalizedPattern);
      result.matchMethod = 'normalized-text';
      
      // Get samples (with some context)
      const samples = getSamplesWithContext(normalizedContent, normalizedPattern);
      result.samples = samples;
      
      return result;
    }
    
    // Method 3: Try with whitespace normalization (helps with indentation differences)
    const normalizedWhitespacePattern = normalizedPattern.replace(/\s+/g, ' ').trim();
    const contentLines = normalizedContent.split('\n');
    let whitespaceMatches: string[] = [];
    
    for (let i = 0; i < contentLines.length; i++) {
      const line = contentLines[i];
      const normalizedLine = line.replace(/\s+/g, ' ').trim();
      
      if (normalizedLine === normalizedWhitespacePattern || 
          normalizedWhitespacePattern.includes(normalizedLine)) {
        // Found a likely match with normalized whitespace
        const contextLines = contentLines.slice(Math.max(0, i - 5), Math.min(contentLines.length, i + 5)).join('\n');
        console.log(`[XML Preview] Found potential whitespace-normalized match at line ${i+1} in ${filePath}`);
        whitespaceMatches.push(contextLines);
      }
    }
    
    if (whitespaceMatches.length > 0) {
      result.success = true;
      result.matchCount = whitespaceMatches.length;
      result.matchMethod = 'whitespace-normalized';
      
      // Add samples (up to 3)
      const sampleCount = Math.min(whitespaceMatches.length, 3);
      for (let i = 0; i < sampleCount; i++) {
        result.samples.push(whitespaceMatches[i]);
      }
      
      return result;
    }
    
    // Method 4: Only as a last resort, try regex
    // First check if it looks like a regex pattern
    const isLikelyRegex = /[.*+?^${}()|[\]\\]/.test(pattern) && 
                          !pattern.includes('function') && 
                          !pattern.includes('import ') && 
                          !pattern.includes('export ');
    
    if (isLikelyRegex) {
      // Fix and compile the regex
      const { fixed, modifications } = fixRegexPattern(pattern);
      
      if (modifications.length > 0) {
        console.log(`[XML Preview] Fixed regex pattern for ${filePath}:`);
        modifications.forEach(mod => console.log(`  - ${mod}`));
        result.autoFixed = true;
        result.fixedDetails = modifications;
      }
      
      try {
        // Try the regex
        const regex = new RegExp(fixed, 'gms');
        const matches = fileContent.match(regex);
        
        if (matches && matches.length > 0) {
          console.log(`[XML Preview] Using regex match for ${filePath} (${matches.length} matches)`);
          result.success = true;
          result.matchCount = matches.length;
          result.matchMethod = 'regex';
          
          // Get samples of matches
          const sampleCount = Math.min(matches.length, 3);
          for (let i = 0; i < sampleCount; i++) {
            const match = matches[i];
            // Truncate long matches
            const truncated = match.length > 500 
              ? match.substring(0, 250) + '\n...\n' + match.substring(match.length - 250) 
              : match;
            result.samples.push(truncated);
          }
          
          return result;
        }
      } catch (regexError) {
        result.error = `Error with regex: ${regexError instanceof Error ? regexError.message : 'Unknown error'}`;
      }
    }
    
    // No matches found with any method
    result.success = false;
    result.matchCount = 0;
    result.matchMethod = 'none';
    result.error = "No matches found using any method (exact, normalized, whitespace-normalized, or regex)";
    
  } catch (error) {
    result.success = false;
    result.error = `Error testing pattern: ${error instanceof Error ? error.message : 'Unknown error'}`;
  }
  
  return result;
}

/**
 * Count occurrences of a substring in a string
 */
function countOccurrences(str: string, substr: string): number {
  let count = 0;
  let pos = str.indexOf(substr);
  
  while (pos !== -1) {
    count++;
    pos = str.indexOf(substr, pos + 1);
  }
  
  return count;
}

/**
 * Get samples of matches with some context
 */
function getSamplesWithContext(content: string, pattern: string): string[] {
  const samples: string[] = [];
  const contextLines = 5; // Lines of context before and after
  
  // Get positions of all matches
  const positions: number[] = [];
  let pos = content.indexOf(pattern);
  
  while (pos !== -1) {
    positions.push(pos);
    pos = content.indexOf(pattern, pos + 1);
    
    // Limit to 3 samples
    if (positions.length >= 3) break;
  }
  
  // Extract context for each match
  for (const pos of positions) {
    // Find start of context (beginning of file or a few lines before match)
    let contextStart = pos;
    let lineCount = 0;
    
    while (contextStart > 0 && lineCount < contextLines) {
      contextStart--;
      if (content[contextStart] === '\n') lineCount++;
    }
    
    // Find end of context (end of file or a few lines after match)
    let contextEnd = pos + pattern.length;
    lineCount = 0;
    
    while (contextEnd < content.length && lineCount < contextLines) {
      contextEnd++;
      if (content[contextEnd] === '\n') lineCount++;
    }
    
    // Extract context
    const sample = content.substring(contextStart, contextEnd);
    samples.push(sample);
  }
  
  return samples;
}

/**
 * Preview all patterns in an XML change set against actual files
 */
export async function previewXmlChanges(
  xmlChangeSet: XmlChangeSet,
  projectDirectory: string
): Promise<XmlPreviewResult> {
  const fileResults: XmlPreviewResult['fileResults'] = [];
  const errors: string[] = [];
  
  for (const fileChange of xmlChangeSet.files) {
    const filePath = path.join(projectDirectory, fileChange.path);
    const normalizedPath = normalizePath(filePath);
    
    // Check if file exists
    let fileExists = false;
    let fileContent = '';
    try {
      await fs.access(filePath);
      fileExists = true;
      
      // Read file content if this is a modify operation
      if (fileChange.action === 'modify') {
        fileContent = await fs.readFile(filePath, 'utf-8');
      }
    } catch (error) {
      fileExists = false;
    }
    
    const fileResult = {
      filePath: fileChange.path,
      fileExists,
      operations: [] as PatternPreviewResult[],
    };
    
    // Skip operations for delete or non-existent files
    if (fileChange.action === 'delete' || !fileExists) {
      fileResults.push(fileResult);
      continue;
    }
    
    // Test each operation
    if (fileChange.operations) {
      for (const operation of fileChange.operations) {
        // Skip empty search patterns (for create operations)
        if (!operation.search && fileChange.action === 'create') {
          continue;
        }
        
        // Test the pattern using our multi-strategy approach
        const patternResult = await previewPatternMatch(
          operation.search,
          fileChange.path,
          fileContent
        );
        
        fileResult.operations.push(patternResult);
        
        // Add error for operations that don't match
        if (!patternResult.success) {
          errors.push(`Pattern doesn't match in ${fileChange.path}: ${patternResult.error || 'No matches found'}`);
        }
      }
    }
    
    fileResults.push(fileResult);
  }
  
  return {
    success: errors.length === 0,
    message: errors.length > 0 
      ? `Found ${errors.length} issues with patterns` 
      : 'All patterns validated successfully',
    fileResults,
  };
}

/**
 * Generate a human-readable report of the XML preview results
 * Optimized for UI display
 */
export function generateXmlPreviewReport(result: XmlPreviewResult): string {
  let report = `XML Preview Report\n==================\n\n`;
  report += `Overall status: ${result.success ? 'SUCCESS' : 'ISSUES FOUND'}\n`;
  
  if (!result.success) {
    const issueCount = result.fileResults.reduce(
      (count, file) => count + file.operations.filter(op => !op.success).length, 
      0
    );
    report += `Found ${issueCount} issues with patterns\n\n`;
  } else {
    report += 'All patterns validated successfully\n\n';
  }
  
  // Sort files by those with issues first
  const sortedFileResults = [...result.fileResults].sort((a, b) => {
    const aHasIssues = a.operations.some(op => !op.success);
    const bHasIssues = b.operations.some(op => !op.success);
    return bHasIssues ? 1 : (aHasIssues ? -1 : 0);
  });
  
  for (const fileResult of sortedFileResults) {
    report += `File: ${fileResult.filePath}\n`;
    report += `Status: ${fileResult.fileExists ? 'EXISTS' : 'MISSING'}\n`;
    
    if (!fileResult.fileExists) {
      report += `No operations tested - file does not exist\n\n`;
      continue;
    }
    
    if (fileResult.operations.length === 0) {
      report += `No operations to test\n\n`;
      continue;
    }
    
    report += `Operations:\n`;
    for (let i = 0; i < fileResult.operations.length; i++) {
      const op = fileResult.operations[i];
      report += `  [${i + 1}] Pattern: ${op.pattern.substring(0, 50)}${op.pattern.length > 50 ? '...' : ''}\n`;
      report += `      Status: ${op.success ? 'MATCHES' : 'NO MATCHES'}\n`;
      report += `      Matches: ${op.matchCount}\n`;
      
      if (op.matchMethod) {
        report += `      Match method: ${op.matchMethod.toUpperCase()}\n`;
      }
      
      if (op.autoFixed) {
        report += `      Auto-fixed: YES\n`;
        if (op.fixedDetails && op.fixedDetails.length > 0) {
          report += `      Fixes applied:\n`;
          for (const fix of op.fixedDetails) {
            report += `        - ${fix}\n`;
          }
        }
      }
      
      if (op.error) {
        report += `      Error: ${op.error}\n`;
      }
      
      if (op.samples.length > 0) {
        report += `      Sample matches:\n`;
        for (const sample of op.samples) {
          // Add indentation to each line of the sample
          const indentedSample = sample
            .split('\n')
            .map(line => `        | ${line}`)
            .join('\n');
          report += `${indentedSample}\n`;
        }
      }
      
      report += '\n';
    }
    
    report += `\n`;
  }
  
  return report;
} 