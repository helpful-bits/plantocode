"use client";
 
import { createContext, useContext, useState, ReactNode, useEffect } from "react";
import { Session } from "@/types/session-types"; // Keep Session import
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
}

// Define API client for database operations
class DatabaseClient {
  private cache: DatabaseClientCache = { // Use renamed interface
    sessions: {},
    activeSessionIds: {},
    sessionDetails: {}
  };
  
  private cachedStateCache: Record<string, CacheEntry<string | null>> = {}; // Add cache for cached state
  private pendingRequests: Record<string, Promise<any>> = {};
  private readonly CACHE_TTL = 2000; // 2 seconds
  private readonly CACHED_STATE_TTL = 10000; // 10 seconds TTL for cached state values

  // Removed outputFormat from cache keys
  private getCacheKey(projectDirectory: string): string {
    return `${projectDirectory}`;
  }
  
  private getSessionCacheKey(sessionId: string): string {
      return `session_${sessionId}`;
  }

  // Session operations - Removed outputFormat parameter
  async getSessions(projectDirectory: string): Promise<Session[]> {
    const cacheKey = this.getCacheKey(projectDirectory); // Removed outputFormat
    
    // Check cache first
    const cached = this.cache.sessions[cacheKey];
    if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
      console.log(`[DB Client] Using cached sessions for ${projectDirectory}`);
      return cached.data;
    }
    
    // Check if there's a pending request for this
    if (this.pendingRequests[`sessions_${cacheKey}`]) {
      console.log(`[DB Client] Reusing pending request for sessions ${projectDirectory}`); // Removed outputFormat
      return this.pendingRequests[`sessions_${cacheKey}`];
    }
    
    console.log(`[DB Client] Fetching sessions for ${projectDirectory}`); // Removed outputFormat
    
    // Create and store the promise - removed outputFormat from API call
    const fetchPromise = new Promise<Session[]>(async (resolve, reject) => {
      try {
        const response = await fetch(`/api/sessions?projectDirectory=${encodeURIComponent(projectDirectory)}`);
        
        if (!response.ok) {
          const error = await response.json();
          throw new Error(error.message || 'Failed to fetch sessions');
        }
        
        const data = await response.json();
        
        // Update cache
        this.cache.sessions[cacheKey] = {
          data,
          timestamp: Date.now()
        };
        
        resolve(data);
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
        
        if (response.status === 404) {
          this.cache.sessionDetails[sessionId] = {
            data: null,
            timestamp: Date.now()
          };
          resolve(null);
          return;
        }
        
        if (!response.ok) {
          const error = await response.json();
          throw new Error(error.message || 'Failed to fetch session');
        }
        
        const data = await response.json();
        
        // Update cache
        this.cache.sessionDetails[sessionId] = {
          data,
          timestamp: Date.now()
        };
        
        resolve(data);
      } catch (error) {
        reject(error);
      } finally {
        delete this.pendingRequests[`session_${sessionId}`];
      }
    });
    
    this.pendingRequests[`session_${sessionId}`] = fetchPromise;
    return fetchPromise;
  }
  
  async saveSession(session: Session): Promise<Session> {
    console.log(`[DB Client] Saving session ${session.id} (${session.name})`);
    
    // Validate session object before sending to API
    if (!session.id || !session.projectDirectory || !session.name) {
      console.error('[DB Client] Validation error - Missing required session fields:', {
        hasId: !!session.id,
        hasProjectDir: !!session.projectDirectory,
        hasName: !!session.name,
      });
      throw new Error('Failed to save session: Missing required fields');
    }
    
    try {
      // Invalidate any cached data for this session and project
      const cacheKey = this.getCacheKey(session.projectDirectory);
      delete this.cache.sessionDetails[session.id];
      delete this.cache.sessions[cacheKey];
      
      const response = await fetch('/api/sessions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(session),
      });
      
      // Handle non-ok responses
      if (!response.ok) {
        // Try to get detailed error information
        let errorMessage = 'Failed to save session';
        try {
          const errorData = await response.json();
          errorMessage = errorData.error || errorMessage;
        } catch (parseError) {
          console.error('[DB Client] Error parsing error response:', parseError);        } // Close catch block
        
        console.error(`[DB Client] HTTP error saving session: ${response.status} ${response.statusText}`, { errorMessage });
        throw new Error(errorMessage);
      }
      
      const savedSession = await response.json();
      
      // Update cache with saved session
      this.cache.sessionDetails[savedSession.id] = {
        data: savedSession,
        timestamp: Date.now()
      };
      
      return savedSession;
    } catch (error) {
      console.error('[DB Client] Exception saving session:', error);
      throw new Error(error instanceof Error ? error.message : 'Failed to save session');
    }
  }
  
  async deleteSession(sessionId: string): Promise<void> {
    console.log(`[DB Client] Deleting session ${sessionId}`);
    
    // Invalidate caches related to sessions
    delete this.cache.sessionDetails[sessionId];
    this.cache.sessions = {}; // Clear all sessions cache as the list has changed
    
    const response = await fetch(`/api/sessions?id=${encodeURIComponent(sessionId)}`, {
      method: 'DELETE',
    });
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Failed to delete session');
    }
  }
  
  // Project settings operations
  async getActiveSessionId(projectDirectory: string): Promise<string | null> { // Removed outputFormat
    const cacheKey = this.getCacheKey(projectDirectory); // Removed outputFormat
    
    // Check cache first
    const cached = this.cache.activeSessionIds[cacheKey]; // Keep cache check
    if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
      console.log(`[DB Client] Using cached active session ID for ${projectDirectory}`);
      return cached.data;
    }
    
    // Check for pending request
    if (this.pendingRequests[`activeSessionId_${cacheKey}`]) {
      console.log(`[DB Client] Reusing pending request for active session ID ${projectDirectory}`); // Removed outputFormat
      return this.pendingRequests[`activeSessionId_${cacheKey}`];
    }
    
    console.log(`[DB Client] Fetching active session ID for ${projectDirectory}`); // Removed outputFormat
    
    const fetchPromise = new Promise<string | null>(async (resolve, reject) => { // Removed outputFormat from API call
      try {
        const response = await fetch(`/api/project-settings?projectDirectory=${encodeURIComponent(projectDirectory)}`);
        
        if (!response.ok) {
          const error = await response.json();
          throw new Error(error.message || 'Failed to fetch active session ID');
        }
        
        const data = await response.json();
        
        // Update cache
        this.cache.activeSessionIds[cacheKey] = {
          data: data.activeSessionId,
          timestamp: Date.now()
        };
        
        resolve(data.activeSessionId);
      } catch (error) {
        reject(error);
      } finally {
        delete this.pendingRequests[`activeSessionId_${cacheKey}`];
      }
    });
    
    this.pendingRequests[`activeSessionId_${cacheKey}`] = fetchPromise;
    return fetchPromise;
  }
  
  async setActiveSession(projectDirectory: string, sessionId: string | null): Promise<void> { // Removed outputFormat
    // Skip if either projectDirectory or outputFormat is missing
    if (!projectDirectory) { // Removed outputFormat check
      console.error('[DB Client] Cannot set active session: Missing projectDirectory'); // Updated error message
      return;
    }

    // Create a cache key
    const cacheKey = this.getCacheKey(projectDirectory); // Removed outputFormat
    
    // Check if we already have this exact sessionId in cache and it's still valid
    const cachedData = this.cache.activeSessionIds[cacheKey];
    if (cachedData && cachedData.data === sessionId && Date.now() - cachedData.timestamp < this.CACHE_TTL * 5) {
      // Skip API call if we're setting the same session ID that's already cached
      console.log(`[DB Client] Skipping redundant setActiveSession for ${projectDirectory}: ${sessionId} (already set)`); // Removed outputFormat
      return;
    }
    
    // Check if there's a pending request with the same details
    const pendingKey = `setActiveSession_${cacheKey}_${sessionId || 'null'}`;
    if (this.pendingRequests[pendingKey]) { 
      console.log(`[DB Client] Reusing pending setActiveSession request for ${projectDirectory}`);
      return this.pendingRequests[pendingKey];
    }

    console.log(`[DB Client] Setting active session for ${projectDirectory} to ${sessionId}`);
    
    // Immediately update the cache to prevent subsequent redundant calls
    this.cache.activeSessionIds[cacheKey] = {
      data: sessionId,
      timestamp: Date.now()
    };

    // Create a promise for the API call
    const savePromise = new Promise<void>(async (resolve, reject) => {
      try {
        const response = await fetch('/api/project-settings', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ projectDirectory, sessionId }), // Removed outputFormat
        });
        
        if (!response.ok) {
          // Invalidate cache on error
          delete this.cache.activeSessionIds[cacheKey];
          
          const error = await response.json();
          throw new Error(error.message || 'Failed to set active session');
        }
        
        resolve();
      } catch (error) {
        console.error('[DB Client] Error in setActiveSession:', error);
        reject(error);
      } finally {
        // Clean up the pending request
        delete this.pendingRequests[pendingKey];
      }
    });
    
    // Store the promise
    this.pendingRequests[pendingKey] = savePromise;
    return savePromise;
  }
  
  // Cached state operations
  async getCachedState(projectDirectory: string, key: string): Promise<string | null> { // Removed outputFormat
    // Validate inputs to prevent common error cases
    if (!key) {
      console.error('getCachedState called with empty key');
      return null;
    }
    
    // For global keys, ensure consistent values - removed outputFormat reference
    const safeProjectDirectory = projectDirectory || 'global'; // Use 'global' if projectDirectory is empty/null
    
    // Create a cache key for this specific request - removed outputFormat
    const cacheKey = `${safeProjectDirectory}|${key}`;
    
    // Check if we have a cached value that's still valid
    const cachedEntry = this.cachedStateCache[cacheKey];
    if (cachedEntry && Date.now() - cachedEntry.timestamp < this.CACHED_STATE_TTL) {
      // Quietly use the cached value without logging
      return cachedEntry.data;
    }
    
    // Check if there's already a pending request for this exact data
    const pendingKey = `cachedState_${cacheKey}`;
    if (this.pendingRequests[pendingKey]) {
      // Return the existing promise to avoid duplicate requests
      return this.pendingRequests[pendingKey];
    }

    // If verbose logging is needed for debugging, uncomment this:
    // console.log(`[DB Client] Getting cached state for ${safeProjectDirectory}/${key}`);
    
    // Create a new promise for this request
    const fetchPromise = new Promise<string | null>(async (resolve, reject) => {
      try {
        const response = await fetch(`/api/cached-state?projectDirectory=${encodeURIComponent(safeProjectDirectory)}&key=${encodeURIComponent(key)}`); // Removed outputFormat
        
        if (!response.ok) {
          try {
            const error = await response.json(); // Try to parse error response
            console.error(`Failed to fetch cached state for ${key}:`, error);
          } catch (parseError) {
            // Handle case where response isn't valid JSON
            console.error(`Failed to fetch cached state for ${key}: ${response.status} ${response.statusText}`);
          }
          resolve(null);
          return;
        }
        
        const data = await response.json();
        
        // Cache the result (even if null)
        this.cachedStateCache[cacheKey] = {
          data: data.value,
          timestamp: Date.now()
        };
        
        resolve(data.value);
      } catch (error) {
        console.error(`Error fetching cached state for ${key}:`, error);
        resolve(null);
      } finally {
        // Clean up the pending request
        delete this.pendingRequests[pendingKey];
      }
    });
    
    // Store the promise in pending requests
    this.pendingRequests[pendingKey] = fetchPromise;
    return fetchPromise;
  }
  
  async saveCachedState(projectDirectory: string, key: string, value: string): Promise<void> { // Removed outputFormat
    // Validate inputs to prevent common error cases
    if (!key) { 
      console.error('saveCachedState called with empty key');
      return; 
    }

    // For global keys, ensure consistent values - removed outputFormat reference
    const safeProjectDirectory = projectDirectory || 'global'; 
    
    // Create a cache key for this specific value - removed outputFormat
    const cacheKey = `${safeProjectDirectory}|${key}`;
    
    // Ensure value is a string
    const safeValue = value === undefined || value === null ? "" : String(value);
    
    // Check if the value is actually different from what we have cached
    const cachedEntry = this.cachedStateCache[cacheKey];
    if (cachedEntry && cachedEntry.data === safeValue) {
      // Skip the API call if the value hasn't changed
      return;
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
    
    try {
      const response = await fetch('/api/cached-state', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          projectDirectory: safeProjectDirectory,
          key, 
          value: safeValue 
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
        return;
      }
      
      // Don't log success to reduce console noise
    } catch (error) {
      console.error(`Error in saveCachedState:`, error);
    }
  }
  
  // Clear cache entry for a specific session
  clearCacheForSession(sessionId: string) {
    delete this.cache.sessionDetails[sessionId];
    console.log(`[DB Client] Cleared cache for session ${sessionId}`);
  }
  // Clear cache method for manual invalidation
  clearCache() {
    this.cache = {
      sessions: {},
      activeSessionIds: {},
      sessionDetails: {}
    };
    this.cachedStateCache = {};
    this.pendingRequests = {};
    console.log('[DB Client] Cache cleared');
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

// Provider component
export function DatabaseProvider({ children }: { children: ReactNode }) {
  const [isInitialized, setIsInitialized] = useState(false);
  useEffect(() => {
    // Perform any initialization logic here if needed
    setIsInitialized(true);
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
