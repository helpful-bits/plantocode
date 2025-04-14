"use client";

import { createContext, useContext, useState, ReactNode, useEffect, useRef } from "react";
import { Session } from "@/types/session-types";
import { OutputFormat } from "@/types";

// Cache interface
interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

interface Cache {
  sessions: Record<string, CacheEntry<Session[]>>;
  activeSessionIds: Record<string, CacheEntry<string | null>>;
  sessionDetails: Record<string, CacheEntry<Session | null>>;
}

// Define API client for database operations
class DatabaseClient {
  private cache: Cache = {
    sessions: {},
    activeSessionIds: {},
    sessionDetails: {}
  };
  
  private pendingRequests: Record<string, Promise<any>> = {};
  private readonly CACHE_TTL = 2000; // 2 seconds
  
  private getCacheKey(projectDirectory: string, outputFormat: string): string {
    return `${projectDirectory}|${outputFormat}`;
  }

  // Session operations
  async getSessions(projectDirectory: string, outputFormat: OutputFormat): Promise<Session[]> {
    const cacheKey = this.getCacheKey(projectDirectory, outputFormat);
    
    // Check cache first
    const cached = this.cache.sessions[cacheKey];
    if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
      console.log(`[DB Client] Using cached sessions for ${projectDirectory} / ${outputFormat}`);
      return cached.data;
    }
    
    // Check if there's a pending request for this
    if (this.pendingRequests[`sessions_${cacheKey}`]) {
      console.log(`[DB Client] Reusing pending request for sessions ${projectDirectory} / ${outputFormat}`);
      return this.pendingRequests[`sessions_${cacheKey}`];
    }
    
    console.log(`[DB Client] Fetching sessions for ${projectDirectory} / ${outputFormat}`);
    
    // Create and store the promise
    const fetchPromise = new Promise<Session[]>(async (resolve, reject) => {
      try {
        const response = await fetch(`/api/sessions?projectDirectory=${encodeURIComponent(projectDirectory)}&outputFormat=${outputFormat}`);
        
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
    
    const fetchPromise = new Promise<Session | null>(async (resolve, reject) => {
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
    if (!session.id || !session.projectDirectory || !session.outputFormat || !session.name) {
      console.error('[DB Client] Validation error - Missing required session fields:', {
        hasId: !!session.id,
        hasProjectDir: !!session.projectDirectory,
        hasOutputFormat: !!session.outputFormat,
        hasName: !!session.name,
      });
      throw new Error('Failed to save session: Missing required fields');
    }
    
    try {
      // Invalidate any cached data for this session and project
      const cacheKey = this.getCacheKey(session.projectDirectory, session.outputFormat);
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
          console.error('[DB Client] Error parsing error response:', parseError);
        }
        
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
  async getActiveSessionId(projectDirectory: string, outputFormat: OutputFormat): Promise<string | null> {
    const cacheKey = this.getCacheKey(projectDirectory, outputFormat);
    
    // Check cache first
    const cached = this.cache.activeSessionIds[cacheKey];
    if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
      console.log(`[DB Client] Using cached active session ID for ${projectDirectory} / ${outputFormat}`);
      return cached.data;
    }
    
    // Check for pending request
    if (this.pendingRequests[`activeSessionId_${cacheKey}`]) {
      console.log(`[DB Client] Reusing pending request for active session ID ${projectDirectory} / ${outputFormat}`);
      return this.pendingRequests[`activeSessionId_${cacheKey}`];
    }
    
    console.log(`[DB Client] Fetching active session ID for ${projectDirectory} / ${outputFormat}`);
    
    const fetchPromise = new Promise<string | null>(async (resolve, reject) => {
      try {
        const response = await fetch(`/api/project-settings?projectDirectory=${encodeURIComponent(projectDirectory)}&outputFormat=${outputFormat}`);
        
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
  
  async setActiveSession(projectDirectory: string, outputFormat: OutputFormat, sessionId: string | null): Promise<void> {
    console.log(`[DB Client] Setting active session for ${projectDirectory} / ${outputFormat} to ${sessionId}`);
    
    // Immediately update the cache to prevent subsequent redundant calls
    const cacheKey = this.getCacheKey(projectDirectory, outputFormat);
    this.cache.activeSessionIds[cacheKey] = {
      data: sessionId,
      timestamp: Date.now()
    };
    
    const response = await fetch('/api/project-settings', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ projectDirectory, outputFormat, sessionId }),
    });
    
    if (!response.ok) {
      // Invalidate cache on error
      delete this.cache.activeSessionIds[cacheKey];
      
      const error = await response.json();
      throw new Error(error.message || 'Failed to set active session');
    }
  }
  
  // Cached state operations
  async getCachedState(projectDirectory: string, outputFormat: OutputFormat, key: string): Promise<string | null> {
    // Validate inputs to prevent common error cases
    if (!key) {
      console.error('getCachedState called with empty key');
      return null;
    }

    // For global keys, ensure consistent values
    const safeProjectDirectory = projectDirectory || 'global'; // Use 'global' if projectDirectory is empty/null
    const safeOutputFormat = outputFormat || 'global'; // Use 'global' if outputFormat is empty/null

    try {
      console.log(`[DB Client] Getting cached state for ${safeProjectDirectory}/${safeOutputFormat}/${key}`);
      const response = await fetch(`/api/cached-state?projectDirectory=${encodeURIComponent(safeProjectDirectory)}&outputFormat=${safeOutputFormat}&key=${encodeURIComponent(key)}`);
      
      if (!response.ok) {
        const error = await response.json(); // Parse error response
        console.error(`Failed to fetch cached state for ${key}:`, error);
        // Return null instead of throwing to avoid breaking callers
        return null;
      }
      
      const data = await response.json();
      console.log(`[DB Client] Retrieved cached state for ${key}:`, data.value ? `Found (length: ${data.value?.length})` : "Not found");
      return data.value;
    } catch (error) {
      console.error(`Error fetching cached state for ${key}:`, error);
      // Return null instead of throwing to avoid breaking callers
      return null;
    }
  }
  
  async saveCachedState(projectDirectory: string, outputFormat: OutputFormat, key: string, value: string): Promise<void> {
    // Validate inputs to prevent common error cases
    if (!key) {
      console.error('saveCachedState called with empty key');
      return;
    }

    // For global keys, ensure consistent values
    const safeProjectDirectory = projectDirectory || 'global'; // Use 'global' if projectDirectory is empty/null
    const safeOutputFormat = outputFormat || 'global'; // Use 'global' if outputFormat is empty/null
    
    console.log(`[DB Client] Saving cached state for ${safeProjectDirectory}/${safeOutputFormat}/${key} (value length: ${value?.length})`);
    
    // Ensure value is a string (convert to empty string if undefined or null)
    const safeValue = value === undefined || value === null ? "" : String(value);
    
    try {
      const response = await fetch('/api/cached-state', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          projectDirectory: safeProjectDirectory, 
          outputFormat: safeOutputFormat, 
          key, 
          value: safeValue 
        }),
      });
      
      if (!response.ok) {
        // Try to parse the error response, but handle case where it might not be valid JSON
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
        return; // Don't throw to avoid breaking callers
      }
      
      console.log(`[DB Client] Successfully saved cached state for ${key}`);
    } catch (error) {
      console.error(`Error in saveCachedState:`, error);
      // Don't throw to avoid breaking callers
    }
  }
  
  // Clear cache method for manual invalidation
  clearCache() {
    this.cache = {
      sessions: {},
      activeSessionIds: {},
      sessionDetails: {}
    };
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
