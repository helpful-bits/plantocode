import { promises as fs } from 'fs';
import * as path from 'path';
import { normalizePath } from './path-utils';
import { DOMParser } from 'xmldom';
// Remove libxmljs dependency which causes issues with Next.js server components
// import { validateXML } from 'libxmljs';

// Types for XML document structure
export interface XmlChangeSet {
  version: string;
  files: XmlFileChange[];
  meta?: string;
}

export interface XmlFileChange {
  path: string;
  action: 'create' | 'modify' | 'delete';
  operations?: XmlOperation[];
  meta?: string;
}

export interface XmlOperation {
  search: string;
  replace: string;
}

interface BackupFile {
  path: string;
  content: string | null; // null means file didn't exist before
}

const XML_SCHEMA = `<?xml version="1.1" encoding="UTF-8"?>
<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema"
           targetNamespace="https://example.com/ns/changes"
           elementFormDefault="qualified">
  <xs:element name="changes">
    <xs:complexType>
      <xs:sequence>
        <xs:element name="file" maxOccurs="unbounded">
          <xs:complexType>
            <xs:sequence>
              <xs:element name="operation" minOccurs="0" maxOccurs="unbounded">
                <xs:complexType>
                  <xs:sequence>
                    <xs:element name="search"  type="xs:string"/>
                    <xs:element name="replace" type="xs:string"/>
                  </xs:sequence>
                </xs:complexType>
              </xs:element>
              <xs:element name="meta" type="xs:string" minOccurs="0"/>
            </xs:sequence>
            <xs:attribute name="path"   type="xs:string" use="required"/>
            <xs:attribute name="action" use="required">
              <xs:simpleType>
                <xs:restriction base="xs:string">
                  <xs:enumeration value="modify"/>
                  <xs:enumeration value="create"/>
                  <xs:enumeration value="delete"/>
                </xs:restriction>
              </xs:simpleType>
            </xs:attribute>
          </xs:complexType>
        </xs:element>
      </xs:sequence>
      <xs:attribute name="version" type="xs:positiveInteger" use="required"/>
    </xs:complexType>
  </xs:element>
</xs:schema>`;

/**
 * Simple XML schema validation (basic checks only)
 * This replaces the libxmljs dependency which causes issues with Next.js server components
 */
function validateXMLBasic(xmlContent: string): boolean {
  try {
    // Use the DOM parser for basic validation
    const parser = new DOMParser({
      errorHandler: {
        warning: (msg) => { console.warn('[XML Validation] Warning:', msg); },
        error: (msg) => { throw new Error(msg); },
        fatalError: (msg) => { throw new Error(msg); }
      }
    });
    
    const doc = parser.parseFromString(xmlContent, 'application/xml');
    
    // Check for parsing errors
    const parseErrors = doc.getElementsByTagName('parsererror');
    if (parseErrors.length > 0) {
      return false;
    }
    
    // Validate root element
    const root = doc.documentElement;
    if (root.nodeName !== 'changes') {
      return false;
    }
    
    // Validate version attribute
    const version = root.getAttribute('version');
    if (!version || !/^\d+$/.test(version)) {
      return false;
    }
    
    // Basic validation of file elements
    const fileElements = root.getElementsByTagName('file');
    for (let i = 0; i < fileElements.length; i++) {
      const fileEl = fileElements[i];
      const filePath = fileEl.getAttribute('path');
      const action = fileEl.getAttribute('action');
      
      if (!filePath || !action) {
        return false;
      }
      
      if (action !== 'create' && action !== 'modify' && action !== 'delete') {
        return false;
      }
      
      // For create/modify, validate operations
      if (action !== 'delete') {
        const operationElements = fileEl.getElementsByTagName('operation');
        for (let j = 0; j < operationElements.length; j++) {
          const opEl = operationElements[j];
          const searchEls = opEl.getElementsByTagName('search');
          const replaceEls = opEl.getElementsByTagName('replace');
          
          if (searchEls.length !== 1 || replaceEls.length !== 1) {
            return false;
          }
        }
      }
    }
    
    return true;
  } catch (error) {
    console.error('[XML Validation] Error:', error);
    return false;
  }
}

/**
 * Parse XML changes document using a proper XML parser
 */
export function parseXmlChanges(xmlContent: string): XmlChangeSet {
  try {
    // Validate XML against basic rules
    try {
      const isValid = validateXMLBasic(xmlContent);
      if (!isValid) {
        console.warn('XML document does not conform to the required schema, but will attempt to parse anyway');
      }
    } catch (validationError) {
      // If validation fails, log warning and continue
      console.warn(`XML schema validation skipped: ${validationError instanceof Error ? validationError.message : 'Unknown error'}`);
    }

    // Parse XML using DOM parser
    const parser = new DOMParser();
    const doc = parser.parseFromString(xmlContent, 'application/xml');
    
    // Check for parsing errors
    const parseErrors = doc.getElementsByTagName('parsererror');
    if (parseErrors.length > 0) {
      throw new Error(`XML parsing error: ${parseErrors[0].textContent}`);
    }
    
    // Get root element
    const changesElement = doc.documentElement;
    if (changesElement.nodeName !== 'changes') {
      throw new Error('Root element must be <changes>');
    }
    
    // Extract version
    const version = changesElement.getAttribute('version') || '1';
    
    // Extract meta if present
    let meta: string | undefined;
    const metaElements = changesElement.getElementsByTagName('meta');
    if (metaElements.length > 0) {
      meta = metaElements[0].textContent || undefined;
    }
    
    // Extract files
    const fileElements = changesElement.getElementsByTagName('file');
    const files: XmlFileChange[] = [];
    
    for (let i = 0; i < fileElements.length; i++) {
      const fileElement = fileElements[i];
      const path = fileElement.getAttribute('path');
      const action = fileElement.getAttribute('action') as 'create' | 'modify' | 'delete';
      
      if (!path || !action) {
        throw new Error('File element must have path and action attributes');
      }
      
      const fileChange: XmlFileChange = { path, action };
      
      // Extract operations if needed
      if (action !== 'delete') {
        const operationElements = fileElement.getElementsByTagName('operation');
        const operations: XmlOperation[] = [];
        
        for (let j = 0; j < operationElements.length; j++) {
          const operationElement = operationElements[j];
          const searchElements = operationElement.getElementsByTagName('search');
          const replaceElements = operationElement.getElementsByTagName('replace');
          
          if (searchElements.length === 0 || replaceElements.length === 0) {
            throw new Error('Operation must have search and replace elements');
          }
          
          const search = extractCDATAOrText(searchElements[0]);
          const replace = extractCDATAOrText(replaceElements[0]);
          
          // Validate regex pattern
          if (search) {
            validateRegexPattern(search, path);
          }
          
          operations.push({ search, replace });
        }
        
        fileChange.operations = operations;
      }
      
      // Extract meta if present
      const fileMeta = fileElement.getElementsByTagName('meta');
      if (fileMeta.length > 0) {
        fileChange.meta = fileMeta[0].textContent || undefined;
      }
      
      files.push(fileChange);
    }
    
    return { version, files, meta };
  } catch (error) {
    console.error('XML parsing error:', error);
    throw new Error(`Failed to parse XML: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Extract content from a node, handling CDATA sections
 */
function extractCDATAOrText(node: Element): string {
  // Check for CDATA sections
  for (let i = 0; i < node.childNodes.length; i++) {
    const child = node.childNodes[i];
    if (child.nodeType === 4) { // CDATA_SECTION_NODE
      return child.nodeValue || '';
    }
  }
  
  // Fall back to text content
  return node.textContent || '';
}

/**
 * Validate regex pattern for common issues
 */
function validateRegexPattern(pattern: string, filePath: string): void {
  if (!pattern) return; // Empty pattern for create operations is valid
  
  // Check for potential issues
  const issues: string[] = [];
  
  // Check for missing anchors (beginning and end)
  const hasStartAnchor = pattern.includes('^') || pattern.startsWith('\\b');
  const hasEndAnchor = pattern.includes('$') || pattern.endsWith('\\b');
  
  if (!hasStartAnchor && !hasEndAnchor) {
    issues.push('Pattern lacks anchors (^, $, \\b) which may cause unintended matches');
  }
  
  // Check for overly broad patterns
  if (pattern.includes('.*') && !pattern.includes('.*?')) {
    issues.push('Using greedy wildcard .* instead of non-greedy .*? may cause overmatching');
  }
  
  // Check for overly permissive character classes
  if (pattern.includes('.') && !pattern.includes('\\.')
      && !pattern.includes('[^') && !pattern.includes('.+?') && !pattern.includes('.*?')) {
    issues.push('Using dot (.) without restrictions may match too broadly');
  }
  
  // Check for pattern uniqueness (heuristic)
  const uniquenessScore = calculateUniquenessScore(pattern);
  if (uniquenessScore < 3) {
    issues.push('Pattern may not be specific enough to uniquely identify the target code block');
  }
  
  // Test compile the regex to catch syntax errors
  try {
    new RegExp(pattern, 'gms');
  } catch (error) {
    issues.push(`Invalid regex syntax: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
  
  // Log warnings but don't block execution
  if (issues.length > 0) {
    console.warn(`[Regex Validation] Potential issues in pattern for ${filePath}:`);
    issues.forEach(issue => console.warn(`  - ${issue}`));
    console.warn(`Pattern: ${pattern.substring(0, 100)}${pattern.length > 100 ? '...' : ''}`);
  }
}

/**
 * Calculate a heuristic score for pattern uniqueness
 */
function calculateUniquenessScore(pattern: string): number {
  let score = 0;
  
  // Specific anchors increase uniqueness
  if (pattern.includes('^') || pattern.includes('$')) score += 1;
  
  // Word boundaries increase uniqueness
  if (pattern.includes('\\b')) score += 1;
  
  // Specific character classes increase uniqueness
  if (pattern.includes('[') && pattern.includes(']')) score += 1;
  
  // Specific strings/identifiers increase uniqueness
  const identifierMatches = pattern.match(/\w{3,}/g);
  if (identifierMatches && identifierMatches.length > 0) {
    score += Math.min(identifierMatches.length, 3);
  }
  
  // Multiple lines increase uniqueness
  const newlineCount = (pattern.match(/\\n/g) || []).length;
  score += Math.min(newlineCount, 2);
  
  return score;
}

/**
 * Apply XML changes to project files with transaction support
 */
export async function applyXmlChanges(
  xmlChangeSet: XmlChangeSet, 
  projectDirectory: string,
  options = { dryRun: false }
): Promise<{ success: boolean; message: string; changes: string[] }> {
  const changes: string[] = [];
  const errors: string[] = [];
  const backups: BackupFile[] = [];
  let rollbackNeeded = false;
  
  try {
    // First pass - validate all operations and create backups
    for (const fileChange of xmlChangeSet.files) {
      const filePath = path.join(projectDirectory, fileChange.path);
      const normalizedPath = normalizePath(filePath);
      
      // Check if file exists
      let fileExists = false;
      try {
        await fs.access(filePath);
        fileExists = true;
      } catch (error) {
        fileExists = false;
      }
      
      // Handle different file actions
      if (fileChange.action === 'delete') {
        if (!fileExists) {
          errors.push(`Warning: Cannot delete ${fileChange.path} - file does not exist`);
          continue;
        }
        
        // Backup file content before deletion
        const content = await fs.readFile(filePath, 'utf-8');
        backups.push({ path: filePath, content });
      } else if (fileChange.action === 'create') {
        if (fileExists) {
          errors.push(`Warning: Cannot create ${fileChange.path} - file already exists`);
          continue;
        }
        
        // Mark as new file in backups
        backups.push({ path: filePath, content: null });
      } else if (fileChange.action === 'modify') {
        if (!fileExists) {
          errors.push(`Error: Cannot modify ${fileChange.path} - file does not exist`);
          continue;
        }
        
        // Backup file content before modification
        const content = await fs.readFile(filePath, 'utf-8');
        backups.push({ path: filePath, content });
        
        // Validate operations
        if (!fileChange.operations || fileChange.operations.length === 0) {
          errors.push(`Error: Invalid modify operation for ${fileChange.path} - no operations specified`);
          continue;
        }
      }
    }
    
    // Exit early for dry run
    if (options.dryRun) {
      return {
        success: errors.length === 0,
        message: 'Dry run completed',
        changes: [...changes, ...errors]
      };
    }
    
    // Second pass - apply changes
    for (const fileChange of xmlChangeSet.files) {
      const filePath = path.join(projectDirectory, fileChange.path);
      const normalizedPath = normalizePath(filePath);
      
      try {
        if (fileChange.action === 'delete') {
          // Delete file
          try {
            await fs.unlink(filePath);
            changes.push(`Deleted file: ${fileChange.path}`);
          } catch (error) {
            rollbackNeeded = true;
            errors.push(`Error deleting ${fileChange.path}: ${error instanceof Error ? error.message : 'Unknown error'}`);
          }
        } else if (fileChange.action === 'create') {
          // Create file
          if (!fileChange.operations || fileChange.operations.length !== 1) {
            rollbackNeeded = true;
            errors.push(`Invalid create operation for ${fileChange.path}: exactly one operation required`);
            continue;
          }
          
          const content = fileChange.operations[0].replace;
          try {
            await fs.mkdir(path.dirname(filePath), { recursive: true });
            await fs.writeFile(filePath, content);
            changes.push(`Created file: ${fileChange.path}`);
          } catch (error) {
            rollbackNeeded = true;
            errors.push(`Error creating ${fileChange.path}: ${error instanceof Error ? error.message : 'Unknown error'}`);
          }
        } else if (fileChange.action === 'modify') {
          // Skip if we already detected an error
          if (errors.some(err => err.includes(`Cannot modify ${fileChange.path}`))) {
            continue;
          }
          
          let content = await fs.readFile(filePath, 'utf-8');
          let operationsApplied = 0;
          
          for (const operation of fileChange.operations!) {
            try {
              const regex = new RegExp(operation.search, 'gms');
              const newContent = content.replace(regex, operation.replace);
              
              // Check if the content actually changed
              if (newContent === content) {
                errors.push(`Warning: Search pattern didn't match any content in ${fileChange.path}`);
              } else {
                content = newContent;
                operationsApplied++;
              }
            } catch (error) {
              rollbackNeeded = true;
              errors.push(`Error in regex for ${fileChange.path}: ${error instanceof Error ? error.message : 'Unknown error'}`);
            }
          }
          
          // Only write the file if changes were made
          if (operationsApplied > 0) {
            try {
              await fs.writeFile(filePath, content);
              changes.push(`Modified file: ${fileChange.path} (${operationsApplied}/${fileChange.operations!.length} operations applied)`);
            } catch (error) {
              rollbackNeeded = true;
              errors.push(`Error writing to ${fileChange.path}: ${error instanceof Error ? error.message : 'Unknown error'}`);
            }
          } else {
            errors.push(`Warning: No changes applied to ${fileChange.path}`);
          }
        }
      } catch (error) {
        rollbackNeeded = true;
        const errorMessage = `Error processing file ${fileChange.path}: ${error instanceof Error ? error.message : 'Unknown error'}`;
        console.error(errorMessage);
        errors.push(errorMessage);
      }
    }
    
    // Handle rollback if needed
    if (rollbackNeeded) {
      console.log('[XML Apply] Rolling back changes due to errors');
      await rollbackChanges(backups);
      errors.push('Changes were rolled back due to errors');
    }
    
    // Determine success based on whether essential changes were applied
    const success = changes.length > 0 && !rollbackNeeded;
    
    // Build a comprehensive message
    let message = '';
    if (success) {
      message += `Successfully applied ${changes.length} changes. `;
    } else {
      message += 'Failed to apply changes. ';
    }
    if (errors.length > 0) {
      message += `Encountered ${errors.length} issues.`;
    }
    
    return {
      success,
      message: message.trim(),
      changes: [...changes, ...errors], // Include both successful changes and errors in the changes list
    };
  } catch (error) {
    // Handle unexpected errors
    console.error('[XML Apply] Unexpected error:', error);
    
    // Attempt rollback
    if (backups.length > 0) {
      try {
        await rollbackChanges(backups);
        errors.push('Changes were rolled back due to unexpected error');
      } catch (rollbackError) {
        console.error('[XML Apply] Rollback failed:', rollbackError);
        errors.push('Failed to roll back changes after error');
      }
    }
    
    return {
      success: false,
      message: `Unexpected error: ${error instanceof Error ? error.message : 'Unknown error'}`,
      changes: errors,
    };
  }
}

/**
 * Roll back changes using backups
 */
async function rollbackChanges(backups: BackupFile[]): Promise<void> {
  for (const backup of backups) {
    try {
      if (backup.content === null) {
        // File was created, delete it
        try {
          await fs.access(backup.path);
          await fs.unlink(backup.path);
          console.log(`[Rollback] Deleted created file: ${backup.path}`);
        } catch (error) {
          // File doesn't exist, nothing to do
        }
      } else {
        // File was modified or deleted, restore it
        await fs.mkdir(path.dirname(backup.path), { recursive: true });
        await fs.writeFile(backup.path, backup.content);
        console.log(`[Rollback] Restored file: ${backup.path}`);
      }
    } catch (error) {
      console.error(`[Rollback] Failed to restore ${backup.path}:`, error);
    }
  }
} 