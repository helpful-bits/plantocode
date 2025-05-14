/**
 * API Client Adapter for Desktop App
 * 
 * Provides adapters for core API clients to use the server proxy
 * when running in the desktop environment.
 */

import { getToken } from '@/auth/token-storage';

// Server URL from environment variables
const SERVER_URL = import.meta.env.SERVER_URL || 'http://localhost:8080';

/**
 * Create headers with authentication token
 */
async function createAuthHeaders(): Promise<HeadersInit> {
  const token = await getToken();
  
  if (!token) {
    throw new Error('Authentication token not found');
  }
  
  return {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  };
}

/**
 * Gemini API client adapter for desktop
 */
export class GeminiClientAdapter {
  /**
   * Send a request to Gemini via the proxy
   */
  async sendRequest(payload: any): Promise<any> {
    const headers = await createAuthHeaders();
    
    const response = await fetch(`${SERVER_URL}/api/proxy/gemini`, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload)
    });
    
    if (!response.ok) {
      throw new Error(`Gemini API request failed: ${response.statusText}`);
    }
    
    return response.json();
  }
  
  /**
   * Send a streaming request to Gemini via the proxy
   */
  async sendStreamingRequest(payload: any): Promise<ReadableStream<Uint8Array>> {
    const headers = await createAuthHeaders();
    
    const response = await fetch(`${SERVER_URL}/api/proxy/gemini/stream`, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload)
    });
    
    if (!response.ok) {
      throw new Error(`Gemini streaming API request failed: ${response.statusText}`);
    }
    
    return response.body!;
  }
}

/**
 * Claude API client adapter for desktop
 */
export class ClaudeClientAdapter {
  /**
   * Send a request to Claude via the proxy
   */
  async sendRequest(payload: any): Promise<any> {
    const headers = await createAuthHeaders();
    
    const response = await fetch(`${SERVER_URL}/api/proxy/claude`, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload)
    });
    
    if (!response.ok) {
      throw new Error(`Claude API request failed: ${response.statusText}`);
    }
    
    return response.json();
  }
  
  /**
   * Send a streaming request to Claude via the proxy
   */
  async sendStreamingRequest(payload: any): Promise<ReadableStream<Uint8Array>> {
    const headers = await createAuthHeaders();
    
    const response = await fetch(`${SERVER_URL}/api/proxy/claude/stream`, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload)
    });
    
    if (!response.ok) {
      throw new Error(`Claude streaming API request failed: ${response.statusText}`);
    }
    
    return response.body!;
  }
}

/**
 * Groq API client adapter for desktop
 */
export class GroqClientAdapter {
  /**
   * Send a request to Groq via the proxy
   */
  async sendRequest(payload: any): Promise<any> {
    const headers = await createAuthHeaders();
    
    const response = await fetch(`${SERVER_URL}/api/proxy/groq`, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload)
    });
    
    if (!response.ok) {
      throw new Error(`Groq API request failed: ${response.statusText}`);
    }
    
    return response.json();
  }
  
  /**
   * Send a streaming request to Groq via the proxy
   */
  async sendStreamingRequest(payload: any): Promise<ReadableStream<Uint8Array>> {
    const headers = await createAuthHeaders();
    
    const response = await fetch(`${SERVER_URL}/api/proxy/groq/stream`, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload)
    });
    
    if (!response.ok) {
      throw new Error(`Groq streaming API request failed: ${response.statusText}`);
    }
    
    return response.body!;
  }
}