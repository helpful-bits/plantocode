"use client";
import { createContext, useContext, useState, ReactNode, useEffect } from "react";
import { hashString } from '@/lib/hash'; // Import hashString
// Cache interface
interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

interface DatabaseClientCache { // Renamed interface for clarity
  sessions: Record<string, CacheEntry<Session[]>>;
  activeSessionIds: Record<string, CacheEntry<string | null>>;
  sessionDetails: Record<string, CacheEntry<Session | null>>;
  sessionWithRequests: Record<string, CacheEntry<Session | null>>; // Cache for getSessionWithRequests
}


// Define API client for database operations
class DatabaseClient {
  private cache: DatabaseClientCache = { // Use renamed interface
    sessions: {},
    activeSessionIds: {},
    sessionDetails: {},
    sessionWithRequests: {}, // Initialize new cache
  };
  
  private cachedStateCache: Record<string, CacheEntry<string | null>> = {}; // Add cache for cached state
  private pendingRequests: Record<string, Promise<any>> = {};
  private readonly CACHE_TTL = 2000; // 2 seconds
  private readonly CACHED_STATE_TTL = 10000; // 10 seconds TTL for cached state values
  
  // Get cache key for project-specific data
  private getCacheKey(projectDirectory: string): string { // Keep function signature
    return `${projectDirectory}`;
  }
  
  private getSessionCacheKey(sessionId: string): string {
      return `session_${sessionId}`;
  }

  // Get cache key for project directory and key combinations
  private getCachedStateKey(projectDirectory: string | null | undefined, key: string): string {
    const safeProjectDirectory = projectDirectory || 'global';
    return `${safeProjectDirectory}|${key}`;
  }

  // Session operations
  async getSessions(projectDirectory: string): Promise<Session[]> {
    const cacheKey = this.getCacheKey(projectDirectory);

    // Check cache first
    const cached = this.cache.sessions[cacheKey];
    if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
      console.log(`[DB Client] Using cached sessions for ${projectDirectory}`);
      return cached.data;
    }
    
    // Check if there's a pending request for this
    if (this.pendingRequests[`sessions_${cacheKey}`]) {
      console.log(`[DB Client] Reusing pending request for sessions ${projectDirectory}`);
      return this.pendingRequests[`sessions_${cacheKey}`];
    }
    
    console.log(`[DB Client] Fetching sessions for ${projectDirectory}`);

    // Create the fetch operation with retry
    const fetchPromise = new Promise<Session[]>(async (resolve, reject) => {
      try {
        const result = await this.withRetry(
          async () => {
            const response = await fetch(`/api/sessions?projectDirectory=${encodeURIComponent(projectDirectory)}`);
            
            if (!response.ok) {
              let errorMessage = `Failed to fetch sessions: ${response.status} ${response.statusText}`;
              // Only try to parse JSON if the content type is application/json
              if (response.headers.get('content-type')?.includes('application/json')) {
                try {
                  const error = await response.json();
                  errorMessage = error.message || errorMessage;
                } catch (parseError) {
                  console.error('Error parsing JSON error response:', parseError);
                }
              }
              throw new Error(errorMessage);
            }
            
            return await response.json();
          },
          `getSessions for ${projectDirectory}`
        );
        
        // Update cache
        this.cache.sessions[cacheKey] = {
          data: result,
          timestamp: Date.now()
        };
        
        resolve(result);
      } catch (error) {
        reject(error);
      } finally {
        // Clear the pending request
        delete this.pendingRequests[`sessions_${cacheKey}`];
      }
    });
    
    this.pendingRequests[`sessions_${cacheKey}`] = fetchPromise;
    return fetchPromise;
  }
  
  async getSession(sessionId: string): Promise<Session | null> {
    // Check cache first
    const cached = this.cache.sessionDetails[sessionId];
    if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
      console.log(`[DB Client] Using cached session details for ${sessionId}`);
      return cached.data;
    }
    
    // Check for pending request
    if (this.pendingRequests[`session_${sessionId}`]) {
      console.log(`[DB Client] Reusing pending request for session ${sessionId}`);
      return this.pendingRequests[`session_${sessionId}`];
    }
    
    console.log(`[DB Client] Fetching session ${sessionId}`);
    
    const fetchPromise = new Promise<Session | null>(async (resolve, reject) => { // Keep async keyword
      try {
        const response = await fetch(`/api/session?id=${encodeURIComponent(sessionId)}`);
        
        if (!response.ok && response.status !== 404) {
          let errorMessage = `Failed to fetch session: ${response.status} ${response.statusText}`;
          // Only try to parse JSON if the content type is application/json
          if (response.headers.get('content-type')?.includes('application/json')) {
            try {
              const error = await response.json();
              errorMessage = error.message || errorMessage;
            } catch (parseError) {
              console.error('Error parsing JSON error response:', parseError);
            }
          }
          throw new Error(errorMessage);
        }
        
        if (response.status === 404) {
          this.cache.sessionDetails[sessionId] = {
            data: null,
            timestamp: Date.now()
          };
          resolve(null);
          return;
        }
        
        try {
          const data = await response.json();
          
          // Update cache
          this.cache.sessionDetails[sessionId] = {
            data: data as Session,
            timestamp: Date.now()
          };
          
          resolve(data);
        } catch (parseError) {
          console.error('[DB Client] Error parsing session response:', parseError);
          reject(new Error('Failed to parse session response'));
        }
      } catch (error) {
        reject(error);
      } finally {
        delete this.pendingRequests[`session_${sessionId}`];
      }
    });
    
    this.pendingRequests[`session_${sessionId}`] = fetchPromise;
    return fetchPromise;
  }
  
  async getSessionWithRequests(sessionId: string): Promise<Session | null> {
    const cacheKey = `session_with_requests_${sessionId}`;
    
    // Check cache first
    const cached = this.cache.sessionWithRequests[cacheKey];
    if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
      console.log(`[DB Client] Using cached session with requests for ${sessionId}`);
      return cached.data;
    }
    if (this.pendingRequests[cacheKey]) {
      console.log(`[DB Client] Reusing pending request for session with requests ${sessionId}`);
      return this.pendingRequests[cacheKey];
    }
    
    console.log(`[DB Client] Fetching session with requests ${sessionId}`);
    
    const fetchPromise = new Promise<Session | null>(async (resolve, reject) => {
      try {
        const response = await fetch(`/api/session?id=${encodeURIComponent(sessionId)}&includeRequests=true`);
        
        if (!response.ok && response.status !== 404) {
          let errorMessage = `Failed to fetch session: ${response.status} ${response.statusText}`;
          if (response.headers.get('content-type')?.includes('application/json')) {
            try {
              const error = await response.json();
              errorMessage = error.message || errorMessage;
            } catch (parseError) {
              console.error('Error parsing JSON error response:', parseError);
            }
          }
          throw new Error(errorMessage);
        }
        
        if (response.status === 404) {
          resolve(null);
          return;
        }
        
        try {
          const data = await response.json();
          // Update cache - cast data to Session
          this.cache.sessionWithRequests[cacheKey] = {
            data,
            timestamp: Date.now()
          };
          
          resolve(data);
        } catch (parseError) {
          console.error('[DB Client] Error parsing session response:', parseError);
          reject(new Error('Failed to parse session response'));
        }
      } catch (error) {
        reject(error);
      } finally {
        delete this.pendingRequests[cacheKey];
      }
    });
    
    this.pendingRequests[cacheKey] = fetchPromise;
    return fetchPromise;
  }
  
  async saveSession(session: Session): Promise<Session> { // Keep function signature
    console.log(`[DB Client] Saving session ${session.id} (${session.name})`);
    
    // Validate session object before sending to API - ensure required fields are not empty/whitespace
    if (!session.id || !session.projectDirectory?.trim() || !session.name?.trim()) { // Add trim checks
      console.error(`[DB Client] Validation error - Missing required fields: id='${session.id}', projectDirectory='${session.projectDirectory}', name='${session.name}'`);
      console.error('Session object causing validation error:', JSON.stringify(session, null, 2)); // Log the problematic session object
      throw new Error('Failed to save session: Missing required fields');
    }
    
    try {
      // Make the API call to save the session
      const response = await fetch('/api/sessions', { // Keep fetch call
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(session),
      });
      
      // Handle non-ok responses
      if (!response.ok) {
        // Try to get detailed error information
        let errorMessage = `Failed to save session: ${response.status} ${response.statusText}`;
        
        if (response.headers.get('content-type')?.includes('application/json')) {
          try {
            const errorData = await response.json();
            errorMessage = errorData.error || errorData.message || errorMessage;
          } catch (parseError) {
            console.error('[DB Client] Error parsing error response:', parseError);
          }
        }
        
        console.error(`[DB Client] HTTP error saving session: ${response.status} ${response.statusText}`, { errorMessage });
        throw new Error(errorMessage);
      }
      
      try {
        const savedSession = await response.json();
        
        // Invalidate relevant caches *after* successful save
        this.clearCacheForSession(savedSession.id); // Clears details and sessionWithRequests cache
        this.clearCacheForProjectSessions(savedSession.projectDirectory); // Clears project sessions list cache
        
        // Update the specific session details cache immediately with the saved data
        this.cache.sessionDetails[savedSession.id] = {
          data: savedSession,
          timestamp: Date.now()
        };
        
        // Update the session with requests cache too
        const sessionWithRequestsCacheKey = `session_with_requests_${savedSession.id}`;
        if (this.cache.sessionWithRequests[sessionWithRequestsCacheKey]) {
             this.cache.sessionWithRequests[sessionWithRequestsCacheKey] = {
                 data: savedSession, // Assuming savedSession contains requests if fetched before save
                 timestamp: Date.now()
             };
        }

        return savedSession;
      } catch (parseError) {
        console.error('[DB Client] Error parsing saved session response:', parseError);
        throw new Error('Failed to parse saved session response');
      }
    } catch (error) {
      console.error('[DB Client] Exception saving session:', error);
      throw new Error(error instanceof Error ? error.message : 'Failed to save session');
    }
  }
  
  async deleteSession(sessionId: string): Promise<void> {
    console.log(`[DB Client] Deleting session ${sessionId}`);
    
    // Invalidate cache *before* API call for optimistic UI update
    this.clearCacheForSession(sessionId); // Clears details and sessionWithRequests
    
    const response = await fetch(`/api/sessions?id=${encodeURIComponent(sessionId)}`, {
      method: 'DELETE',
    });
    
    if (!response.ok) {
      let errorMessage = `Failed to delete session: ${response.status} ${response.statusText}`;
      // Only try to parse JSON if the content type is application/json
      if (response.headers.get('content-type')?.includes('application/json')) {
        try {
          const error = await response.json();
          errorMessage = error.message || errorMessage;
        } catch (parseError) {
          console.error('Error parsing JSON error response:', parseError);
        }
      }
      throw new Error(errorMessage);
    } else {
      // On success, ensure project session lists are invalidated if the deleted session was part of them
      // This requires knowing the project directory, which we don't have here easily.
      // Rely on the next getSessions call for the affected project to re-fetch.
      console.log(`[DB Client] Session ${sessionId} deleted successfully. Project session list cache will update on next fetch.`);
    }
  }
  
  // Project settings operations
  async getActiveSessionId(projectDirectory: string): Promise<string | null> {
    const cacheKey = this.getCacheKey(projectDirectory);
    
    // Check cache first
    const cached = this.cache.activeSessionIds[cacheKey];
    if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
      console.log(`[DB Client] Using cached active session ID for ${projectDirectory}`);
      return cached.data;
    }
    
    // Check for pending request
    if (this.pendingRequests[`activeSession_${cacheKey}`]) {
      console.log(`[DB Client] Reusing pending request for active session ID for ${projectDirectory}`);
      return this.pendingRequests[`activeSession_${cacheKey}`];
    }
    
    console.log(`[DB Client] Fetching active session ID for ${projectDirectory}`);
    
    const fetchPromise = new Promise<string | null>(async (resolve, reject) => {
      try {
        const result = await this.withRetry(
          async () => {
            const response = await fetch(`/api/active-session?projectDirectory=${encodeURIComponent(projectDirectory)}`);
            
            if (!response.ok) {
              let errorMessage = `Failed to fetch active session ID: ${response.status} ${response.statusText}`;
              if (response.headers.get('content-type')?.includes('application/json')) {
                try {
                  const error = await response.json();
                  errorMessage = error.message || errorMessage;
                } catch (parseError) {
                  console.error('Error parsing JSON error response:', parseError);
                }
              }
              throw new Error(errorMessage);
            }
            
            const data = await response.json();
            return data.sessionId; // Extract the sessionId from the response
          },
          `getActiveSessionId for ${projectDirectory}`
        );
        
        // Update cache
        this.cache.activeSessionIds[cacheKey] = {
          data: result,
          timestamp: Date.now()
        };
        
        resolve(result);
      } catch (error) {
        reject(error);
      } finally {
        delete this.pendingRequests[`activeSession_${cacheKey}`];
      }
    });
    
    this.pendingRequests[`activeSession_${cacheKey}`] = fetchPromise;
    return fetchPromise;
  }
  
  async setActiveSession(projectDirectory: string, sessionId: string | null): Promise<void> {
    const cacheKey = this.getCacheKey(projectDirectory);
    
    // Update cache immediately for faster UI updates
    this.cache.activeSessionIds[cacheKey] = {
      data: sessionId,
      timestamp: Date.now()
    };
    
    console.log(`[DB Client] Setting active session for ${projectDirectory} to ${sessionId || 'null'}`);
    
    try {
      await this.withRetry(
        async () => {
          const response = await fetch('/api/active-session', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              projectDirectory,
              sessionId
            }),
          });
          
          if (!response.ok) {
            let errorMessage = `Failed to set active session: ${response.status} ${response.statusText}`;
            if (response.headers.get('content-type')?.includes('application/json')) {
              try {
                const error = await response.json();
                errorMessage = error.message || errorMessage;
              } catch (parseError) {
                console.error('Error parsing JSON error response:', parseError);
              }
            }
            throw new Error(errorMessage);
          }
          
          return await response.json();
        },
        `setActiveSession for ${projectDirectory}`
      );
    } catch (error) {
      // Revert cache on error
      console.error(`[DB Client] Failed to set active session for ${projectDirectory}:`, error);
      delete this.cache.activeSessionIds[cacheKey];
      throw error;
    }
  }
  
  async getCachedState(projectDirectory: string | null | undefined, key: string): Promise<string | null> {
    // Validate inputs to prevent common error cases
    if (!key) {
      console.error('getCachedState called with empty key');
      return null;
    }
    
    // For global keys, ensure consistent values
    const safeProjectDirectory = projectDirectory || 'global'; // Use 'global' if projectDirectory is empty/null

    // Create a cache key for this specific request
    const cacheKey = this.getCachedStateKey(safeProjectDirectory, key);
    
    // Check if we have a cached value that's still valid - extend TTL for project directory keys
    const cachedEntry = this.cachedStateCache[cacheKey];
    // Use longer TTL (30 seconds) for project directory related keys to reduce ping-pong
    const effectiveTTL = key === 'global-project-dir' ? 30000 : this.CACHED_STATE_TTL;
    
    if (cachedEntry && Date.now() - cachedEntry.timestamp < effectiveTTL) {
      // Quietly use the cached value without logging
      return cachedEntry.data;
    }
    
    // Check if there's already a pending request for this exact data
    const pendingKey = `cachedState_${cacheKey}`;
    if (this.pendingRequests[pendingKey]) {
      // Return the existing promise to avoid duplicate requests
      return this.pendingRequests[pendingKey];
    }

    // Create a new promise for this request
    const fetchPromise = new Promise<string | null>(async (resolve, reject) => {
      try {
        // For project directory keys, if they're in high frequency use, return cached value even if stale
        // This prevents ping-pong by adding a cooldown period for certain key types
        if (key === 'global-project-dir' && cachedEntry && Date.now() - cachedEntry.timestamp < 60000) {
          resolve(cachedEntry.data);
          return;
        }
        
        const response = await fetch(`/api/cached-state?projectDirectory=${encodeURIComponent(safeProjectDirectory)}&key=${encodeURIComponent(key)}`);
        
        if (!response.ok) {
          try {
            // Only attempt to parse JSON if content-type is application/json
            if (response.headers.get('content-type')?.includes('application/json')) {
              const error = await response.json(); // Try to parse error response
              console.error(`Failed to fetch cached state for ${key}:`, error);
            } else {
              // For non-JSON responses, just log the status
              console.error(`Failed to fetch cached state for ${key}: ${response.status} ${response.statusText}`);
            }
          } catch (parseError) {
            // Handle case where response isn't valid JSON
            console.error(`Failed to fetch cached state for ${key}: ${response.status} ${response.statusText}`);
          }
          
          // If we have a stale cached value, return it anyway as fallback
          if (cachedEntry) {
            console.log(`Using stale cached value for ${key} due to fetch error`);
            resolve(cachedEntry.data);
            return;
          }
          
          resolve(null);
          return;
        }
        
        try {
          const data = await response.json();
          
          // Cache the result (even if null)
          this.cachedStateCache[cacheKey] = {
            data: data.value,
            timestamp: Date.now()
          };
          
          resolve(data.value);
        } catch (parseError) {
          console.error(`Error parsing JSON response for cached state ${key}:`, parseError);
          
          // If we have a stale cached value, return it anyway as fallback
          if (cachedEntry) {
            console.log(`Using stale cached value for ${key} due to parse error`);
            resolve(cachedEntry.data);
            return;
          }
          
          resolve(null);
        }
      } catch (error) {
        console.error(`Error fetching cached state for ${key}:`, error);
        
        // If we have a stale cached value, return it anyway as fallback
        if (cachedEntry) {
          console.log(`Using stale cached value for ${key} due to fetch error`);
          resolve(cachedEntry.data);
          return;
        }
        
        resolve(null);
      } finally {
        // Clean up the pending request
        setTimeout(() => {
          delete this.pendingRequests[pendingKey];
        }, 100); // Small delay to prevent immediate re-fetching
      }
    });
    
    // Store the promise in pending requests
    this.pendingRequests[pendingKey] = fetchPromise;
    return fetchPromise;
  }
  
  async saveCachedState(projectDirectory: string | null | undefined, key: string, value: string): Promise<void> {
    // Validate inputs
    if (!key) { 
      console.error('saveCachedState called with empty key');
      return; 
    }

    // For global keys, ensure consistent values
    const safeProjectDirectory = projectDirectory || 'global'; 

    // Create a cache key for this specific value
    const cacheKey = this.getCachedStateKey(safeProjectDirectory, key);
    
    // Ensure value is a string
    const safeValue = value === undefined || value === null ? "" : String(value);
    
    // Check if the value is actually different from what we have cached
    const cachedEntry = this.cachedStateCache[cacheKey];
    if (cachedEntry && cachedEntry.data === safeValue) {
      // Skip the API call if the value hasn't changed
      return;
    }
    
    // List of critical form input keys that need special treatment to prevent loss during HMR
    const criticalFormKeys = [
      'task-description', 
      'search-term', 
      'pasted-paths', 
      'pattern-description', 
      'title-regex', 
      'content-regex', 
      'is-regex-active'
    ];
    
    // Special handling for form inputs to prevent loss during hot reloading
    if (criticalFormKeys.includes(key)) {
      console.log(`[DB Client] Saving critical form input '${key}' with priority (length: ${safeValue.length})`);
      
      // Immediately update the cache for this input
      this.cachedStateCache[cacheKey] = {
        data: safeValue,
        timestamp: Date.now()
      };
      
      // Send the update without any debouncing for critical form inputs
      try {
        await this._sendCachedStateUpdate(safeProjectDirectory, key, safeValue, true);
        return; // Return early after special handling
      } catch (error) {
        console.error(`[DB Client] Error in priority '${key}' save:`, error);
        // Fall through to normal handling as backup
      }
    }
    
    // Special handling for project directory changes
    if (key === 'global-project-dir') {
      // Clear cache for the previous project directory
      if (cachedEntry && cachedEntry.data !== safeValue) {
        console.log(`[DB Client] Project directory changed from ${cachedEntry.data} to ${safeValue}, clearing relevant caches`);
        
        const oldProjectDir = cachedEntry.data;
        if (oldProjectDir) {
          // Clear all caches related to the old project
          this.clearCacheForProject(oldProjectDir);
        }
      }
      
      // Add rate limiting for project directory changes to prevent ping-pong
      if (cachedEntry) {
        const timeSinceLastUpdate = Date.now() - cachedEntry.timestamp;
        if (timeSinceLastUpdate < 200) { // 200ms cooldown
          console.log(`[DB Client] Rate limiting project directory update (${timeSinceLastUpdate}ms since last update)`);
          // Update the cache but delay the API call
          this.cachedStateCache[cacheKey] = {
            data: safeValue,
            timestamp: Date.now()
          };
          
          // Schedule the update after a delay
          setTimeout(() => {
            // Check if still the current value before sending
            if (this.cachedStateCache[cacheKey]?.data === safeValue) {
              this._sendCachedStateUpdate(safeProjectDirectory, key, safeValue);
            }
          }, 300);
          return;
        }
      }
    }
    
    // Only log for non-files keys to reduce noise
    if (!key.includes('files')) {
      console.log(`[DB Client] Saving cached state for ${key} (length: ${safeValue.length})`);
    }
    
    // Optimistically update the cache
    this.cachedStateCache[cacheKey] = {
      data: safeValue,
      timestamp: Date.now()
    };
    
    // Send the update, handle potential errors
    try {
        await this._sendCachedStateUpdate(safeProjectDirectory, key, safeValue);
    } catch (error) {
        console.error(`[DB Client] Failed to send cached state update for key '${key}'. Cache might be reverted by error handling in _sendCachedStateUpdate.`, error);
        // Optionally revert optimistic cache update here if needed, though _sendCachedStateUpdate might handle some cases
        // delete this.cachedStateCache[cacheKey]; // Example: Revert cache on failure
        throw error; // Re-throw so caller knows about the failure
    }
  }
  
  // Helper method to send cached state updates to the server
  private async _sendCachedStateUpdate(
    projectDirectory: string, 
    key: string, 
    value: string,
    isPriority: boolean = false
  ): Promise<void> {
    try {
      // For priority updates (like task description), use a more robust fetch with retry
      if (isPriority) {
        let retries = 0;
        const maxRetries = 3;
        
        while (retries < maxRetries) {
          try {
            const response = await fetch('/api/cached-state', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({ 
                projectDirectory,
                key, 
                value
              }),
            });
            
            if (response.ok) {
              console.log(`[DB Client] Priority save success for ${key} (attempt ${retries + 1})`);
              return; // Success, exit the function
            }
            
            // If we get here, the response was not ok
            retries++;
            
            if (retries < maxRetries) {
              // Wait before retry (exponential backoff)
              await new Promise(resolve => setTimeout(resolve, 200 * Math.pow(2, retries)));
            }
          } catch (fetchError) {
            console.error(`[DB Client] Error in priority fetch attempt ${retries + 1}:`, fetchError);
            retries++;
            
            if (retries < maxRetries) {
              // Wait before retry
              await new Promise(resolve => setTimeout(resolve, 200 * Math.pow(2, retries)));
            }
          }
        }
        
        // If we get here, all retries failed
        console.error(`[DB Client] All ${maxRetries} priority save attempts failed for ${key}`);
        return;
      }
      
      // Regular (non-priority) updates use the existing mechanism
      const response = await fetch('/api/cached-state', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          projectDirectory,
          key, 
          value
        }),
      });
      
      if (!response.ok) {
        // Try to parse the error response
        let errorData = { message: `HTTP error ${response.status}` };
        try {
          if (response.headers.get('content-type')?.includes('application/json')) {
            errorData = await response.json();
          } else {
            const text = await response.text();
            errorData.message = text || errorData.message;
          }
        } catch (parseError) {
          console.error("Failed to parse error response:", parseError);
        }
        
        console.error(`Failed to save cached state for ${key}:`, errorData);
      }
    } catch (error) {
      console.error(`Error in _sendCachedStateUpdate for ${key}:`, error);
    }
  }
  
  // Clear cache entry for a specific session
  clearCacheForSession(sessionId: string) {
    delete this.cache.sessionDetails[sessionId];
    delete this.cache.sessionWithRequests[`session_with_requests_${sessionId}`]; // Clear session with requests cache too
    console.log(`[DB Client] Cleared cache for session ${sessionId}`);
  }

  // Clear cache entry for a specific project's sessions list
  clearCacheForProjectSessions(projectDirectory: string) {
    const cacheKey = this.getCacheKey(projectDirectory);
    delete this.cache.sessions[cacheKey];
    console.log(`[DB Client] Cleared sessions list cache for project ${projectDirectory}`);
  }

  // Clear cache for session details specifically
  clearCacheForSessionDetails(sessionId: string) {
    this.clearCacheForSession(sessionId); // Use the combined function
  }
  // Clear entire cache, preserving critical HMR data
  clearCache() {
    const persistedCacheBeforeClear = (window as any).__PERSISTED_CACHED_STATE?.cachedStateCache || {};
    
    this.cache = {
      sessions: {},
      activeSessionIds: {},
      sessionDetails: {},
      sessionWithRequests: {},
    };
    this.cachedStateCache = {}; // Clear main state cache
    this.pendingRequests = {};
    console.log('[DB Client] Cache cleared, attempting to restore critical HMR data...');

    // Restore critical form data from persisted cache immediately after clearing
    try {
      if ((window as any).__PERSISTED_CACHED_STATE && persistedCacheBeforeClear) {
        const criticalKeys = [
          'task-description', 
          'search-term', 
          'pasted-paths', 
          'pattern-description', 
          'title-regex', 
          'content-regex', 
          'is-regex-active',
          'global-project-dir' // Also critical for context
          // Add any other keys deemed critical for HMR persistence
        ];
        
        let restoredCount = 0;
        Object.entries(persistedCacheBeforeClear).forEach(([key, value]) => {
          const keyParts = key.split('|');
          if (keyParts.length >= 2) { // Allow for keys like global|key or project|key
            const dataKey = keyParts.slice(1).join('|'); // Handle keys with '|' potentially
            if (criticalKeys.includes(dataKey)) {
              this.cachedStateCache[key] = value as any; // Restore to the now-empty cache
              restoredCount++;
            }
          }
        });
        console.log(`[DB Client] Restored ${restoredCount} critical HMR data entries after clear.`);
      } else {
         console.log('[DB Client] No persisted HMR state found to restore.');
      }
    } catch (error) {
      console.error('[DB Client] Error restoring critical HMR data after cache clear:', error);
    }
  }

  // Clear cache for a specific project directory
  clearCacheForProject(projectDirectory: string) {
    const cacheKey = this.getCacheKey(projectDirectory);
    delete this.cache.sessions[cacheKey];
    delete this.cache.activeSessionIds[cacheKey];
    
    // Also clear individual session caches that might belong to this project
    // This is less efficient but necessary without knowing which sessions belong here
    // A better approach might involve tagging cache entries by project
    
    // Note: sessionDetails cache uses session ID as key, so it's not directly
    // tied to project directory here. Use clearCacheForSession for specific sessions.
    
    console.log(`[DB Client] Cleared sessions and active session ID cache for project ${projectDirectory}`);
  }

  // Add clearCacheForSessionWithRequests
  clearCacheForSessionWithRequests(sessionId: string) {
    delete this.cache.sessionWithRequests[`session_with_requests_${sessionId}`];
    console.log(`[DB Client] Cleared cache for session with requests ${sessionId}`);
  }

  // Add the following utility function for retrying operations
  private async withRetry<T>(operation: () => Promise<T>, 
                           operationName: string, 
                           maxRetries: number = 3, 
                           retryDelay: number = 500): Promise<T> {
    let lastError: any;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error;
        
        // Only log and retry for network/temporary errors, not for validation or not found
        if (error instanceof Error && 
            (error.message.includes('network') || 
             error.message.includes('timeout') || 
             error.message.includes('failed to fetch'))) {
          console.warn(`[DB Client] ${operationName} failed (attempt ${attempt}/${maxRetries}):`, error);
          
          if (attempt < maxRetries) {
            // Wait with exponential backoff before retrying
            const delay = retryDelay * Math.pow(2, attempt - 1);
            console.log(`[DB Client] Retrying ${operationName} in ${delay}ms...`);
            await new Promise(resolve => setTimeout(resolve, delay));
          }
        } else {
          // For other types of errors, don't retry
          break;
        }
      }
    }
    
    // If we got here, all retries failed
    console.error(`[DB Client] ${operationName} failed after ${maxRetries} attempts:`, lastError);
    throw lastError;
  }
}

// Define the context type
interface DatabaseContextType {
  repository: DatabaseClient;
  isInitialized: boolean;
}

// Create the context with a default value
const DatabaseContext = createContext<DatabaseContextType | undefined>(undefined);

// Create a singleton instance of the client
const databaseClient = new DatabaseClient();

// Store a reference to the cached state that persists across hot module reloads
// This is a critical addition to prevent data loss during development HMR
if (typeof window !== 'undefined') {
  // Check if we already have cached state stored in window object
  if (!(window as any).__PERSISTED_CACHED_STATE) {
    // Initialize the persisted cache
    (window as any).__PERSISTED_CACHED_STATE = {
      cachedStateCache: {},
      lastSyncTime: Date.now()
    };
    console.log('[DB Context] Initialized persisted cached state');
  }
  
  // Function to sync our cache with the persisted one
  const syncCachedState = () => {
    try {
      // Merge the current cache with the persisted one
      const persistedCache = (window as any).__PERSISTED_CACHED_STATE;
      
      // Update the database client's cache from the persisted store
      if (persistedCache && persistedCache.cachedStateCache) {
        Object.entries(persistedCache.cachedStateCache).forEach(([key, value]) => {
          if (!databaseClient.cachedStateCache[key] || 
              databaseClient.cachedStateCache[key].timestamp < (value as any).timestamp) {
            databaseClient.cachedStateCache[key] = value as any;
          }
        });
      }
      
      // Also update the persisted cache with any new entries from our client
      (window as any).__PERSISTED_CACHED_STATE.cachedStateCache = {
        ...(window as any).__PERSISTED_CACHED_STATE.cachedStateCache,
        ...databaseClient.cachedStateCache
      };
      
      (window as any).__PERSISTED_CACHED_STATE.lastSyncTime = Date.now();
      console.log('[DB Context] Synced cached state with persisted store');
    } catch (error) {
      console.error('[DB Context] Error syncing cached state:', error);
    }
  };
  
  // Sync immediately when module loads
  syncCachedState();
  
  // Also expose the database client to window for debugging and recovery
  (window as any).__DATABASE_CLIENT = databaseClient;
  
  // Listen for beforeunload to ensure cache is persisted
  window.addEventListener('beforeunload', () => {
    (window as any).__PERSISTED_CACHED_STATE.cachedStateCache = {
      ...(window as any).__PERSISTED_CACHED_STATE.cachedStateCache,
      ...databaseClient.cachedStateCache
    };
    console.log('[DB Context] Persisted cached state before unload');
  });
  
  // Override the clear cache method to preserve critical data
  const originalClearCache = databaseClient.clearCache;
  databaseClient.clearCache = function() {
    // Call original method
    originalClearCache.call(this);
    
    // Then restore the critical form data from persisted cache
    try {
      const persistedCache = (window as any).__PERSISTED_CACHED_STATE;
      if (persistedCache && persistedCache.cachedStateCache) {
        const criticalKeys = [
          'task-description', 
          'search-term', 
          'pasted-paths', 
          'pattern-description', 
          'title-regex', 
          'content-regex', 
          'is-regex-active'
        ];
        
        // Filter for keys that contain critical form data 
        Object.entries(persistedCache.cachedStateCache).forEach(([key, value]) => {
          const keyParts = key.split('|');
          if (keyParts.length === 2) {
            const dataKey = keyParts[1];
            if (criticalKeys.includes(dataKey)) {
              this.cachedStateCache[key] = value as any;
              console.log(`[DB Context] Restored critical data: ${key}`);
            }
          }
        });
      }
    } catch (error) {
      console.error('[DB Context] Error restoring critical data after cache clear:', error);
    }
  };
}

// Provider component
export function DatabaseProvider({ children }: { children: ReactNode }) {
  const [isInitialized, setIsInitialized] = useState(false);
  
  useEffect(() => {
    // Perform any initialization logic here if needed
    setIsInitialized(true);
    
    // If we're in the browser, set up a periodic sync for the cache
    if (typeof window !== 'undefined') {
      const syncInterval = setInterval(() => {
        try {
          // Update the persisted cache with the current client cache
          (window as any).__PERSISTED_CACHED_STATE.cachedStateCache = {
            ...(window as any).__PERSISTED_CACHED_STATE.cachedStateCache,
            ...databaseClient.cachedStateCache
          };
          (window as any).__PERSISTED_CACHED_STATE.lastSyncTime = Date.now();
        } catch (error) {
          console.error('[DB Context] Error during periodic cache sync:', error);
        }
      }, 5000); // Sync every 5 seconds
      
      return () => {
        clearInterval(syncInterval);
      };
    }
  }, []);
  
  return (
    <DatabaseContext.Provider value={{ repository: databaseClient, isInitialized }}>
      {children}
    </DatabaseContext.Provider>
  );
}

// Custom hook to use the database context
export function useDatabase() {
  const context = useContext(DatabaseContext);
  if (context === undefined) {
    throw new Error('useDatabase must be used within a DatabaseProvider');
  }
  return context;
}
