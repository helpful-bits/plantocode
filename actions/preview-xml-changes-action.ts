'use server';

import { promises as fs } from 'fs';
import * as path from 'path';
import { parseXmlChanges, XmlChangeSet } from '@/lib/xml-utils';
import { previewXmlChanges, generateXmlPreviewReport } from '@/lib/xml-preview';
import { ActionState } from '@/types';
import { normalizePath } from '@/lib/path-utils';

/**
 * Basic validation of search patterns to ensure they'll work with our processing logic
 */
function validateSearchPatterns(xmlChangeSet: XmlChangeSet): { isValid: boolean; warnings: string[] } {
  const warnings: string[] = [];
  
  for (const file of xmlChangeSet.files) {
    if (file.action === 'delete') continue; // No operations to validate for delete
    
    if (!file.operations || file.operations.length === 0) {
      if (file.action !== 'create') {
        warnings.push(`No operations specified for ${file.path}`);
      }
      continue;
    }
    
    for (const operation of file.operations) {
      // Skip empty search for create operations
      if (file.action === 'create' && (!operation.search || operation.search.trim() === '')) {
        continue;
      }
      
      // Check for patterns that look like they're intended to be regex
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
    }
  }
  
  return {
    isValid: warnings.length === 0,
    warnings
  };
}

/**
 * Preview XML changes from a file to check if they would apply correctly
 * 
 * @param xmlFilePath The path to the XML changes file
 * @param projectDirectory The project directory
 */
export async function previewXmlChangesFromFileAction(
  xmlFilePath: string,
  projectDirectory: string
): Promise<ActionState<{ success: boolean; message: string; report: string }>> {
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
    console.log(`[XML Preview] Reading XML changes from: ${normalizedXmlPath}`);
    
    let xmlContent: string;
    try {
      xmlContent = await fs.readFile(normalizedXmlPath, 'utf-8');
    } catch (error) {
      return {
        isSuccess: false,
        message: `Failed to read XML file: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }

    // Parse XML
    console.log(`[XML Preview] Parsing XML changes (${xmlContent.length} chars)`);
    let xmlChangeSet: XmlChangeSet;
    try {
      xmlChangeSet = parseXmlChanges(xmlContent);
      
      // Perform pattern validation
      const validation = validateSearchPatterns(xmlChangeSet);
      if (!validation.isValid) {
        console.warn(`[XML Preview] Found ${validation.warnings.length} potential issues with search patterns:`);
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

    // Preview changes
    console.log(`[XML Preview] Previewing ${xmlChangeSet.files.length} file changes in ${projectDirectory}`);
    const previewResult = await previewXmlChanges(xmlChangeSet, projectDirectory);
    
    // Generate report for UI display
    const report = generateXmlPreviewReport(previewResult);
    
    // Check if we have files with no matches at all
    const filesWithNoMatches = previewResult.fileResults.filter(file => 
      file.fileExists && 
      file.operations.length > 0 && 
      file.operations.every(op => !op.success)
    );
    
    // Generate clear message about the preview outcome
    let message = '';
    if (filesWithNoMatches.length > 0) {
      message = `Could not find any matches in ${filesWithNoMatches.length} file(s). Exact text matching might fail.`;
    } else if (!previewResult.success) {
      message = `Found some issues with search patterns, but at least one matching strategy will work for all patterns.`;
    } else {
      message = 'All search patterns can be matched successfully.';
    }
    
    return {
      isSuccess: previewResult.success,
      message,
      data: {
        success: previewResult.success,
        message: previewResult.message,
        report,
      }
    };
  } catch (error) {
    console.error('[XML Preview] Error:', error);
    return {
      isSuccess: false,
      message: `Unexpected error: ${error instanceof Error ? error.message : 'Unknown error'}`,
    };
  }
} 