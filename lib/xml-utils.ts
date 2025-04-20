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
  validationErrors?: string[];
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
function validateXMLBasic(xmlContent: string): { isValid: boolean; errors: string[] } {
  const errors: string[] = [];
  
  try {
    // Use the DOM parser for basic validation
    const parser = new DOMParser({
      errorHandler: {
        warning: (msg) => { 
          console.warn('[XML Validation] Warning:', msg);
          errors.push(`XML Warning: ${msg}`);
        },
        error: (msg) => { 
          errors.push(`XML Error: ${msg}`);
          throw new Error(msg); 
        },
        fatalError: (msg) => { 
          errors.push(`XML Fatal Error: ${msg}`);
          throw new Error(msg); 
        }
      }
    });
    
    const doc = parser.parseFromString(xmlContent, 'application/xml');
    
    // Check for parsing errors
    const parseErrors = doc.getElementsByTagName('parsererror');
    if (parseErrors.length > 0) {
      const parseErrorText = parseErrors[0].textContent || 'Unknown parsing error';
      errors.push(`XML Parse Error: ${parseErrorText}`);
      return { isValid: false, errors };
    }
    
    // Validate root element
    const root = doc.documentElement;
    if (root.nodeName !== 'changes') {
      errors.push(`XML Structure Error: Root element must be <changes>, found <${root.nodeName}>`);
      return { isValid: false, errors };
    }
    
    // Validate version attribute
    const version = root.getAttribute('version');
    if (!version || !/^\d+$/.test(version)) {
      errors.push(`XML Attribute Error: Missing or invalid version attribute on root element`);
      return { isValid: false, errors };
    }
    
    // Basic validation of file elements
    const fileElements = root.getElementsByTagName('file');
    if (fileElements.length === 0) {
      errors.push(`XML Structure Error: No <file> elements found`);
      return { isValid: false, errors };
    }
    
    for (let i = 0; i < fileElements.length; i++) {
      const fileEl = fileElements[i];
      const filePath = fileEl.getAttribute('path');
      const action = fileEl.getAttribute('action');
      
      if (!filePath) {
        errors.push(`XML Attribute Error: Missing path attribute on file element #${i+1}`);
        return { isValid: false, errors };
      }
      
      if (!action) {
        errors.push(`XML Attribute Error: Missing action attribute on file element for path "${filePath}"`);
        return { isValid: false, errors };
      }
      
      if (action !== 'create' && action !== 'modify' && action !== 'delete') {
        errors.push(`XML Value Error: Invalid action "${action}" on file element for path "${filePath}". Must be create, modify, or delete`);
        return { isValid: false, errors };
      }
      
      // For create/modify, validate operations
      if (action !== 'delete') {
        const operationElements = fileEl.getElementsByTagName('operation');
        
        if (operationElements.length === 0) {
          errors.push(`XML Structure Error: No <operation> elements found for ${action} action on path "${filePath}"`);
          return { isValid: false, errors };
        }
        
        for (let j = 0; j < operationElements.length; j++) {
          const opEl = operationElements[j];
          const searchEls = opEl.getElementsByTagName('search');
          const replaceEls = opEl.getElementsByTagName('replace');
          
          if (searchEls.length !== 1) {
            errors.push(`XML Structure Error: ${searchEls.length === 0 ? 'Missing' : 'Multiple'} <search> element in operation #${j+1} for path "${filePath}"`);
            return { isValid: false, errors };
          }
          
          if (replaceEls.length !== 1) {
            errors.push(`XML Structure Error: ${replaceEls.length === 0 ? 'Missing' : 'Multiple'} <replace> element in operation #${j+1} for path "${filePath}"`);
            return { isValid: false, errors };
          }
        }
      }
    }
    
    return { isValid: true, errors };
  } catch (error) {
    console.error('[XML Validation] Error:', error);
    errors.push(`XML Validation Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    return { isValid: false, errors };
  }
}

/**
 * Attempts to fix common regex pattern issues
 * This function tries to correct issues with special characters, template literals, and unbalanced groups
 */
export function fixRegexPattern(pattern: string): { fixed: string; modifications: string[] } {
  const modifications: string[] = [];
  let fixed = pattern;

  // Check for unbalanced parentheses
  const openParens = (pattern.match(/\(/g) || []).length - (pattern.match(/\\\(/g) || []).length;
  const closeParens = (pattern.match(/\)/g) || []).length - (pattern.match(/\\\)/g) || []).length;
  
  if (openParens > closeParens) {
    // Add missing closing parentheses
    fixed = fixed + ')'.repeat(openParens - closeParens);
    modifications.push(`Added ${openParens - closeParens} missing closing parentheses`);
  }
  
  // Check for unbalanced curly braces
  const openCurly = (pattern.match(/\{/g) || []).length - (pattern.match(/\\\{/g) || []).length;
  const closeCurly = (pattern.match(/\}/g) || []).length - (pattern.match(/\\\}/g) || []).length;
  
  if (openCurly > closeCurly) {
    // Add missing closing curly braces
    fixed = fixed + '}'.repeat(openCurly - closeCurly);
    modifications.push(`Added ${openCurly - closeCurly} missing closing curly braces`);
  }
  
  // Check for unbalanced square brackets
  const openBrackets = (pattern.match(/\[/g) || []).length - (pattern.match(/\\\[/g) || []).length;
  const closeBrackets = (pattern.match(/\]/g) || []).length - (pattern.match(/\\\]/g) || []).length;
  
  if (openBrackets > closeBrackets) {
    // Add missing closing square brackets
    fixed = fixed + ']'.repeat(openBrackets - closeBrackets);
    modifications.push(`Added ${openBrackets - closeBrackets} missing closing square brackets`);
  }

  // Fix issues with template literals (${...})
  // This is a common issue in JavaScript/TypeScript regex patterns
  const templateLiteralMatches = fixed.match(/\$\{(?:[^{}]|(?:\{[^{}]*\}))*(?!\})/g);
  if (templateLiteralMatches) {
    let tempFixed = fixed;
    for (const match of templateLiteralMatches) {
      // Add a closing brace to the template literal
      const fixedMatch = match + '}';
      tempFixed = tempFixed.replace(match, fixedMatch);
      modifications.push(`Fixed unclosed template literal: ${match.substring(0, 20)}...`);
    }
    fixed = tempFixed;
  }

  // Handle invalid regex with complex patterns that might cause issues
  if (fixed.includes('async (') || fixed.includes('Promise<') || fixed.includes('=>')) {
    // These are likely code snippets rather than real regex patterns
    // Let's make them more literal by escaping special characters
    const specialChars = /[.*+?^${}()|[\]\\]/g;
    fixed = fixed.replace(specialChars, '\\$&');
    modifications.push('Escaped special regex characters in code snippet');
  }

  // Escape dollar signs that aren't part of template literals
  if (fixed.includes('$') && !fixed.includes('\\$') && fixed.includes('${')) {
    const escapedFixed = fixed.replace(/\$(?!\{)/g, '\\$');
    if (escapedFixed !== fixed) {
      fixed = escapedFixed;
      modifications.push('Escaped standalone dollar signs');
    }
  }

  // Ensure the regex pattern is not excessively long (which could cause performance issues)
  if (fixed.length > 5000) {
    fixed = fixed.substring(0, 5000);
    modifications.push('Truncated excessively long pattern to prevent performance issues');
  }

  return { fixed, modifications };
}

/**
 * Validate regex pattern for common issues
 */
function validateRegexPattern(pattern: string, filePath: string, fileContent?: string): { fixedPattern: string; issues: string[]; regex?: RegExp } {
  if (!pattern) return { fixedPattern: pattern, issues: [] }; // Empty pattern for create operations is valid
  
  // Check for potential issues
  const issues: string[] = [];
  
  // Attempt to fix common regex issues
  const { fixed, modifications } = fixRegexPattern(pattern);
  let fixedPattern = pattern;
  
  if (modifications.length > 0) {
    console.warn(`[Regex Fixer] Applied ${modifications.length} fixes to regex in ${filePath}:`);
    modifications.forEach(mod => console.warn(`  - ${mod}`));
    fixedPattern = fixed;
    // We'll try the fixed pattern but keep a record of the issues
    issues.push(`Pattern required automatic fixes: ${modifications.join(', ')}`);
  }
  
  // Test if the pattern looks like a code snippet rather than a regex
  if (fixedPattern.includes('function') || fixedPattern.includes('class ') || 
      fixedPattern.includes('import ') || fixedPattern.includes('export ')) {
    issues.push('Pattern looks like a code snippet, may cause unintended matches');
  }
  
  // Test compile the regex to catch syntax errors
  let regex;
  try {
    // For problematic patterns, attempt to use a more lenient approach
    if (issues.some(issue => issue.includes('code snippet'))) {
      // Use a fallback strategy for code snippets - convert them to literal strings
      try {
        const escapedPattern = fixedPattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        regex = new RegExp(escapedPattern, 'gms');
        fixedPattern = escapedPattern;
        issues.push('Converted code snippet to literal string pattern');
      } catch (innerError) {
        // If even that fails, use a very simple fallback
        const safePattern = fixedPattern
          .replace(/\\/g, '\\\\')
          .replace(/\//g, '\\/');
        try {
          regex = new RegExp(safePattern, 'gms');
          fixedPattern = safePattern;
          issues.push('Used safe fallback pattern conversion');
        } catch (finalError) {
          throw finalError; // If all fallbacks fail, propagate the error
        }
      }
    } else {
      // Normal case - try with the fixed pattern
      regex = new RegExp(fixedPattern, 'gms');
    }
    
    // Test with file content if provided
    if (regex && fileContent) {
      try {
        const matches = fileContent.match(regex);
        if (!matches || matches.length === 0) {
          issues.push('Pattern does not match anything in the file');
        } else if (matches.length > 3) {
          issues.push(`Pattern matches ${matches.length} locations in the file, which may cause unintended changes`);
        }
      } catch (matchError) {
        issues.push(`Error testing pattern against file content: ${matchError instanceof Error ? matchError.message : 'Unknown error'}`);
      }
    }
  } catch (error) {
    // Provide a more detailed error message for regex syntax errors
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    const detailedError = `Invalid regex syntax in ${filePath}: ${errorMessage}`;
    issues.push(`Invalid regex syntax: ${errorMessage}`);
    console.error(`[Regex Validation] Critical error:`, error);
    
    // For regex errors, try to locate the problematic part of the pattern
    if (error instanceof SyntaxError && errorMessage.includes('at position')) {
      const posMatch = errorMessage.match(/at position (\d+)/);
      if (posMatch && posMatch[1]) {
        const pos = parseInt(posMatch[1], 10);
        const start = Math.max(0, pos - 20);
        const end = Math.min(fixedPattern.length, pos + 20);
        const snippet = fixedPattern.substring(start, end);
        const pointer = ' '.repeat(Math.min(20, pos - start)) + '^';
        console.error(`Pattern snippet: ${snippet}\n${pointer}`);
        issues.push(`Error location: ...${snippet}...`);
      }
    }
    
    // If there's a syntax error, try to provide a safer fallback pattern
    try {
      // Convert to a plain text literal search
      const escapedPattern = fixedPattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      regex = new RegExp(escapedPattern, 'gms');
      fixedPattern = escapedPattern;
      issues.push('Used safe fallback pattern after syntax error');
    } catch (fallbackError) {
      // Last resort - provide a pattern that will never match anything
      fixedPattern = '\\b\\B'; // This will never match (word boundary + non-word boundary)
      issues.push('Used non-matching placeholder pattern as last resort');
    }
  }
  
  // Check for common issues even if regex compiled successfully
  if (!issues.some(issue => issue.includes('Invalid regex syntax'))) {
    if (!fixedPattern.startsWith('^') && !fixedPattern.startsWith('\\b') && !fixedPattern.includes('\\b')) {
      issues.push('Pattern lacks anchors (^, $, \\b) which may cause unintended matches');
    }
    
    if (fixedPattern.includes('.') && !fixedPattern.includes('\\n') && !fixedPattern.includes('[^')) {
      issues.push('Using dot (.) without restrictions may match too broadly');
    }
    
    if (fixedPattern.includes('(') && !fixedPattern.includes('(?:')) {
      issues.push('Using capturing groups instead of non-capturing (?:...) groups may lead to replacement issues');
    }
  }
  
  return { fixedPattern, issues, regex };
}

/**
 * Strip markdown code blocks from XML content
 * This helps handle AI-generated responses that might wrap XML in ```xml and ``` markers
 */
function stripMarkdownCodeBlocks(content: string): string {
  // Quick check if content is already valid XML
  const trimmedContent = content.trim();
  if (trimmedContent.startsWith('<?xml') && !trimmedContent.includes('```')) {
    return trimmedContent; // Already valid XML, no need to process
  }
  
  // First try exact match for the full content
  const exactCodeBlockRegex = /^```(?:xml)?\s*([\s\S]*?)\s*```$/;
  const exactMatch = trimmedContent.match(exactCodeBlockRegex);
  
  if (exactMatch && exactMatch[1]) {
    return exactMatch[1].trim();
  }
  
  // If that fails, search for code blocks that might be embedded in text
  const embeddedCodeBlockRegex = /```(?:xml)?\s*([\s\S]*?)\s*```/;
  const embeddedMatch = content.match(embeddedCodeBlockRegex);
  
  if (embeddedMatch && embeddedMatch[1]) {
    // Check if the extracted content starts with <?xml
    const extracted = embeddedMatch[1].trim();
    if (extracted.startsWith('<?xml')) {
      console.warn('[XML Parse] Found and extracted XML from markdown code block');
      return extracted;
    }
  }
  
  // As a last resort, try to find <?xml ... > and extract from there
  const xmlDeclarationRegex = /(<\?xml[^>]*>[\s\S]*)/i;
  const xmlMatch = content.match(xmlDeclarationRegex);
  
  if (xmlMatch && xmlMatch[1]) {
    console.warn('[XML Parse] Extracted XML starting from XML declaration');
    return xmlMatch[1].trim();
  }
  
  return content;
}

/**
 * Parse XML changes document using a proper XML parser
 */
export function parseXmlChanges(xmlContent: string): XmlChangeSet {
  try {
    // Check if content might contain markdown code blocks
    if (xmlContent.includes('```')) {
      console.log('[XML Parse] Detected possible markdown code blocks in XML content');
      const originalLength = xmlContent.length;
      
      // Strip any markdown code blocks from the content
      xmlContent = stripMarkdownCodeBlocks(xmlContent);
      
      const newLength = xmlContent.length;
      if (originalLength !== newLength) {
        console.log(`[XML Parse] Stripped markdown code blocks: ${originalLength} -> ${newLength} characters`);
      }
    }
    
    // Validate XML against basic rules
    let validationErrors: string[] = [];
    try {
      const validation = validateXMLBasic(xmlContent);
      if (!validation.isValid) {
        validationErrors = validation.errors;
        console.warn('XML document does not conform to the required schema, but will attempt to parse anyway:');
        validation.errors.forEach(err => console.warn(`  - ${err}`));
      }
    } catch (validationError) {
      // If validation fails, log warning and continue
      const errorMessage = validationError instanceof Error ? validationError.message : 'Unknown error';
      validationErrors.push(`XML validation error: ${errorMessage}`);
      console.warn(`XML schema validation skipped: ${errorMessage}`);
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
          
          let search = extractCDATAOrText(searchElements[0]);
          const replace = extractCDATAOrText(replaceElements[0]);
          
          // Attempt to fix and validate the regex pattern
          try {
            // First try to fix the pattern if needed
            const { fixed, modifications } = fixRegexPattern(search);
            if (modifications.length > 0) {
              console.warn(`[Regex Fixer] Applied ${modifications.length} automatic fixes to regex in operation #${j+1} for ${path}:`);
              modifications.forEach(mod => console.warn(`  - ${mod}`));
              search = fixed;
            }
            
            // Then validate the fixed pattern
            const result = validateRegexPattern(search, path);
            search = result.fixedPattern; // Use the potentially fixed pattern
            
            if (result.issues.length > 0) {
              console.warn(`[Regex Validation] Issues in operation #${j+1} for ${path}:`);
              result.issues.forEach(issue => console.warn(`  - ${issue}`));
            }
          } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'Unknown error';
            console.error(`[Regex Validation] Failed for operation #${j+1} in ${path}: ${errorMessage}`);
            
            // Add detailed error to validationErrors
            if (!validationErrors) validationErrors = [];
            validationErrors.push(`Regex error in ${path} (operation #${j+1}): ${errorMessage}`);
            
            // We'll continue with the original pattern, but log the warning
            console.warn(`Using original pattern despite validation errors for ${path}`);
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
    
    // If we reach the end without throwing errors, we still want to keep track of validation errors
    if (validationErrors.length > 0) {
      console.warn(`[XML Parse] Completed with ${validationErrors.length} validation warnings`);
    }
    
    return { version, files, meta, validationErrors };
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
 * Apply XML change operations to file content
 * This is the core function that processes each operation in an XML change
 */
export function applyXmlChanges(
  fileContent: string,
  operations: XmlOperation[],
  filePath: string
): { content: string; changes: string[] } {
  let updatedContent = fileContent;
  const changes: string[] = [];
  const originalLength = fileContent.length;
  
  for (let i = 0; i < operations.length; i++) {
    const op = operations[i];
    
    // Skip empty operations
    if (!op.search && !op.replace) {
      changes.push(`Warning: Operation #${i + 1} has empty search and replace patterns. Skipping.`);
      continue;
    }
    
    console.log(`[XML Apply] Processing operation #${i + 1} for ${filePath}`);
    
    // Get the original length before making any changes for this operation
    const beforeOpLength = updatedContent.length;
    
    try {
      // For empty search (create operations), simply use the replace content
      if (!op.search || op.search.trim() === '') {
        if (i === 0) { // Only do this for the first operation in create mode
          updatedContent = op.replace;
          changes.push(`Created file with ${op.replace.length} characters`);
        } else {
          changes.push(`Warning: Empty search pattern for operation #${i + 1}. Multiple empty search patterns not supported for file creation.`);
        }
        continue;
      }
      
      // Attempt to match using different strategies
      let matchFound = false;
      let originalMatches = 0;
      
      // Strategy 1: Exact text matching
      if (updatedContent.includes(op.search)) {
        originalMatches = countOccurrences(updatedContent, op.search);
        console.log(`[XML Apply] Found ${originalMatches} exact matches for operation #${i + 1} in ${filePath}`);
        updatedContent = safePlainTextReplace(updatedContent, op.search, op.replace);
        changes.push(`Applied search/replace operation #${i + 1} (exact match - ${originalMatches} occurrences)`);
        matchFound = true;
      } 
      // Strategy 2: Normalize line endings
      else {
        const normalizedSearch = op.search.replace(/\r\n/g, '\n');
        const normalizedContent = updatedContent.replace(/\r\n/g, '\n');
        
        if (normalizedContent.includes(normalizedSearch)) {
          originalMatches = countOccurrences(normalizedContent, normalizedSearch);
          console.log(`[XML Apply] Found ${originalMatches} normalized line ending matches for operation #${i + 1} in ${filePath}`);
          
          // Need to replace in the normalized content then convert back
          const normalizedReplacement = op.replace.replace(/\r\n/g, '\n');
          const normalizedResult = safePlainTextReplace(normalizedContent, normalizedSearch, normalizedReplacement);
          
          // Use the normalized result
          updatedContent = normalizedResult;
          changes.push(`Applied search/replace operation #${i + 1} (normalized line endings - ${originalMatches} occurrences)`);
          matchFound = true;
        }
        // Strategy 3: Try with whitespace normalization for very specific cases
        else if (op.search.length < 1000 && op.search.trim().length > 20) {
          // Only try whitespace normalization for reasonably sized search patterns
          const result = tryWhitespaceNormalizedReplace(updatedContent, op.search, op.replace);
          if (result.replaced) {
            updatedContent = result.content;
            changes.push(`Applied search/replace operation #${i + 1} (whitespace normalized - ${result.matches} occurrences)`);
            matchFound = true;
          }
        }
      }
      
      // Fallback strategy: Try as regex if it looks like a regex pattern
      if (!matchFound && looksLikeRegexPattern(op.search)) {
        try {
          const { pattern, flags } = parseRegexPattern(op.search);
          const regex = new RegExp(pattern, flags + 'g');
          
          // Test if regex matches
          const matches = updatedContent.match(regex);
          if (matches && matches.length > 0) {
            console.log(`[XML Apply] Found ${matches.length} regex matches for operation #${i + 1} in ${filePath}`);
            updatedContent = updatedContent.replace(regex, op.replace);
            changes.push(`Applied search/replace operation #${i + 1} (regex mode - ${matches.length} occurrences)`);
            matchFound = true;
          }
        } catch (regexError) {
          console.error(`[XML Apply] Regex error for operation #${i + 1} in ${filePath}:`, regexError);
          changes.push(`Warning: Operation #${i + 1} pattern looks like regex but failed: ${regexError instanceof Error ? regexError.message : 'Unknown regex error'}`);
        }
      }
      
      // If all strategies failed, fallback to plain text replacement as last resort
      if (!matchFound) {
        console.warn(`[XML Apply] No matches found for operation #${i + 1} in ${filePath}. Pattern length: ${op.search.length} chars.`);
        
        // Log diagnostics to help troubleshoot matching issues
        const searchSample = op.search.length > 200 
          ? op.search.substring(0, 100) + '...' + op.search.substring(op.search.length - 100) 
          : op.search;
        console.log(`[XML Apply] Search pattern sample: ${searchSample.replace(/\r?\n/g, '\\n')}`);
        
        // Try plain text replacement anyway as a fallback
        const beforeFallback = updatedContent;
        updatedContent = safePlainTextReplace(updatedContent, op.search, op.replace);
        
        // Check if anything changed
        if (beforeFallback !== updatedContent) {
          changes.push(`Applied search/replace operation #${i + 1} (fallback mode - check results carefully)`);
        } else {
          changes.push(`Warning: Could not apply operation #${i + 1} - pattern not found in ${filePath}`);
          
          // Additional diagnostics
          if (op.search.length > 1000) {
            changes.push(`Warning: Search pattern for operation #${i + 1} is very long (${op.search.length} chars) which increases the risk of mismatch.`);
          }
        }
      }
      
      // Check if this operation actually changed anything
      if (beforeOpLength === updatedContent.length && matchFound) {
        changes.push(`Note: Operation #${i + 1} was applied but did not change the content length.`);
      }
    } catch (error) {
      console.error(`[XML Apply] Error applying operation #${i + 1} to ${filePath}:`, error);
      changes.push(`Error in operation #${i + 1}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
  
  // Add summary of changes
  const totalCharsChanged = updatedContent.length - originalLength;
  changes.push(`Total change: ${Math.abs(totalCharsChanged)} characters ${totalCharsChanged >= 0 ? 'added' : 'removed'}`);
  
  return { content: updatedContent, changes };
}

/**
 * Replace text safely, handling multi-line text and multiple occurrences
 */
export function safePlainTextReplace(
  content: string,
  search: string,
  replace: string
): string {
  if (!search) return content;
  
  try {
    // Handle multi-line strings correctly by avoiding regex issues
    return content.split(search).join(replace);
  } catch (error) {
    console.error('[XML Utils] Error in safePlainTextReplace:', error);
    // Fallback to single replacement if join fails
    return content.replace(search, replace);
  }
}

/**
 * Count occurrences of a substring in a string
 */
function countOccurrences(str: string, substr: string): number {
  if (!substr) return 0;
  
  let count = 0;
  let pos = str.indexOf(substr);
  
  while (pos !== -1) {
    count++;
    pos = str.indexOf(substr, pos + 1);
  }
  
  return count;
}

/**
 * Check if a pattern looks like it was intended as a regex
 */
function looksLikeRegexPattern(pattern: string): boolean {
  // Check for common regex special characters and surrounding patterns
  return /^\/.*\/[gimsuy]*$/.test(pattern) || // Looks like /pattern/flags
         /\\d|\\w|\\s|\[\^?.*?\]|\(\?:|\(\?!|\(\?=|\\b|^\^|\$$/.test(pattern); // Contains regex special sequences
}

/**
 * Try to parse a string that might be a regex with flags
 */
function parseRegexPattern(pattern: string): { pattern: string, flags: string } {
  // Check if the pattern is wrapped in forward slashes with possible flags
  const regexMatch = /^\/(.*)\/([gimsuy]*)$/.exec(pattern);
  
  if (regexMatch) {
    return {
      pattern: regexMatch[1],
      flags: regexMatch[2] || 'ms' // Default to multiline and dotall
    };
  }
  
  // If not wrapped, assume it's a pattern that needs escaping
  return {
    pattern: escapeRegExp(pattern),
    flags: 'ms' // Default to multiline and dotall
  };
}

/**
 * Escape special regex characters in a string
 */
function escapeRegExp(string: string): string {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Try to replace with whitespace normalization
 * This is for cases where indentation might be different
 */
function tryWhitespaceNormalizedReplace(content: string, search: string, replace: string): { 
  content: string; 
  replaced: boolean;
  matches: number;
} {
  try {
    // Normalize search and content for comparison
    const normalizedSearch = search.replace(/\s+/g, ' ').trim();
    
    // Split into lines to check each potential match location
    let contentLines = content.split('\n');
    let matchLocations: { start: number, end: number }[] = [];
    
    // Look for potential matches using line-by-line comparison
    for (let i = 0; i < contentLines.length; i++) {
      // Try to match a block starting at this line
      const potentialMatchLines = contentLines.slice(i, i + search.split('\n').length);
      const potentialMatch = potentialMatchLines.join('\n');
      
      if (potentialMatch.replace(/\s+/g, ' ').trim() === normalizedSearch) {
        matchLocations.push({ start: i, end: i + potentialMatchLines.length - 1 });
      }
    }
    
    // If we found matches, apply the replacements from bottom to top
    // (to avoid changing line numbers for subsequent replacements)
    if (matchLocations.length > 0) {
      console.log(`[XML Apply] Found ${matchLocations.length} whitespace-normalized matches`);
      
      // Sort in reverse order by start line
      matchLocations.sort((a, b) => b.start - a.start);
      
      // Replace each match
      for (const loc of matchLocations) {
        const beforeLines = contentLines.slice(0, loc.start);
        const afterLines = contentLines.slice(loc.end + 1);
        const replacementLines = replace.split('\n');
        
        contentLines = [...beforeLines, ...replacementLines, ...afterLines];
      }
      
      return {
        content: contentLines.join('\n'),
        replaced: true,
        matches: matchLocations.length
      };
    }
    
    return { content, replaced: false, matches: 0 };
  } catch (error) {
    console.error('[XML Apply] Error in whitespace normalized replace:', error);
    return { content, replaced: false, matches: 0 };
  }
} 