/**
 * Validation Utilities
 *
 * This file provides utility functions for validating inputs across the application,
 * ensuring consistent error handling and validation rules. The utilities include:
 *
 * - Type validation (isRequired, isNumber, isBoolean, etc.)
 * - String validation (length, patterns, etc.)
 * - Number validation (ranges, positive values, etc.)
 * - Domain-specific validation (sessionId, projectDirectory, apiType)
 * - Validation result helpers for standardized error responses
 */

import { ActionState } from '@/types';

/**
 * Interface for validation result
 */
export interface ValidationResult {
  isValid: boolean;
  message?: string;
}

/**
 * Validates that a value is not null or undefined
 */
export function isRequired(value: any, fieldName: string): ValidationResult {
  if (value === null || value === undefined) {
    return {
      isValid: false,
      message: `${fieldName} is required`
    };
  }
  return { isValid: true };
}

/**
 * Validates that a string is not empty
 */
export function isNotEmpty(value: string | null | undefined, fieldName: string): ValidationResult {
  const requiredCheck = isRequired(value, fieldName);
  if (!requiredCheck.isValid) {
    return requiredCheck;
  }
  
  if (typeof value === 'string' && value.trim() === '') {
    return {
      isValid: false,
      message: `${fieldName} cannot be empty`
    };
  }
  
  return { isValid: true };
}

/**
 * Validates that a string has a minimum length
 */
export function hasMinLength(value: string | null | undefined, fieldName: string, minLength: number): ValidationResult {
  const requiredCheck = isRequired(value, fieldName);
  if (!requiredCheck.isValid) {
    return requiredCheck;
  }
  
  if (typeof value === 'string' && value.length < minLength) {
    return {
      isValid: false,
      message: `${fieldName} must be at least ${minLength} characters`
    };
  }
  
  return { isValid: true };
}

/**
 * Validates that a string has a maximum length
 */
export function hasMaxLength(value: string | null | undefined, fieldName: string, maxLength: number): ValidationResult {
  const requiredCheck = isRequired(value, fieldName);
  if (!requiredCheck.isValid) {
    return requiredCheck;
  }
  
  if (typeof value === 'string' && value.length > maxLength) {
    return {
      isValid: false,
      message: `${fieldName} must be at most ${maxLength} characters`
    };
  }
  
  return { isValid: true };
}

/**
 * Validates that a value is a valid object (not null, not array)
 */
export function isObject(value: any, fieldName: string): ValidationResult {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return {
      isValid: false,
      message: `${fieldName} must be an object`
    };
  }
  
  return { isValid: true };
}

/**
 * Validates that a value is a valid array
 */
export function isArray(value: any, fieldName: string): ValidationResult {
  if (!Array.isArray(value)) {
    return {
      isValid: false,
      message: `${fieldName} must be an array`
    };
  }
  
  return { isValid: true };
}

/**
 * Validates that a value is a valid number
 */
export function isNumber(value: any, fieldName: string): ValidationResult {
  if (typeof value !== 'number' || isNaN(value)) {
    return {
      isValid: false,
      message: `${fieldName} must be a number`
    };
  }
  
  return { isValid: true };
}

/**
 * Validates that a value is a valid positive number
 */
export function isPositive(value: any, fieldName: string): ValidationResult {
  const numberCheck = isNumber(value, fieldName);
  if (!numberCheck.isValid) {
    return numberCheck;
  }
  
  if (value <= 0) {
    return {
      isValid: false,
      message: `${fieldName} must be a positive number`
    };
  }
  
  return { isValid: true };
}

/**
 * Validates that a value is a valid boolean
 */
export function isBoolean(value: any, fieldName: string): ValidationResult {
  if (typeof value !== 'boolean') {
    return {
      isValid: false,
      message: `${fieldName} must be a boolean`
    };
  }
  
  return { isValid: true };
}

/**
 * Validates that a value matches a regular expression
 */
export function matches(value: string | null | undefined, fieldName: string, pattern: RegExp): ValidationResult {
  const requiredCheck = isRequired(value, fieldName);
  if (!requiredCheck.isValid) {
    return requiredCheck;
  }
  
  if (typeof value === 'string' && !pattern.test(value)) {
    return {
      isValid: false,
      message: `${fieldName} has invalid format`
    };
  }
  
  return { isValid: true };
}

/**
 * Validates a session ID
 */
export function isValidSessionId(sessionId: string | null | undefined): ValidationResult {
  if (!sessionId) {
    return {
      isValid: false,
      message: 'Session ID is required'
    };
  }
  
  if (typeof sessionId !== 'string' || !sessionId.trim()) {
    return {
      isValid: false,
      message: 'Invalid session ID format'
    };
  }
  
  return { isValid: true };
}

/**
 * Validates a project directory
 */
export function isValidProjectDirectory(directory: string | null | undefined): ValidationResult {
  if (!directory) {
    return {
      isValid: false,
      message: 'Project directory is required'
    };
  }
  
  if (typeof directory !== 'string' || !directory.trim()) {
    return {
      isValid: false,
      message: 'Invalid project directory format'
    };
  }
  
  return { isValid: true };
}

/**
 * Validates an API type
 */
export function isValidApiType(apiType: string | null | undefined): ValidationResult {
  if (!apiType) {
    return {
      isValid: false,
      message: 'API type is required'
    };
  }
  
  const validApiTypes = ['gemini', 'claude', 'whisper', 'groq'];
  if (!validApiTypes.includes(apiType)) {
    return {
      isValid: false,
      message: `API type must be one of: ${validApiTypes.join(', ')}`
    };
  }
  
  return { isValid: true };
}

/**
 * Creates an ActionState result for a validation error
 */
export function createValidationErrorResponse<T>(result: ValidationResult): ActionState<T> {
  return {
    isSuccess: false,
    message: result.message || 'Validation error',
    error: new Error(result.message || 'Validation error')
  };
}

/**
 * Validates an input and returns an ActionState result
 */
export function validateInput<T>(
  validator: (value: any) => ValidationResult,
  value: any,
  successValue: T
): ActionState<T> {
  const result = validator(value);
  if (!result.isValid) {
    return createValidationErrorResponse<T>(result);
  }
  
  return {
    isSuccess: true,
    data: successValue
  };
}