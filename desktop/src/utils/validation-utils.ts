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
  includedFiles?: string[];
  forceExcludedFiles?: string[];
  projectDirectory?: string;
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

  const validApiTypes = ["google", "claude", "whisper", "replicate"];
  if (!validApiTypes.includes(apiType)) {
    return {
      isValid: false,
      message: `API type must be one of: ${validApiTypes.join(", ")}`,
    };
  }

  return { isValid: true };
}

// ========================================
// BILLING-SPECIFIC VALIDATION FUNCTIONS
// ========================================

/**
 * Validates a payment method ID
 */
export function isValidPaymentMethodId(
  paymentMethodId: string | null | undefined
): ValidationResult {
  if (!paymentMethodId) {
    return {
      isValid: false,
      message: "Payment method ID is required",
    };
  }

  if (typeof paymentMethodId !== "string" || !paymentMethodId.trim()) {
    return {
      isValid: false,
      message: "Payment method ID must be a non-empty string",
    };
  }

  // Stripe payment method IDs typically start with "pm_"
  if (!paymentMethodId.startsWith("pm_")) {
    return {
      isValid: false,
      message: "Invalid payment method ID format",
    };
  }

  // Basic length validation (Stripe IDs are typically 24-27 characters)
  if (paymentMethodId.length < 20 || paymentMethodId.length > 35) {
    return {
      isValid: false,
      message: "Payment method ID has invalid length",
    };
  }

  return { isValid: true };
}

/**
 * Validates a Stripe price ID
 */
export function isValidStripePriceId(
  priceId: string | null | undefined
): ValidationResult {
  if (!priceId) {
    return {
      isValid: false,
      message: "Price ID is required",
    };
  }

  if (typeof priceId !== "string" || !priceId.trim()) {
    return {
      isValid: false,
      message: "Price ID must be a non-empty string",
    };
  }

  // Stripe price IDs typically start with "price_"
  if (!priceId.startsWith("price_")) {
    return {
      isValid: false,
      message: "Invalid price ID format",
    };
  }

  // Basic length validation
  if (priceId.length < 20 || priceId.length > 35) {
    return {
      isValid: false,
      message: "Price ID has invalid length",
    };
  }

  return { isValid: true };
}

/**
 * Validates a credit pack ID
 */
export function isValidCreditPackId(
  creditPackId: string | null | undefined
): ValidationResult {
  if (!creditPackId) {
    return {
      isValid: false,
      message: "Credit pack ID is required",
    };
  }

  if (typeof creditPackId !== "string" || !creditPackId.trim()) {
    return {
      isValid: false,
      message: "Credit pack ID must be a non-empty string",
    };
  }

  // Credit pack IDs should be alphanumeric with possible hyphens/underscores
  const validIdPattern = /^[a-zA-Z0-9_-]+$/;
  if (!validIdPattern.test(creditPackId)) {
    return {
      isValid: false,
      message: "Credit pack ID contains invalid characters",
    };
  }

  if (creditPackId.length < 3 || creditPackId.length > 50) {
    return {
      isValid: false,
      message: "Credit pack ID must be between 3 and 50 characters",
    };
  }

  return { isValid: true };
}

/**
 * Validates an email address for billing
 */
export function isValidBillingEmail(
  email: string | null | undefined
): ValidationResult {
  if (!email) {
    return {
      isValid: false,
      message: "Email address is required",
    };
  }

  if (typeof email !== "string" || !email.trim()) {
    return {
      isValid: false,
      message: "Email address must be a non-empty string",
    };
  }

  // Enhanced email validation pattern
  const emailPattern = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
  if (!emailPattern.test(email)) {
    return {
      isValid: false,
      message: "Invalid email address format",
    };
  }

  // Check for reasonable length
  if (email.length > 254) {
    return {
      isValid: false,
      message: "Email address is too long",
    };
  }

  return { isValid: true };
}

/**
 * Validates a monetary amount for payments
 */
export function isValidPaymentAmount(
  amount: number | null | undefined,
  fieldName: string = "Amount"
): ValidationResult {
  if (amount === null || amount === undefined) {
    return {
      isValid: false,
      message: `${fieldName} is required`,
    };
  }

  if (typeof amount !== "number" || isNaN(amount)) {
    return {
      isValid: false,
      message: `${fieldName} must be a valid number`,
    };
  }

  if (amount <= 0) {
    return {
      isValid: false,
      message: `${fieldName} must be greater than zero`,
    };
  }

  // Check for reasonable maximum (e.g., $10,000)
  if (amount > 10000) {
    return {
      isValid: false,
      message: `${fieldName} exceeds maximum allowed value`,
    };
  }

  // Check for reasonable precision (max 2 decimal places for currency)
  const decimalPlaces = (amount.toString().split('.')[1] || '').length;
  if (decimalPlaces > 2) {
    return {
      isValid: false,
      message: `${fieldName} can have at most 2 decimal places`,
    };
  }

  return { isValid: true };
}

/**
 * Sanitizes HTML content to prevent XSS attacks
 */
export function sanitizeHtml(html: string): string {
  if (!html || typeof html !== 'string') {
    return '';
  }
  
  // Basic HTML sanitization - remove script tags and dangerous attributes
  return html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/on\w+="[^"]*"/gi, '')
    .replace(/on\w+='[^']*'/gi, '')
    .replace(/javascript:/gi, '')
    .replace(/data:/gi, '')
    .trim();
}

/**
 * Sanitizes billing address data
 */
export function sanitizeBillingAddress(address: any): any {
  if (!address || typeof address !== 'object') {
    return {};
  }
  
  return {
    line1: typeof address.line1 === 'string' ? address.line1.trim().slice(0, 100) : '',
    line2: typeof address.line2 === 'string' ? address.line2.trim().slice(0, 100) : undefined,
    city: typeof address.city === 'string' ? address.city.trim().slice(0, 50) : '',
    state: typeof address.state === 'string' ? address.state.trim().slice(0, 50) : undefined,
    postalCode: typeof address.postalCode === 'string' ? address.postalCode.trim().slice(0, 20) : '',
    country: typeof address.country === 'string' ? address.country.trim().slice(0, 5) : '',
  };
}

/**
 * Validates a spending limit amount
 */
export function isValidSpendingLimit(
  limit: number | null | undefined
): ValidationResult {
  // Spending limits can be null/undefined (no limit)
  if (limit === null || limit === undefined) {
    return { isValid: true };
  }

  if (typeof limit !== "number" || isNaN(limit)) {
    return {
      isValid: false,
      message: "Spending limit must be a valid number",
    };
  }

  if (limit < 0) {
    return {
      isValid: false,
      message: "Spending limit cannot be negative",
    };
  }

  // Check for reasonable maximum
  if (limit > 100000) {
    return {
      isValid: false,
      message: "Spending limit exceeds maximum allowed value",
    };
  }

  return { isValid: true };
}

/**
 * Validates a currency code
 */
export function isValidCurrencyCode(
  currency: string | null | undefined
): ValidationResult {
  if (!currency) {
    return {
      isValid: false,
      message: "Currency code is required",
    };
  }

  if (typeof currency !== "string" || !currency.trim()) {
    return {
      isValid: false,
      message: "Currency code must be a non-empty string",
    };
  }

  // ISO 4217 currency codes are 3 uppercase letters
  const currencyPattern = /^[A-Z]{3}$/;
  if (!currencyPattern.test(currency)) {
    return {
      isValid: false,
      message: "Currency code must be a valid 3-letter ISO code (e.g., USD, EUR)",
    };
  }

  // Common currency codes validation
  const supportedCurrencies = ['USD', 'EUR', 'GBP', 'CAD', 'AUD', 'JPY'];
  if (!supportedCurrencies.includes(currency)) {
    return {
      isValid: false,
      message: `Currency ${currency} is not supported. Supported currencies: ${supportedCurrencies.join(', ')}`,
    };
  }

  return { isValid: true };
}

/**
 * Basic client-side credit card number validation (for display/UX only)
 * NEVER rely on this for actual payment processing - use Stripe Elements
 */
export function isValidCreditCardNumber(
  cardNumber: string | null | undefined
): ValidationResult {
  if (!cardNumber) {
    return {
      isValid: false,
      message: "Credit card number is required",
    };
  }

  if (typeof cardNumber !== "string") {
    return {
      isValid: false,
      message: "Credit card number must be a string",
    };
  }

  // Remove spaces and hyphens
  const cleanNumber = cardNumber.replace(/[\s-]/g, '');

  // Check if all characters are digits
  if (!/^\d+$/.test(cleanNumber)) {
    return {
      isValid: false,
      message: "Credit card number must contain only digits",
    };
  }

  // Check length (13-19 digits for most cards)
  if (cleanNumber.length < 13 || cleanNumber.length > 19) {
    return {
      isValid: false,
      message: "Credit card number must be between 13 and 19 digits",
    };
  }

  // Simple Luhn algorithm check
  let sum = 0;
  let isEven = false;
  
  for (let i = cleanNumber.length - 1; i >= 0; i--) {
    let digit = parseInt(cleanNumber.charAt(i), 10);
    
    if (isEven) {
      digit *= 2;
      if (digit > 9) {
        digit -= 9;
      }
    }
    
    sum += digit;
    isEven = !isEven;
  }

  if (sum % 10 !== 0) {
    return {
      isValid: false,
      message: "Credit card number is invalid",
    };
  }

  return { isValid: true };
}

/**
 * Validates a plan ID for billing operations (legacy function)
 */
export function isValidPlanId(
  planId: string | null | undefined
): ValidationResult {
  if (!planId) {
    return {
      isValid: false,
      message: "Plan ID is required",
    };
  }

  if (typeof planId !== "string" || !planId.trim()) {
    return {
      isValid: false,
      message: "Plan ID must be a non-empty string",
    };
  }

  // Plan IDs should be alphanumeric with possible hyphens/underscores
  const validPlanPattern = /^[a-zA-Z0-9_-]+$/;
  if (!validPlanPattern.test(planId)) {
    return {
      isValid: false,
      message: "Plan ID contains invalid characters",
    };
  }

  if (planId.length < 3 || planId.length > 50) {
    return {
      isValid: false,
      message: "Plan ID must be between 3 and 50 characters",
    };
  }

  return { isValid: true };
}

/**
 * Rate limiting validation helper
 */
export function validateRateLimit(
  lastRequestTime: number | null,
  minIntervalMs: number = 1000
): ValidationResult {
  if (lastRequestTime === null) {
    return { isValid: true };
  }

  const now = Date.now();
  const timeSinceLastRequest = now - lastRequestTime;

  if (timeSinceLastRequest < minIntervalMs) {
    const remainingTime = Math.ceil((minIntervalMs - timeSinceLastRequest) / 1000);
    return {
      isValid: false,
      message: `Please wait ${remainingTime} second(s) before making another request`,
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