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

import { type ActionState } from "@/types";

/**
 * Type for session data structure to avoid unsafe member access
 */
export interface SessionData {
  taskDescription?: string;
  searchTerm?: string;
  titleRegex?: string;
  contentRegex?: string;
  includedFiles?: string[];
  forceExcludedFiles?: string[];
  projectDirectory?: string;
  negativeTitleRegex?: string;
  negativeContentRegex?: string;
  isRegexActive?: boolean;
  searchSelectedFilesOnly?: boolean;
  [key: string]: unknown;
}

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
export function isRequired(value: unknown, fieldName: string): ValidationResult {
  if (value === null || value === undefined) {
    return {
      isValid: false,
      message: `${fieldName} is required`,
    };
  }
  return { isValid: true };
}

/**
 * Validates that a string is not empty
 */
export function isNotEmpty(
  value: string | null | undefined,
  fieldName: string
): ValidationResult {
  const requiredCheck = isRequired(value, fieldName);
  if (!requiredCheck.isValid) {
    return requiredCheck;
  }

  if (typeof value === "string" && value.trim() === "") {
    return {
      isValid: false,
      message: `${fieldName} cannot be empty`,
    };
  }

  return { isValid: true };
}

/**
 * Validates that a string has a minimum length
 */
export function hasMinLength(
  value: string | null | undefined,
  fieldName: string,
  minLength: number
): ValidationResult {
  const requiredCheck = isRequired(value, fieldName);
  if (!requiredCheck.isValid) {
    return requiredCheck;
  }

  if (typeof value === "string" && value.length < minLength) {
    return {
      isValid: false,
      message: `${fieldName} must be at least ${minLength} characters`,
    };
  }

  return { isValid: true };
}

/**
 * Validates that a string has a maximum length
 */
export function hasMaxLength(
  value: string | null | undefined,
  fieldName: string,
  maxLength: number
): ValidationResult {
  const requiredCheck = isRequired(value, fieldName);
  if (!requiredCheck.isValid) {
    return requiredCheck;
  }

  if (typeof value === "string" && value.length > maxLength) {
    return {
      isValid: false,
      message: `${fieldName} must be at most ${maxLength} characters`,
    };
  }

  return { isValid: true };
}

/**
 * Validates that a value is a valid object (not null, not array)
 */
export function isObject(value: unknown, fieldName: string): ValidationResult {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return {
      isValid: false,
      message: `${fieldName} must be an object`,
    };
  }

  return { isValid: true };
}

/**
 * Validates that a value is a valid array
 */
export function isArray(value: unknown, fieldName: string): ValidationResult {
  if (!Array.isArray(value)) {
    return {
      isValid: false,
      message: `${fieldName} must be an array`,
    };
  }

  return { isValid: true };
}

/**
 * Validates that a value is a valid number
 */
export function isNumber(value: unknown, fieldName: string): ValidationResult {
  if (typeof value !== "number" || isNaN(value)) {
    return {
      isValid: false,
      message: `${fieldName} must be a number`,
    };
  }

  return { isValid: true };
}

/**
 * Validates that a value is a valid positive number
 */
export function isPositive(value: unknown, fieldName: string): ValidationResult {
  const numberCheck = isNumber(value, fieldName);
  if (!numberCheck.isValid) {
    return numberCheck;
  }

  if ((value as number) <= 0) {
    return {
      isValid: false,
      message: `${fieldName} must be a positive number`,
    };
  }

  return { isValid: true };
}

/**
 * Validates that a value is a valid boolean
 */
export function isBoolean(value: unknown, fieldName: string): ValidationResult {
  if (typeof value !== "boolean") {
    return {
      isValid: false,
      message: `${fieldName} must be a boolean`,
    };
  }

  return { isValid: true };
}

/**
 * Validates that a value matches a regular expression
 */
export function matches(
  value: string | null | undefined,
  fieldName: string,
  pattern: RegExp
): ValidationResult {
  const requiredCheck = isRequired(value, fieldName);
  if (!requiredCheck.isValid) {
    return requiredCheck;
  }

  if (typeof value === "string" && !pattern.test(value)) {
    return {
      isValid: false,
      message: `${fieldName} has invalid format`,
    };
  }

  return { isValid: true };
}

/**
 * Validates a session ID
 */
export function isValidSessionId(
  sessionId: string | null | undefined
): ValidationResult {
  if (!sessionId) {
    return {
      isValid: false,
      message: "Session ID is required",
    };
  }

  if (typeof sessionId !== "string" || !sessionId.trim()) {
    return {
      isValid: false,
      message: "Invalid session ID format",
    };
  }

  return { isValid: true };
}

/**
 * Validates a project directory
 */
export function isValidProjectDirectory(
  directory: string | null | undefined
): ValidationResult {
  if (!directory) {
    return {
      isValid: false,
      message: "Project directory is required",
    };
  }

  if (typeof directory !== "string" || !directory.trim()) {
    return {
      isValid: false,
      message: "Invalid project directory format",
    };
  }

  return { isValid: true };
}

/**
 * Validates an API type
 */
export function isValidApiType(
  apiType: string | null | undefined
): ValidationResult {
  if (!apiType) {
    return {
      isValid: false,
      message: "API type is required",
    };
  }

  const validApiTypes = ["gemini", "claude", "whisper", "groq"];
  if (!validApiTypes.includes(apiType)) {
    return {
      isValid: false,
      message: `API type must be one of: ${validApiTypes.join(", ")}`,
    };
  }

  return { isValid: true };
}

/**
 * Creates an ActionState result for a validation error
 */
export function createValidationErrorResponse<T>(
  result: ValidationResult
): ActionState<T> {
  return {
    isSuccess: false,
    message: result.message || "Validation error",
    error: new Error(result.message || "Validation error"),
  };
}

/**
 * Validates an input and returns an ActionState result
 */
export function validateInput<T, V>(
  validator: (value: V) => ValidationResult,
  value: V,
  successValue: T
): ActionState<T> {
  const result = validator(value);
  if (!result.isValid) {
    return createValidationErrorResponse<T>(result);
  }

  return {
    isSuccess: true,
    data: successValue,
  };
}

/**
 * Validates a Session object data structure
 * Returns undefined if validation passes, or an error message if validation fails
 */
export function validateSessionData(sessionData: SessionData): string | undefined {
  // Check if task description is provided and is a string
  if (
    sessionData.taskDescription !== undefined &&
    typeof sessionData.taskDescription !== "string"
  ) {
    return "Task description must be a string";
  }

  // Check if searchTerm is provided and is a string
  if (
    sessionData.searchTerm !== undefined &&
    typeof sessionData.searchTerm !== "string"
  ) {
    return "Search term must be a string";
  }

  // Check if titleRegex is provided and is a string
  if (
    sessionData.titleRegex !== undefined &&
    typeof sessionData.titleRegex !== "string"
  ) {
    return "Title regex must be a string";
  }

  // Check if contentRegex is provided and is a string
  if (
    sessionData.contentRegex !== undefined &&
    typeof sessionData.contentRegex !== "string"
  ) {
    return "Content regex must be a string";
  }

  // Check if includedFiles is provided and is an array of strings
  if (sessionData.includedFiles !== undefined) {
    if (!Array.isArray(sessionData.includedFiles)) {
      return "Included files must be an array";
    }

    // Check that all items in the array are strings
    if (
      sessionData.includedFiles.length > 0 && 
      sessionData.includedFiles.some((file) => typeof file !== "string")
    ) {
      return "Included files must be an array of strings";
    }
  }

  // Check if forceExcludedFiles is provided and is an array of strings
  if (sessionData.forceExcludedFiles !== undefined) {
    if (!Array.isArray(sessionData.forceExcludedFiles)) {
      return "Force excluded files must be an array";
    }

    // Check that all items in the array are strings
    if (
      sessionData.forceExcludedFiles.length > 0 &&
      sessionData.forceExcludedFiles.some(
        (file) => typeof file !== "string"
      )
    ) {
      return "Force excluded files must be an array of strings";
    }
  }

  // Check projectDirectory if provided
  if (
    sessionData.projectDirectory !== undefined &&
    typeof sessionData.projectDirectory !== "string"
  ) {
    return "Project directory must be a string";
  }

  // Check negativeTitleRegex if provided
  if (
    sessionData.negativeTitleRegex !== undefined &&
    typeof sessionData.negativeTitleRegex !== "string"
  ) {
    return "Negative title regex must be a string";
  }

  // Check negativeContentRegex if provided
  if (
    sessionData.negativeContentRegex !== undefined &&
    typeof sessionData.negativeContentRegex !== "string"
  ) {
    return "Negative content regex must be a string";
  }

  // Check isRegexActive if provided
  if (
    sessionData.isRegexActive !== undefined &&
    typeof sessionData.isRegexActive !== "boolean"
  ) {
    return "Is regex active must be a boolean";
  }

  // Check searchSelectedFilesOnly if provided
  if (
    sessionData.searchSelectedFilesOnly !== undefined &&
    typeof sessionData.searchSelectedFilesOnly !== "boolean"
  ) {
    return "Search selected files only must be a boolean";
  }

  // All validations passed
  return undefined;
}