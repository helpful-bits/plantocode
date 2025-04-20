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
 * Alternative processing for patterns that cannot be safely converted to regex
 * @param content File content to modify
 * @param searchText Text to search for
 * @param replaceText Text to replace with
 */
function safePlainTextReplace(content: string, searchText: string, replaceText: string): string {
  // Simple string replacement without regex
  if (!searchText || content.indexOf(searchText) === -1) {
    // No matches - try normalizing line endings in case that's the issue
    const normalizedSearch = searchText.replace(/\r\n/g, '\n');
    const normalizedContent = content.replace(/\r\n/g, '\n');
    
    if (normalizedContent.indexOf(normalizedSearch) === -1) {
      return content; // Still no match
    }
    
    // We found a match with normalized line endings
    return normalizedContent.split(normalizedSearch).join(replaceText);
  }
  
  // For larger strings, we'll use a more efficient approach than split/join
  // which can lead to memory issues with very large files
  if (content.length > 1000000) { // 1MB threshold
    console.log('[XML Apply] Using efficient chunked replacement for large file');
    let result = '';
    let lastIndex = 0;
    let currentIndex = content.indexOf(searchText);
    
    while (currentIndex !== -1) {
      // Add the content up to the match
      result += content.substring(lastIndex, currentIndex);
      // Add the replacement
      result += replaceText;
      // Move past this match
      lastIndex = currentIndex + searchText.length;
      // Find the next match
      currentIndex = content.indexOf(searchText, lastIndex);
    }
    
    // Add the remaining content
    result += content.substring(lastIndex);
    return result;
  }
  
  // For smaller files, split/join is fine
  return content.split(searchText).join(replaceText);
}

/**
 * Modified XML processing approach that prioritizes exact text matching
 * This replaces the regex-first approach with a text-first approach
 * 
 * @param content File content to modify
 * @param searchText Original search text from XML
 * @param replaceText Replacement text
 * @param filePath Path for logging purposes
 */
function processXmlChange(
  content: string, 
  searchText: string, 
  replaceText: string, 
  filePath: string
): { newContent: string; matched: boolean; method: string } {
  // Step 1: Try direct text replacement first (most reliable)
  if (content.includes(searchText)) {
    console.log(`[XML Apply] Using exact text match replacement for ${filePath}`);
    return {
      newContent: safePlainTextReplace(content, searchText, replaceText),
      matched: true,
      method: 'exact-text'
    };
  }
  
  // Step 2: Try with normalized line endings
  const normalizedSearch = searchText.replace(/\r\n/g, '\n');
  const normalizedContent = content.replace(/\r\n/g, '\n');
  
  if (normalizedContent.includes(normalizedSearch)) {
    console.log(`[XML Apply] Using normalized line endings text match for ${filePath}`);
    return {
      newContent: normalizedContent.replace(normalizedSearch, replaceText),
      matched: true, 
      method: 'normalized-text'
    };
  }
  
  // Step 3: Try with whitespace normalization (helps with indentation differences)
  const normalizedWhitespaceSearch = normalizedSearch.replace(/\s+/g, ' ').trim();
  const contentLines = normalizedContent.split('\n');
  
  for (let i = 0; i < contentLines.length; i++) {
    const line = contentLines[i];
    const normalizedLine = line.replace(/\s+/g, ' ').trim();
    
    if (normalizedLine === normalizedWhitespaceSearch || 
        normalizedWhitespaceSearch.includes(normalizedLine)) {
      // Found a likely match with normalized whitespace
      const contextLines = contentLines.slice(Math.max(0, i - 5), Math.min(contentLines.length, i + 5)).join('\n');
      console.log(`[XML Apply] Found potential whitespace-normalized match at line ${i+1} in ${filePath}`);
      
      // Try to extract the actual context with proper whitespace
      const startIndex = normalizedContent.indexOf(contextLines);
      if (startIndex >= 0) {
        const contextWithProperWhitespace = normalizedContent.substring(startIndex, startIndex + contextLines.length);
        const newContextWithReplacement = contextWithProperWhitespace.replace(line, replaceText);
        
        return {
          newContent: normalizedContent.replace(contextWithProperWhitespace, newContextWithReplacement),
          matched: true,
          method: 'whitespace-normalized'
        };
      }
    }
  }
  
  // Step 4: Only as a last resort, try regex
  try {
    // First check if it looks like a regex pattern
    const isLikelyRegex = /[.*+?^${}()|[\]\\]/.test(searchText) && 
                         !searchText.includes('function') && 
                         !searchText.includes('import ') && 
                         !searchText.includes('export ');
    
    if (isLikelyRegex) {
      // Fix and compile the regex
      const { fixed, modifications } = fixRegexPattern(searchText);
      if (modifications.length > 0) {
        console.log(`[XML Apply] Fixed regex pattern for ${filePath}:`);
        modifications.forEach(mod => console.log(`  - ${mod}`));
      }
      
      // Try the regex
      const regex = new RegExp(fixed, 'gms');
      const matches = content.match(regex);
      
      if (matches && matches.length > 0) {
        console.log(`[XML Apply] Using regex replacement for ${filePath} (${matches.length} matches)`);
        return {
          newContent: content.replace(regex, replaceText),
          matched: true,
          method: 'regex'
        };
      }
    }
  } catch (error) {
    console.warn(`[XML Apply] Regex approach failed for ${filePath}: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
  
  // No matches found with any method
  return {
    newContent: content,
    matched: false,
    method: 'none'
  };
}

/**
 * Apply XML changes to project files with transaction support
 */
export async function applyXmlChanges(
  xmlChangeSet: XmlChangeSet, 
  projectDirectory: string,
  options = { dryRun: false }
): Promise<{ success: boolean; message: string; changes: string[]; issues: string[] }> {
  const changes: string[] = [];
  const errors: string[] = [];
  const warnings: string[] = [];
  const backups: BackupFile[] = [];
  let rollbackNeeded = false;
  
  // Add any validation errors from the XML parsing stage
  if (xmlChangeSet.validationErrors && xmlChangeSet.validationErrors.length > 0) {
    xmlChangeSet.validationErrors.forEach(err => warnings.push(`XML Validation: ${err}`));
  }
  
  try {
    // First pass - check that files exist/don't exist as appropriate and validate operations
    for (const fileChange of xmlChangeSet.files) {
      const filePath = path.join(projectDirectory, fileChange.path);
      const normalizedPath = normalizePath(filePath);
      
      let fileExists = false;
      let fileContent: string | null = null;
      
      try {
        // Check if file exists
        await fs.access(filePath);
        fileExists = true;
        
        // Read file content for validation
        fileContent = await fs.readFile(filePath, 'utf-8');
      } catch (error) {
        fileExists = false;
      }
      
      // Validate based on action type
      if (fileChange.action === 'delete' && !fileExists) {
        warnings.push(`Warning: Cannot delete ${fileChange.path} - file does not exist`);
        continue;
      }
      
      if (fileChange.action === 'create' && fileExists) {
        warnings.push(`Warning: Cannot create ${fileChange.path} - file already exists`);
        continue;
      }
      
      if (fileChange.action === 'modify' && !fileExists) {
        errors.push(`Error: Cannot modify ${fileChange.path} - file does not exist`);
        continue;
      }
      
      // For modify operations, validate regexes
      if (fileChange.action === 'modify' && fileContent !== null) {
        // Backup file content before modification
        backups.push({ path: filePath, content: fileContent! });
        
        // Validate operations
        if (!fileChange.operations || fileChange.operations.length === 0) {
          errors.push(`Error: Invalid modify operation for ${fileChange.path} - no operations specified`);
          continue;
        }
        
        // Pre-validate all regex patterns against the actual file content
        let hasValidOperation = false;
        for (const operation of fileChange.operations) {
          try {
            // First, try to fix the pattern
            const { fixed, modifications } = fixRegexPattern(operation.search);
            if (modifications.length > 0) {
              console.warn(`[Regex Fixer] Applied ${modifications.length} fixes to regex in ${fileChange.path}`);
              modifications.forEach(mod => console.warn(`  - ${mod}`));
              operation.search = fixed;
            }
            
            // Then validate the pattern
            const result = validateRegexPattern(operation.search, fileChange.path, fileContent);
            operation.search = result.fixedPattern; // Use the fixed pattern
            hasValidOperation = true;
          } catch (error) {
            errors.push(`Error in regex for ${fileChange.path}: ${error instanceof Error ? error.message : 'Unknown error'}`);
          }
        }
        
        if (!hasValidOperation && fileChange.operations.length > 0) {
          errors.push(`Error: No valid operations for ${fileChange.path}`);
        }
      }
    }
    
    // Exit early for dry run or if there are critical errors
    if (options.dryRun || errors.length > 0) {
      let errorDetails = '';
      if (errors.length > 0) {
        errorDetails = `\n- ${errors.join('\n- ')}`;
      }
      
      return {
        success: errors.length === 0,
        message: options.dryRun ? 'Dry run completed' : `Validation failed: ${errorDetails}`,
        changes,
        issues: [...errors, ...warnings]
      };
    }
    
    // Second pass - apply changes
    for (const fileChange of xmlChangeSet.files) {
      const filePath = path.join(projectDirectory, fileChange.path);
      const normalizedPath = normalizePath(filePath);
      
      try {
        if (fileChange.action === 'delete') {
          // Skip if file doesn't exist (already warned)
          if (warnings.some(warning => warning.includes(`Cannot delete ${fileChange.path}`))) {
            continue;
          }
          
          // Delete file
          try {
            await fs.unlink(filePath);
            changes.push(`Deleted file: ${fileChange.path}`);
          } catch (error) {
            rollbackNeeded = true;
            errors.push(`Error deleting ${fileChange.path}: ${error instanceof Error ? error.message : 'Unknown error'}`);
          }
        } else if (fileChange.action === 'create') {
          // Skip if file already exists (already warned)
          if (warnings.some(warning => warning.includes(`Cannot create ${fileChange.path}`))) {
            continue;
          }
          
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
          if (errors.some(err => err.includes(`Cannot modify ${fileChange.path}`) || 
                                  err.includes(`No valid operations for ${fileChange.path}`))) {
            continue;
          }
          
          // Read file content again (it might have changed)
          let content: string;
          try {
            content = await fs.readFile(filePath, 'utf-8');
          } catch (error) {
            rollbackNeeded = true;
            errors.push(`Error reading ${fileChange.path} for modification: ${error instanceof Error ? error.message : 'Unknown error'}`);
            continue;
          }
          
          let operationsApplied = 0;
          let operationsFailed = 0;
          let contentModified = false;
          
          // Apply operations sequentially
          for (const operation of fileChange.operations!) {
            try {
              // Use our robust text-first operation processor
              const result = processXmlChange(
                content,
                operation.search,
                operation.replace,
                fileChange.path
              );
              
              // Check if the operation was successful
              if (result.matched) {
                content = result.newContent;
                operationsApplied++;
                contentModified = true;
                console.log(`[XML Apply] Successfully applied change to ${fileChange.path} using ${result.method} matching`);
              } else {
                // No match found with any method
                operationsFailed++;
                const errorDetails = `No matches found for pattern using any method (exact text, normalized text, whitespace-normalized, regex)`;
                warnings.push(`Warning: Search pattern didn't match any content in ${fileChange.path}: ${errorDetails}`);
                console.warn(`[XML Apply] Failed to find match in ${fileChange.path} for pattern: ${operation.search.substring(0, 50)}${operation.search.length > 50 ? '...' : ''}`);
              }
            } catch (error) {
              operationsFailed++;
              const errorMessage = error instanceof Error ? error.message : 'Unknown error';
              warnings.push(`Warning: Failed to apply operation in ${fileChange.path}: ${errorMessage}`);
              console.error(`[XML Apply] Error processing operation in ${fileChange.path}:`, error);
            }
          }
          
          // Write the modified content back to the file
          if (contentModified) {
            try {
              await fs.writeFile(filePath, content);
              changes.push(`Modified file: ${fileChange.path} (${operationsApplied} operations applied, ${operationsFailed} failed)`);
            } catch (error) {
              rollbackNeeded = true;
              errors.push(`Error writing modified content to ${fileChange.path}: ${error instanceof Error ? error.message : 'Unknown error'}`);
            }
          } else {
            warnings.push(`No changes were made to ${fileChange.path}`);
          }
        }
      } catch (error) {
        rollbackNeeded = true;
        errors.push(`Error processing ${fileChange.path}: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }
    
    // If errors occurred during the second pass, rollback all changes
    if (rollbackNeeded && backups.length > 0) {
      await rollbackChanges(backups);
      errors.push('Changes were rolled back due to errors');
    }
    
    return {
      success: !rollbackNeeded && errors.length === 0,
      message: rollbackNeeded 
        ? 'Failed to apply all changes, rolled back to previous state' 
        : errors.length > 0 
          ? 'Some errors occurred while applying changes' 
          : 'All changes applied successfully',
      changes,
      issues: [...errors, ...warnings]
    };
  } catch (error) {
    // Handle any unexpected errors
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    
    // Attempt to rollback changes
    if (backups.length > 0) {
      try {
        await rollbackChanges(backups);
        return {
          success: false,
          message: `An error occurred: ${errorMessage} (changes were rolled back)`,
          changes: [],
          issues: [`Fatal error: ${errorMessage}`]
        };
      } catch (rollbackError) {
        return {
          success: false,
          message: `An error occurred: ${errorMessage} (failed to roll back changes: ${rollbackError instanceof Error ? rollbackError.message : 'Unknown error'})`,
          changes: [],
          issues: [`Fatal error: ${errorMessage}`, `Rollback failed: ${rollbackError instanceof Error ? rollbackError.message : 'Unknown error'}`]
        };
      }
    } else {
      return {
        success: false,
        message: `An error occurred: ${errorMessage}`,
        changes: [],
        issues: [`Fatal error: ${errorMessage}`]
      };
    }
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