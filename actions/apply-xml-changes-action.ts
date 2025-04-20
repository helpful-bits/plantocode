'use server';

import { promises as fs } from 'fs';
import * as path from 'path';
import { parseXmlChanges, applyXmlChanges, XmlChangeSet } from '@/lib/xml-utils';
import { previewXmlChanges, generateXmlPreviewReport } from '@/lib/xml-preview';
import { ActionState } from '@/types';
import { normalizePath } from '@/lib/path-utils';

// Define ApplyXmlOptions locally if it's not exported from @/types
interface ApplyXmlOptions {
  dryRun?: boolean;
  preview?: boolean;
}

/**
 * Perform basic validation on XML changes to ensure they're compatible with our processing logic
 */
function validateXmlChanges(xmlChangeSet: XmlChangeSet): { isValid: boolean; warnings: string[] } {
  const warnings: string[] = [];
  
  for (const file of xmlChangeSet.files) {
    if (file.action === 'delete') continue; // No operations to validate for delete
    
    if (!file.operations || file.operations.length === 0) {
      warnings.push(`No operations specified for ${file.path}`);
      continue;
    }
    
    for (const operation of file.operations) {
      // Skip empty search for create operations
      if (file.action === 'create' && (!operation.search || operation.search.trim() === '')) {
        continue;
      }
      
      // Check for regex-like patterns that might cause issues
      if (/\\[dDwWsS]|\[\^?.*?\]|\\b|\(\?:|^\^|\$$/.test(operation.search)) {
        warnings.push(`Warning: Search pattern for ${file.path} contains regex-like syntax which may not match as expected. Consider using exact text instead.`);
      }
      
      // Check for excessively escaped characters
      if ((operation.search.match(/\\\\/g) || []).length > 5) {
        warnings.push(`Warning: Search pattern for ${file.path} contains many escaped characters which may cause matching issues.`);
      }
      
      // Check pattern length - too short patterns are likely to match incorrectly
      if (operation.search && operation.search.length < 10 && file.action === 'modify') {
        warnings.push(`Warning: Search pattern for ${file.path} is very short (${operation.search.length} chars) and may match unintended locations.`);
      }
      
      // Check for very large patterns
      if (operation.search && operation.search.length > 1000) {
        console.warn(`[XML Apply] Large search pattern detected (${operation.search.length} chars) for ${file.path} - this increases risk of mismatch`);
        warnings.push(`Warning: Very large search pattern (${operation.search.length} characters) in ${file.path} may cause matching issues. Consider breaking into smaller patterns.`);
      }
      
      // Check for patterns with many lines
      if (operation.search && operation.search.split('\n').length > 30) {
        const lineCount = operation.search.split('\n').length;
        console.warn(`[XML Apply] Multi-line search pattern with ${lineCount} lines detected for ${file.path} - this increases risk of mismatch`);
        warnings.push(`Warning: Pattern with ${lineCount} lines in ${file.path} exceeds recommended maximum (20-30 lines). Consider using smaller patterns.`);
      }
    }
  }
  
  return {
    isValid: warnings.length === 0,
    warnings
  };
}

/**
 * Apply XML changes from a file to the project
 * 
 * @param xmlFilePath The path to the XML changes file
 * @param projectDirectory The project directory
 * @param options Additional options for applying changes
 */
export async function applyXmlChangesFromFileAction(
  xmlFilePath: string, 
  projectDirectory: string,
  options: ApplyXmlOptions = {}
): Promise<ActionState<{ changes: string[]; issues: string[]; previewReport?: string }>> {
  try {
    // Validate inputs
    if (!xmlFilePath) {
      return {
        isSuccess: false,
        message: 'No XML file path provided',
      };
    }

    if (!projectDirectory) {
      return {
        isSuccess: false,
        message: 'No project directory provided',
      };
    }

    // Read XML file
    const normalizedXmlPath = normalizePath(xmlFilePath);
    console.log(`[XML Apply] Reading XML changes from: ${normalizedXmlPath}`);
    
    let xmlContent: string;
    try {
      xmlContent = await fs.readFile(normalizedXmlPath, 'utf-8');
      console.log(`Connected to SQLite database: ${process.env.DATABASE_PATH || '/path/to/db'}`);
    } catch (error) {
      return {
        isSuccess: false,
        message: `Failed to read XML file: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }

    // Parse XML
    console.log(`[XML Apply] Parsing XML changes (${xmlContent.length} chars)`);
    let xmlChangeSet: XmlChangeSet;
    try {
      xmlChangeSet = parseXmlChanges(xmlContent);
      
      // Report any validation warnings from parsing phase
      if (xmlChangeSet.validationErrors && xmlChangeSet.validationErrors.length > 0) {
        console.warn(`[XML Parse] Completed with ${xmlChangeSet.validationErrors.length} validation warnings`);
      }
      
      // Perform additional validation on the changes to check for potential issues
      const validation = validateXmlChanges(xmlChangeSet);
      if (!validation.isValid) {
        console.warn(`[XML Validation] Found ${validation.warnings.length} potential issues in XML changes:`);
        validation.warnings.forEach(warning => console.warn(`  - ${warning}`));
        
        // Add warnings to the validationErrors array
        if (!xmlChangeSet.validationErrors) {
          xmlChangeSet.validationErrors = [];
        }
        xmlChangeSet.validationErrors.push(...validation.warnings);
      }
    } catch (error) {
      return {
        isSuccess: false,
        message: `Failed to parse XML: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }

    // Log details about changes to be applied
    console.log(`[XML Apply] ${options.dryRun ? 'Validating' : 'Applying'} ${xmlChangeSet.files.length} file changes to ${projectDirectory}`);
    for (const file of xmlChangeSet.files) {
      const operationCount = file.operations?.length || 0;
      console.log(`[XML Apply] ${file.action} ${file.path} (${operationCount} operations)`);
    }

    // Preview changes if requested
    let previewReport: string | undefined;
    if (options.preview) {
      // This would be implemented similar to your previewXmlChanges function
      previewReport = `Preview for ${xmlChangeSet.files.length} file changes`;
    }

    // Apply changes
    try {
      // Only attempt to apply if we have valid changes
      if (xmlChangeSet.files.length === 0) {
        return {
          isSuccess: false,
          message: 'No file changes found in XML',
          data: {
            changes: [],
            issues: ['No file changes found in XML'],
            previewReport,
          }
        };
      }
      
      // Process each file in the changeset
      const allChanges: string[] = [];
      const allIssues: string[] = [];
      
      for (const file of xmlChangeSet.files) {
        const filePath = path.join(projectDirectory, file.path);
        
        try {
          // Create or modify file
          if (file.action === 'create' || file.action === 'modify') {
            // Read existing content for modify operations
            let fileContent = '';
            if (file.action === 'modify') {
              try {
                fileContent = await fs.readFile(filePath, 'utf-8');
              } catch (error) {
                allIssues.push(`Cannot read file for modification: ${file.path} - ${error instanceof Error ? error.message : 'Unknown error'}`);
                continue;
              }
            }
            
            // Apply operations
            if (file.operations && file.operations.length > 0) {
              const result = applyXmlChanges(fileContent, file.operations, file.path);
              
              // Only write if not in dry run mode
              if (!options.dryRun) {
                try {
                  // Create directory if it doesn't exist
                  const dirPath = path.dirname(filePath);
                  await fs.mkdir(dirPath, { recursive: true });
                  
                  // Write file
                  await fs.writeFile(filePath, result.content, 'utf-8');
                } catch (writeError) {
                  allIssues.push(`Failed to write to ${file.path}: ${writeError instanceof Error ? writeError.message : 'Unknown error'}`);
                }
              }
              
              // Add results
              allChanges.push(...result.changes.map(change => `${file.path}: ${change}`));
            }
          }
          // Delete file
          else if (file.action === 'delete' && !options.dryRun) {
            try {
              await fs.access(filePath);
              await fs.unlink(filePath);
              allChanges.push(`Deleted file: ${file.path}`);
            } catch (error) {
              allIssues.push(`Failed to delete ${file.path}: ${error instanceof Error ? error.message : 'Unknown error'}`);
            }
          }
        } catch (fileError) {
          allIssues.push(`Error processing ${file.path}: ${fileError instanceof Error ? fileError.message : 'Unknown error'}`);
        }
      }
      
      // Return results
      return {
        isSuccess: allIssues.length === 0,
        message: allIssues.length === 0 
          ? `Applied ${allChanges.length} changes successfully${options.dryRun ? ' (dry run)' : ''}`
          : `Completed with ${allIssues.length} issues`,
        data: {
          changes: allChanges,
          issues: allIssues,
          previewReport,
        }
      };
    } catch (error) {
      console.error(`[XML Apply] Unexpected error applying changes:`, error);
      return {
        isSuccess: false,
        message: `Failed to apply changes: ${error instanceof Error ? error.message : 'Unknown error'}`,
        data: {
          changes: [],
          issues: [`Fatal error: ${error instanceof Error ? error.message : 'Unknown error'}`],
          previewReport,
        }
      };
    }
  } catch (error) {
    console.error(`[XML Apply] Unexpected error:`, error);
    return {
      isSuccess: false,
      message: `An unexpected error occurred: ${error instanceof Error ? error.message : 'Unknown error'}`,
    };
  }
}

/**
 * Validate XML file without applying changes
 * 
 * @param xmlFilePath The path to the XML changes file
 * @param projectDirectory The project directory
 */
export async function validateXmlChangesFileAction(
  xmlFilePath: string, 
  projectDirectory: string
): Promise<ActionState<{ issues: string[] }>> {
  try {
    const result = await applyXmlChangesFromFileAction(xmlFilePath, projectDirectory, { dryRun: true });
    return {
      isSuccess: result.isSuccess,
      message: result.message,
      data: {
        issues: result.data?.issues || [],
      }
    };
  } catch (error) {
    return {
      isSuccess: false,
      message: `Failed to validate XML: ${error instanceof Error ? error.message : 'Unknown error'}`,
      data: {
        issues: [`Fatal error: ${error instanceof Error ? error.message : 'Unknown error'}`],
      }
    };
  }
} 