import { Session } from '@/types';

/**
 * Validates session data fields to ensure they contain valid data
 * @param sessionData Partial session data to validate
 * @returns Error message string if invalid, undefined if valid
 */
export function validateSessionData(sessionData: Partial<Session>): string | undefined {
  // Check if task description is provided and is a string
  if (sessionData.taskDescription !== undefined && typeof sessionData.taskDescription !== 'string') {
    return 'Task description must be a string';
  }
  
  // Check if searchTerm is provided and is a string
  if (sessionData.searchTerm !== undefined && typeof sessionData.searchTerm !== 'string') {
    return 'Search term must be a string';
  }
  
  
  // Check if titleRegex is provided and is a string
  if (sessionData.titleRegex !== undefined && typeof sessionData.titleRegex !== 'string') {
    return 'Title regex must be a string';
  }
  
  // Check if contentRegex is provided and is a string
  if (sessionData.contentRegex !== undefined && typeof sessionData.contentRegex !== 'string') {
    return 'Content regex must be a string';
  }
  
  // Check if includedFiles is provided and is an array of strings
  if (sessionData.includedFiles !== undefined) {
    if (!Array.isArray(sessionData.includedFiles)) {
      return 'Included files must be an array';
    }
    
    // Check that all items in the array are strings
    if (sessionData.includedFiles.some(file => typeof file !== 'string')) {
      return 'Included files must be an array of strings';
    }
  }
  
  // Check if forceExcludedFiles is provided and is an array of strings
  if (sessionData.forceExcludedFiles !== undefined) {
    if (!Array.isArray(sessionData.forceExcludedFiles)) {
      return 'Force excluded files must be an array';
    }
    
    // Check that all items in the array are strings
    if (sessionData.forceExcludedFiles.some(file => typeof file !== 'string')) {
      return 'Force excluded files must be an array of strings';
    }
  }
  
  // Check codebaseStructure if provided
  if (sessionData.codebaseStructure !== undefined && typeof sessionData.codebaseStructure !== 'string') {
    return 'Codebase structure must be a string';
  }

  // Check projectDirectory if provided
  if (sessionData.projectDirectory !== undefined && typeof sessionData.projectDirectory !== 'string') {
    return 'Project directory must be a string';
  }
  
  // Check negativeTitleRegex if provided
  if (sessionData.negativeTitleRegex !== undefined && typeof sessionData.negativeTitleRegex !== 'string') {
    return 'Negative title regex must be a string';
  }
  
  // Check negativeContentRegex if provided
  if (sessionData.negativeContentRegex !== undefined && typeof sessionData.negativeContentRegex !== 'string') {
    return 'Negative content regex must be a string';
  }
  
  // Check isRegexActive if provided
  if (sessionData.isRegexActive !== undefined && typeof sessionData.isRegexActive !== 'boolean') {
    return 'Is regex active must be a boolean';
  }
  
  // Check searchSelectedFilesOnly if provided
  if (sessionData.searchSelectedFilesOnly !== undefined && typeof sessionData.searchSelectedFilesOnly !== 'boolean') {
    return 'Search selected files only must be a boolean';
  }
  
  // Check diffTemperature if provided
  if (sessionData.diffTemperature !== undefined && typeof sessionData.diffTemperature !== 'number') {
    return 'Diff temperature must be a number';
  }
  
  // All validations passed
  return undefined;
}