"use client";

import { createContext, useContext, useState, ReactNode, useEffect } from "react";
import { Session } from "@/types/session-types";
import { OutputFormat } from "@/types";

// Define API client for database operations
class DatabaseClient {
  // Session operations
  async getSessions(projectDirectory: string, outputFormat: OutputFormat): Promise<Session[]> {
    const response = await fetch(`/api/sessions?projectDirectory=${encodeURIComponent(projectDirectory)}&outputFormat=${outputFormat}`);
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Failed to fetch sessions');
    }
    
    return response.json();
  }
  
  async getSession(sessionId: string): Promise<Session | null> {
    const response = await fetch(`/api/session?id=${encodeURIComponent(sessionId)}`);
    
    if (response.status === 404) {
      return null;
    }
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Failed to fetch session');
    }
    
    return response.json();
  }
  
  async saveSession(session: Session): Promise<Session> {
    const response = await fetch('/api/sessions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(session),
    });
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Failed to save session');
    }
    
    return response.json();
  }
  
  async deleteSession(sessionId: string): Promise<void> {
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
    const response = await fetch(`/api/project-settings?projectDirectory=${encodeURIComponent(projectDirectory)}&outputFormat=${outputFormat}`);
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Failed to fetch active session ID');
    }
    
    const data = await response.json();
    return data.activeSessionId;
  }
  
  async setActiveSession(projectDirectory: string, outputFormat: OutputFormat, sessionId: string | null): Promise<void> {
    const response = await fetch('/api/project-settings', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ projectDirectory, outputFormat, sessionId }),
    });
    
    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Failed to set active session');
    }
  }
  
  // Cached state operations
  async getCachedState(projectDirectory: string, outputFormat: OutputFormat, key: string): Promise<string | null> {
    console.log(`Getting cached state for ${projectDirectory}/${outputFormat}/${key}`);
    const response = await fetch(`/api/cached-state?projectDirectory=${encodeURIComponent(projectDirectory)}&outputFormat=${outputFormat}&key=${encodeURIComponent(key)}`);
    
    if (!response.ok) {
      const error = await response.json();
      console.error(`Failed to fetch cached state for ${key}:`, error);
      throw new Error(error.message || 'Failed to fetch cached state');
    }
    
    const data = await response.json();
    console.log(`Retrieved cached state for ${key}:`, data.value ? "Found" : "Not found");
    return data.value;
  }
  
  async saveCachedState(projectDirectory: string, outputFormat: OutputFormat, key: string, value: string): Promise<void> {
    console.log(`Saving cached state for ${projectDirectory}/${outputFormat}/${key}`);
    
    // Validate input parameters to ensure they're not undefined or invalid
    if (!projectDirectory || !outputFormat || key === undefined) {
      console.error("Invalid parameters for saveCachedState", { projectDirectory, outputFormat, key });
      throw new Error("Invalid parameters: projectDirectory, outputFormat, and key are required");
    }
    
    // Ensure value is a string (convert to empty string if undefined or null)
    const safeValue = value === undefined || value === null ? "" : String(value);
    
    try {
      const response = await fetch('/api/cached-state', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          projectDirectory, 
          outputFormat, 
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
        throw new Error(errorData.message || 'Failed to save cached state');
      }
      
      console.log(`Successfully saved cached state for ${key}`);
    } catch (error) {
      console.error(`Error in saveCachedState:`, error);
      throw error;
    }
  }
  
  // Migration
  async migrateFromLocalStorage(): Promise<void> {
    // No longer needed
    console.log('Migration from localStorage is no longer needed');
    return Promise.resolve();
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

export function DatabaseProvider({ children }: { children: ReactNode }) {
  const [isInitialized, setIsInitialized] = useState(false);
  
  useEffect(() => {
    // Simply mark as initialized immediately
    setIsInitialized(true);
  }, []);
  
  return (
    <DatabaseContext.Provider value={{ repository: databaseClient, isInitialized }}>
      {children}
    </DatabaseContext.Provider>
  );
}

// Hook to use the database context
export function useDatabase() {
  const context = useContext(DatabaseContext);
  if (context === undefined) {
    throw new Error("useDatabase must be used within a DatabaseProvider");
  }
  return context;
} 