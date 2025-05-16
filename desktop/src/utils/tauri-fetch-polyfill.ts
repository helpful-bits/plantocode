import { invoke } from '@tauri-apps/api/tauri';

/**
 * This module polyfills the global `fetch` function to intercept API calls
 * and route them to Tauri commands when they match our API pattern.
 * 
 * It allows the existing frontend code that uses `fetch` to work without
 * modification, while actually calling Tauri commands under the hood.
 */

// Store the original fetch function
const originalFetch = window.fetch;

// The prefix for URLs that should be handled by Tauri
const TAURI_API_PREFIX = '/tauri-api/';

/**
 * Helper function to get the request body in a format that can be sent to Tauri
 * @param body The request body (can be string, FormData, Blob, etc.)
 */
async function getRequestBody(body: any): Promise<any> {
  if (!body) {
    return null;
  }
  
  if (typeof body === 'string') {
    // If body is already a string, try to parse as JSON, but return as string if that fails
    try {
      return JSON.parse(body);
    } catch (e) {
      return body;
    }
  }
  
  if (body instanceof FormData) {
    // Convert FormData to an object
    const formObj: Record<string, any> = {};
    body.forEach((value, key) => {
      // Handle files specially
      if (value instanceof File) {
        // For files, we'll need to convert to base64 or handle differently
        // This is a simplified version - we're just including the file name for now
        formObj[key] = {
          type: 'file',
          name: value.name,
          size: value.size,
          // In a real implementation, you might include the file contents as base64
        };
      } else {
        formObj[key] = value;
      }
    });
    return formObj;
  }
  
  if (body instanceof Blob) {
    // Convert Blob to text or base64
    return await new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => {
        resolve(reader.result);
      };
      reader.readAsText(body); // Try as text first
    });
  }
  
  if (body instanceof ArrayBuffer) {
    // Convert ArrayBuffer to base64
    return btoa(String.fromCharCode(...new Uint8Array(body)));
  }
  
  // For other types (like objects), try to serialize to JSON
  return body;
}

// Polyfill the global fetch function
window.fetch = async (resource: RequestInfo | URL, init?: RequestInit) => {
  // Convert the resource to a URL string
  const url = resource instanceof Request ? resource.url : resource.toString();
  
  // Extract method from init or default to GET
  const method = init?.method || (resource instanceof Request ? resource.method : 'GET');
  
  // Check if this is a Tauri-bound request
  if (url.includes(TAURI_API_PREFIX)) {
    console.debug(`[Tauri Fetch Polyfill] Intercepting ${method} request to ${url}`);
    
    try {
      // Extract headers
      let headers: Record<string, string> = {};
      if (init?.headers) {
        if (init.headers instanceof Headers) {
          init.headers.forEach((value, key) => {
            headers[key] = value;
          });
        } else if (Array.isArray(init.headers)) {
          init.headers.forEach(([key, value]) => {
            headers[key] = value;
          });
        } else {
          headers = init.headers as Record<string, string>;
        }
      } else if (resource instanceof Request) {
        resource.headers.forEach((value, key) => {
          headers[key] = value;
        });
      }
      
      // Get the body
      let body = null;
      if (init?.body) {
        body = await getRequestBody(init.body);
      } else if (resource instanceof Request) {
        body = await getRequestBody(await resource.clone().text());
      }
      
      // Call the Tauri command
      const rustResponse = await invoke<any>('handle_fetch_request', {
        args: {
          method,
          headers,
          body,
          url,
        }
      });
      
      console.debug(`[Tauri Fetch Polyfill] Received response with status ${rustResponse.status}`);
      
      // Convert Tauri response to a standard Response
      const responseHeaders = new Headers(rustResponse.headers || {});
      
      // Create a response body (string or blob depending on content type)
      let responseBody: string | Blob;
      
      const contentType = responseHeaders.get('content-type') || '';
      if (contentType.includes('application/json')) {
        // For JSON, stringify the body
        responseBody = JSON.stringify(rustResponse.body);
      } else if (
        contentType.includes('image/') ||
        contentType.includes('audio/') ||
        contentType.includes('video/') ||
        contentType.includes('application/octet-stream')
      ) {
        // For binary data, create a Blob
        // This assumes the body is base64 encoded
        const base64 = rustResponse.body;
        const binaryString = window.atob(base64);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
          bytes[i] = binaryString.charCodeAt(i);
        }
        responseBody = new Blob([bytes.buffer], { type: contentType });
      } else {
        // For everything else, convert to string
        responseBody = rustResponse.body != null 
          ? (typeof rustResponse.body === 'string' 
            ? rustResponse.body 
            : JSON.stringify(rustResponse.body))
          : '';
      }
      
      // Return a standard Response object
      return new Response(responseBody, {
        status: rustResponse.status,
        headers: responseHeaders,
      });
    } catch (error) {
      console.error('[Tauri Fetch Polyfill] Error calling Tauri command:', error);
      
      // Return a 500 error response
      return new Response(JSON.stringify({
        code: 'INTERNAL_ERROR',
        message: error instanceof Error ? error.message : 'Unknown error',
      }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }
  } else {
    // Not a Tauri-bound request, call the original fetch
    return originalFetch(resource, init);
  }
};

/**
 * Initialize the fetch polyfill
 */
export function initTauriFetchPolyfill() {
  console.info('[Tauri Fetch Polyfill] Initialized');
  // The polyfill is already initialized when this module is imported
  // This function is just for explicit initialization if needed
}

export default {
  initTauriFetchPolyfill,
};