/**
 * Utility functions for string manipulation and formatting
 *
 * This file contains general utilities for working with strings,
 * including text processing, validation, and common string operations.
 */

/**
 * Truncates a string to the specified length and adds an ellipsis if truncated
 * @param str String to truncate
 * @param maxLength Maximum length before truncation
 * @param ellipsis String to append when truncated
 */
export function truncate(
  str: string,
  maxLength: number,
  ellipsis = "..."
): string {
  if (!str || str.length <= maxLength) {
    return str;
  }

  return str.slice(0, maxLength - ellipsis.length) + ellipsis;
}

/**
 * Generates a slug from a string
 * @param str String to convert to slug
 */
export function slugify(str: string): string {
  return str
    .toLowerCase()
    .replace(/[^\w\s-]/g, "") // Remove non-word chars
    .replace(/[\s_-]+/g, "-") // Replace spaces and underscores with hyphens
    .replace(/^-+|-+$/g, ""); // Remove leading/trailing hyphens
}

/**
 * Capitalizes the first letter of each word in a string
 * @param str String to capitalize
 */
export function capitalize(str: string): string {
  return str
    .split(" ")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}

/**
 * Formats a string with named placeholders
 * @param template String template with {name} placeholders
 * @param params Object with values for the placeholders
 */
export function formatString(
  template: string,
  params: Record<string, unknown>
): string {
  return template.replace(/{([^{}]*)}/g, (match, key) => {
    const paramValue = params[key as string];
    return paramValue !== undefined 
      ? (typeof paramValue === 'string' 
          ? paramValue 
          : typeof paramValue === 'number' || typeof paramValue === 'boolean'
            ? String(paramValue)
            : paramValue === null
              ? 'null'
              : match)
      : match;
  });
}

/**
 * Checks if a string contains another string
 * @param str String to search in
 * @param searchStr String to search for
 * @param caseInsensitive Whether to ignore case
 */
export function contains(
  str: string,
  searchStr: string,
  caseInsensitive = false
): boolean {
  if (caseInsensitive) {
    return str.toLowerCase().includes(searchStr.toLowerCase());
  }
  return str.includes(searchStr);
}

/**
 * Formats a number as a file size string (e.g., "1.5 KB")
 * @param bytes Number of bytes
 * @param decimals Number of decimal places
 */
export function formatFileSize(bytes: number, decimals = 2): string {
  if (bytes === 0) return "0 Bytes";

  const k = 1024;
  const sizes = ["Bytes", "KB", "MB", "GB", "TB", "PB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return (
    parseFloat((bytes / Math.pow(k, i)).toFixed(decimals)) + " " + sizes[i]
  );
}

/**
 * Checks if a string is empty or only contains whitespace
 * @param str String to check
 */
export function isEmptyOrWhitespace(str: string): boolean {
  return !str || str.trim() === "";
}

/**
 * Removes HTML tags from a string
 * @param str String with HTML
 */
export function stripHtml(str: string): string {
  return str.replace(/<\/?[^>]+(>|$)/g, "");
}

/**
 * Safely JSON stringifies a value with circular reference handling
 * @param value Value to stringify
 * @param space Number of spaces for indentation
 */
export function safeJsonStringify(value: unknown, space?: number): string {
  const seen = new WeakSet<object>();

  return JSON.stringify(
    value,
    (_key, val) => {
      if (typeof val === "object" && val !== null) {
        if (seen.has(val as object)) {
          return "[Circular Reference]";
        }
        seen.add(val as object);
      }
      return val as unknown;
    },
    space
  );
}

/**
 * Highlights a search term within a string
 * @param text Text to highlight in
 * @param searchTerm Term to highlight
 * @param highlightClass CSS class to add to the highlight
 */
export function highlightSearchTerm(
  text: string,
  searchTerm: string,
  highlightClass = "highlighted"
): string {
  if (!searchTerm || !text) {
    return text;
  }

  const regex = new RegExp(
    `(${searchTerm.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`,
    "gi"
  );
  return text.replace(regex, `<span class="${highlightClass}">$1</span>`);
}

/**
 * Generates a random string ID
 * @param length Length of the ID
 * @param chars Characters to use
 */
export function generateId(
  length = 6,
  chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789"
): string {
  let result = "";
  const charsLength = chars.length;

  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * charsLength));
  }

  return result;
}

/**
 * Converts a camelCase or PascalCase string to snake_case
 * @param str String to convert
 */
export function toSnakeCase(str: string): string {
  return str
    .replace(/([A-Z])/g, "_$1")
    .toLowerCase()
    .replace(/^_/, "");
}

/**
 * Converts a snake_case or kebab-case string to camelCase
 * @param str String to convert
 */
export function toCamelCase(str: string): string {
  return str
    .replace(/[-_](.)/g, (_, c) => (typeof c === 'string' ? c.toUpperCase() : c) as string)
    .replace(/^(.)/, (_, c) => (typeof c === 'string' ? c.toLowerCase() : c) as string);
}

/**
 * Processes and validates text for UI display.
 *
 * This utility centralizes the common logic for handling API/LLM response text
 * to ensure consistent processing across different components.
 *
 * @param textInput Input text which may be a string, object, or other format
 * @returns Processed string or null if input is invalid
 */
export function processText(textInput: unknown): string | null {
  // Handle null/undefined input
  if (textInput === null || textInput === undefined) {
    return null;
  }

  let processedText = "";

  // If textInput is an object, try to extract the actual text content
  if (typeof textInput === "object" && textInput !== null) {
    const inputObj = textInput as Record<string, unknown>;
    
    // Handle background job object directly passed
    if (inputObj.isBackgroundJob && inputObj.jobId) {
      return null;
    }

    // Try to extract text from common API response formats
    if (inputObj.response && typeof inputObj.response === "string") {
      processedText = inputObj.response;
    } else if (inputObj.data && typeof inputObj.data === "string") {
      processedText = inputObj.data;
    } else if (inputObj.text && typeof inputObj.text === "string") {
      processedText = inputObj.text;
    } else if (inputObj.content && typeof inputObj.content === "string") {
      processedText = inputObj.content;
    } else if (inputObj.message && typeof inputObj.message === "string") {
      processedText = inputObj.message;
    } else {
      // Last resort - try to stringify the whole object
      try {
        processedText = JSON.stringify(textInput);
      } catch (_e) {
        return null;
      }
    }
  } else if (typeof textInput === "string") {
    // Use string input directly
    processedText = textInput;
  } else {
    // For any other type, try to convert to string
    try {
      processedText = (typeof textInput === 'number' || typeof textInput === 'boolean' || textInput === null)
        ? String(textInput)
        : '[Complex value]';
    } catch (_e) {
      return null;
    }
  }

  // Validate the processed text is not empty
  if (!processedText || processedText.trim() === "") {
    return null;
  }

  // Check if text appears to be a UUID
  const uuidPattern =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (uuidPattern.test(processedText.trim())) {
    return null;
  }

  // Check if text is JSON or contains suspicious format identifiers that should have been parsed
  if (
    (processedText.startsWith("{") && processedText.endsWith("}")) ||
    (processedText.includes('"text":') && processedText.includes("}"))
  ) {
    try {
      // Attempt to parse as JSON to extract 'text' field if present
      const parsed = JSON.parse(processedText) as Record<string, unknown>;
      if (parsed.text && typeof parsed.text === "string") {
        processedText = parsed.text;
      } else if (parsed.response && typeof parsed.response === "string") {
        processedText = parsed.response;
      } else if (parsed.data && typeof parsed.data === "string") {
        processedText = parsed.data;
      } else if (parsed.message && typeof parsed.message === "string") {
        processedText = parsed.message;
      }
    } catch (_e) {
      // If parsing fails, continue with original text
    }
  }

  return processedText;
}

/**
 * Check if the text format is suitable for UI display.
 * Helps prevent displaying partial or corrupted text to users.
 */
export function isDisplayableText(text: unknown): boolean {
  const processed = processText(text);
  return processed !== null && processed.length > 0;
}

/**
 * Generates a UUID (Universally Unique Identifier)
 * Uses crypto.randomUUID when available, falls back to a pseudo-random implementation
 */
export function generateUUID(): string {
  return crypto.randomUUID
    ? crypto.randomUUID()
    : "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function (c) {
        const r = (Math.random() * 16) | 0;
        const v = c === "x" ? r : (r & 0x3) | 0x8;
        return v.toString(16);
      });
}

/**
 * Safely compares two strings, handling null/undefined values efficiently
 */
export function safeStringCompare(
  a: string | null | undefined,
  b: string | null | undefined
): boolean {
  // Fast path: reference equality
  if (a === b) return true;

  // Handle null/undefined
  if (a === null && b === null) return true;
  if (a === undefined && b === undefined) return true;
  if (a === null || a === undefined || b === null || b === undefined) return false;

  // Compare lengths first, then content
  return a.length === b.length && a === b;
}
