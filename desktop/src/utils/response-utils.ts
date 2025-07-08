// Response type utilities for type-safe job response handling

export interface JobResponseData {
  content: string;
  structured?: Record<string, any>;
  isJson: boolean;
}

// Convert any response to standardized format
export function normalizeJobResponse(response: string | object | undefined | null): JobResponseData {
  if (!response) {
    return { content: '', isJson: false };
  }
  
  if (typeof response === 'string') {
    // Try to parse as JSON for structured access
    try {
      const parsed = JSON.parse(response);
      return {
        content: response,
        structured: parsed,
        isJson: true
      };
    } catch {
      return {
        content: response,
        isJson: false
      };
    }
  }
  
  if (typeof response === 'object') {
    return {
      content: JSON.stringify(response, null, 2),
      structured: response as Record<string, any>,
      isJson: true
    };
  }
  
  return {
    content: String(response),
    isJson: false
  };
}

// Safe string operations
export function safeResponseIncludes(response: string | object | undefined, searchTerm: string): boolean {
  const normalized = normalizeJobResponse(response);
  return normalized.content.includes(searchTerm);
}

export function safeResponseLength(response: string | object | undefined): number {
  const normalized = normalizeJobResponse(response);
  return normalized.content.length;
}

export function safeResponseTrim(response: string | object | undefined): string {
  const normalized = normalizeJobResponse(response);
  return normalized.content.trim();
}

// Get structured data safely
export function getStructuredResponse(response: string | object | undefined): Record<string, any> | null {
  const normalized = normalizeJobResponse(response);
  return normalized.structured || null;
}

/**
 * Extracts files from a job response in a standardized way
 * The backend standardizes all file-finding responses to have 'files' and 'count' fields
 */
export function extractFilesFromResponse(response: any): string[] {
  if (!response) return [];

  // Handle string responses
  if (typeof response === 'string') {
    try {
      const parsed = JSON.parse(response);
      return extractFilesFromParsedResponse(parsed);
    } catch {
      return [];
    }
  }

  // Handle object responses
  return extractFilesFromParsedResponse(response);
}

function extractFilesFromParsedResponse(parsed: any): string[] {
  if (!parsed) return [];

  // Direct array of files (legacy format)
  if (Array.isArray(parsed)) {
    return parsed.filter(f => typeof f === 'string');
  }

  // Standardized format with 'files' field
  if (parsed.files && Array.isArray(parsed.files)) {
    return parsed.files.filter((f: any) => typeof f === 'string');
  }

  // Handle path finder specific format with verified/unverified paths
  if ('verifiedPaths' in parsed && 'unverifiedPaths' in parsed) {
    const verifiedPaths = Array.isArray(parsed.verifiedPaths) ? parsed.verifiedPaths : [];
    const unverifiedPaths = Array.isArray(parsed.unverifiedPaths) ? parsed.unverifiedPaths : [];
    return [...verifiedPaths, ...unverifiedPaths].filter(f => typeof f === 'string');
  }

  // Workflow response format
  if (parsed.selectedFiles && Array.isArray(parsed.selectedFiles)) {
    return parsed.selectedFiles.filter((f: any) => typeof f === 'string');
  }

  return [];
}

/**
 * Checks if a response has files based on the standardized format
 */
export function hasFilesInResponse(response: any): boolean {
  const files = extractFilesFromResponse(response);
  return files.length > 0;
}