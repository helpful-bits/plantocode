'use server';

import { promises as fs } from 'fs';
import path from 'path';
import { parseXmlChanges, applyXmlChanges } from '@/lib/xml-utils';
import { ActionState } from '@/types';
import { normalizePath } from '@/lib/path-utils';

interface ApplyXmlOptions {
  dryRun?: boolean;
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
): Promise<ActionState<{ changes: string[] }>> {
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
    } catch (error) {
      return {
        isSuccess: false,
        message: `Failed to read XML file: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }

    // Parse XML
    console.log(`[XML Apply] Parsing XML changes (${xmlContent.length} chars)`);
    let xmlChangeSet;
    try {
      xmlChangeSet = parseXmlChanges(xmlContent);
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

    // Apply changes
    const result = await applyXmlChanges(xmlChangeSet, projectDirectory, { 
      dryRun: options.dryRun || false 
    });
    
    if (options.dryRun) {
      return {
        isSuccess: result.success,
        message: 'Dry run completed. No changes were applied.',
        data: {
          changes: result.changes,
        },
      };
    }
    
    // Return result
    return {
      isSuccess: result.success,
      message: result.message,
      data: {
        changes: result.changes,
      },
    };
  } catch (error) {
    console.error('[XML Apply] Error:', error);
    return {
      isSuccess: false,
      message: `Unexpected error: ${error instanceof Error ? error.message : 'Unknown error'}`,
    };
  }
}

/**
 * Validate XML changes without applying them
 * 
 * @param xmlFilePath The path to the XML changes file
 * @param projectDirectory The project directory
 */
export async function validateXmlChangesFromFileAction(
  xmlFilePath: string, 
  projectDirectory: string
): Promise<ActionState<{ changes: string[] }>> {
  return applyXmlChangesFromFileAction(xmlFilePath, projectDirectory, { dryRun: true });
} 