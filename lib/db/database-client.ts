import { sessionRepository } from './index';
import connectionPool from './connection-pool';
import { hashString } from '@/lib/hash';
import { Session, GeminiStatus } from '@/types';

// Cache implementation to match the one in database-context.tsx
interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

// Cache TTL in milliseconds (2 seconds)
const CACHE_TTL = 2000;

// Cache for active session IDs and cached state
const cache = {
  activeSessionIds: {} as Record<string, CacheEntry<string | null>>,
  cachedState: {} as Record<string, CacheEntry<string | null>>
};

// Helper function to create cache keys
function getCacheKey(projectDirectory: string): string {
  return projectDirectory;
}

function getCachedStateKey(projectDirectory: string | null | undefined, key: string): string {
  const safeDir = projectDirectory || 'global';
  return `${safeDir}:${key}`;
}

/**
 * Helper to check if a table exists in the database
 */
async function tableExists(tableName: string): Promise<boolean> {
  return connectionPool.withConnection(async (db) => {
    return new Promise<boolean>((resolve, reject) => {
      db.get(
        `SELECT name FROM sqlite_master WHERE type='table' AND name=?`,
        [tableName],
        (err, row) => {
          if (err) {
            console.error(`Error checking if table ${tableName} exists:`, err);
            reject(err);
          } else {
            resolve(!!row);
          }
        }
      );
    });
  }, true);
}

// Implementation of missing API functions
export async function getActiveSessionId(projectDirectory: string): Promise<string | null> {
  console.log(`[DB Client] Getting active session ID for ${projectDirectory}`);
  
  // Check cache first
  const cacheKey = getCacheKey(projectDirectory);
  const cached = cache.activeSessionIds[cacheKey];
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    console.log(`[DB Client] Using cached active session ID for ${projectDirectory}`);
    return cached.data;
  }
  
  // Check if table exists before querying
  const exists = await tableExists('active_sessions');
  if (!exists) {
    console.log(`[DB Client] active_sessions table does not exist yet. Returning null.`);
    
    // Update cache
    cache.activeSessionIds[cacheKey] = {
      data: null,
      timestamp: Date.now()
    };
    
    return null;
  }
  
  // Calculate a hash for safer SQL queries
  const projectHash = hashString(projectDirectory);
  
  return connectionPool.withConnection(async (db) => {
    return new Promise<string | null>((resolve, reject) => {
      db.get(
        `SELECT session_id FROM active_sessions WHERE project_hash = ?`,
        [projectHash],
        (err, row: any) => {
          if (err) {
            console.error("Error getting active session ID:", err);
            reject(err);
          } else {
            const sessionId = row ? row.session_id : null;
            
            // Update cache
            cache.activeSessionIds[cacheKey] = {
              data: sessionId,
              timestamp: Date.now()
            };
            
            resolve(sessionId);
          }
        }
      );
    });
  }, true); // Use read-only connection
}

export async function setActiveSession(projectDirectory: string, sessionId: string | null): Promise<void> {
  console.log(`[DB Client] Setting active session for ${projectDirectory} to ${sessionId || 'null'}`);
  
  // Update cache immediately for faster UI updates
  const cacheKey = getCacheKey(projectDirectory);
  cache.activeSessionIds[cacheKey] = {
    data: sessionId,
    timestamp: Date.now()
  };
  
  // Check if table exists before querying
  const exists = await tableExists('active_sessions');
  if (!exists) {
    console.log(`[DB Client] active_sessions table does not exist yet. Skipping database update.`);
    return;
  }
  
  // Calculate a hash for safer SQL queries
  const projectHash = hashString(projectDirectory);
  
  return connectionPool.withConnection(async (db) => {
    return new Promise<void>((resolve, reject) => {
      if (sessionId === null) {
        // Delete the active session record if sessionId is null
        db.run(
          `DELETE FROM active_sessions WHERE project_hash = ?`,
          [projectHash],
          (err) => {
            if (err) {
              console.error("Error clearing active session:", err);
              reject(err);
            } else {
              resolve();
            }
          }
        );
      } else {
        // Insert or replace the active session
        db.run(
          `INSERT OR REPLACE INTO active_sessions (project_directory, project_hash, session_id, updated_at)
           VALUES (?, ?, ?, ?)`,
          [projectDirectory, projectHash, sessionId, Date.now()],
          (err) => {
            if (err) {
              console.error("Error setting active session:", err);
              reject(err);
            } else {
              resolve();
            }
          }
        );
      }
    });
  });
}

export async function getCachedState(projectDirectory: string | null | undefined, key: string): Promise<string | null> {
  if (!key) {
    console.error('getCachedState called with empty key');
    return null;
  }
  
  const safeProjectDirectory = projectDirectory || 'global';
  console.log(`[DB Client] Getting cached state for ${safeProjectDirectory}:${key}`);
  
  // Check cache first
  const cacheKey = getCachedStateKey(safeProjectDirectory, key);
  const cached = cache.cachedState[cacheKey];
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    console.log(`[DB Client] Using cached state for ${safeProjectDirectory}:${key}`);
    return cached.data;
  }
  
  // Check if table exists before querying
  const exists = await tableExists('cached_state');
  if (!exists) {
    console.log(`[DB Client] cached_state table does not exist yet. Returning null.`);
    
    // Update cache
    cache.cachedState[cacheKey] = {
      data: null,
      timestamp: Date.now()
    };
    
    return null;
  }
  
  // Calculate a hash for safer SQL queries
  const projectHash = hashString(safeProjectDirectory);
  
  return connectionPool.withConnection(async (db) => {
    return new Promise<string | null>((resolve, reject) => {
      db.get(
        `SELECT value FROM cached_state WHERE project_hash = ? AND key = ?`,
        [projectHash, key],
        (err, row: any) => {
          if (err) {
            console.error("Error getting cached state:", err);
            reject(err);
          } else {
            const value = row ? row.value : null;
            
            // Update cache
            cache.cachedState[cacheKey] = {
              data: value,
              timestamp: Date.now()
            };
            
            resolve(value);
          }
        }
      );
    });
  }, true); // Use read-only connection
}

export async function saveCachedState(projectDirectory: string | null | undefined, key: string, value: string): Promise<void> {
  if (!key) {
    console.error('saveCachedState called with empty key');
    return;
  }
  
  const safeProjectDirectory = projectDirectory || 'global';
  console.log(`[DB Client] Saving cached state for ${safeProjectDirectory}:${key}`);
  
  // Update cache immediately
  const cacheKey = getCachedStateKey(safeProjectDirectory, key);
  cache.cachedState[cacheKey] = {
    data: value,
    timestamp: Date.now()
  };
  
  // Check if table exists before querying
  const exists = await tableExists('cached_state');
  if (!exists) {
    console.log(`[DB Client] cached_state table does not exist yet. Skipping database update.`);
    return;
  }
  
  // Calculate a hash for safer SQL queries
  const projectHash = hashString(safeProjectDirectory);
  
  return connectionPool.withConnection(async (db) => {
    return new Promise<void>((resolve, reject) => {
      // Insert with the project_directory field
      db.run(
        `INSERT OR REPLACE INTO cached_state (project_directory, project_hash, key, value, updated_at)
         VALUES (?, ?, ?, ?, ?)`,
        [safeProjectDirectory, projectHash, key, value, Date.now()],
        (err) => {
          if (err) {
            console.error("Error saving cached state:", err);
            reject(err);
          } else {
            resolve();
          }
        }
      );
    });
  });
}

/**
 * Get all sessions for a project directory
 */
export async function getSessions(projectDirectory: string): Promise<Session[]> {
  console.log(`[DB Client] Getting sessions for project: ${projectDirectory}`);
  
  if (!projectDirectory) {
    console.error('[DB Client] Project directory is required to get sessions');
    return [];
  }
  
  // Calculate a hash for safer SQL queries
  const projectHash = hashString(projectDirectory);
  
  return connectionPool.withConnection(async (db) => {
    return new Promise<Session[]>((resolve, reject) => {
      db.all(
        `SELECT * FROM sessions WHERE project_hash = ? ORDER BY updated_at DESC`,
        [projectHash],
        async (err, rows: any[]) => {
          if (err) {
            console.error("Error fetching sessions:", err);
            reject(err);
          } else {
            // Process each session to include files
            const sessions: Session[] = [];
            
            for (const row of rows) {
              try {
                // Get included files
                const includedFiles = await new Promise<string[]>((resolveFiles, rejectFiles) => {
                  db.all(
                    `SELECT file_path FROM included_files WHERE session_id = ?`, 
                    [row.id], 
                    (fileErr, fileRows: any[]) => {
                      if (fileErr) {
                        console.error("Error fetching included files:", fileErr);
                        rejectFiles(fileErr);
                      } else {
                        resolveFiles(fileRows.map(r => r.file_path));
                      }
                    }
                  );
                });
                
                // Get excluded files
                const excludedFiles = await new Promise<string[]>((resolveFiles, rejectFiles) => {
                  db.all(
                    `SELECT file_path FROM excluded_files WHERE session_id = ?`, 
                    [row.id], 
                    (fileErr, fileRows: any[]) => {
                      if (fileErr) {
                        console.error("Error fetching excluded files:", fileErr);
                        rejectFiles(fileErr);
                      } else {
                        resolveFiles(fileRows.map(r => r.file_path));
                      }
                    }
                  );
                });
                
                // Create session object
                const session: Session = {
                  id: row.id,
                  name: row.name || '',
                  projectDirectory: row.project_directory || '',
                  taskDescription: row.task_description || '',
                  searchTerm: row.search_term || '',
                  pastedPaths: row.pasted_paths || '',
                  titleRegex: row.title_regex || '',
                  contentRegex: row.content_regex || '',
                  isRegexActive: !!row.is_regex_active,
                  diffTemperature: row.diff_temperature || 0.9,
                  includedFiles: [],
                  forceExcludedFiles: [],
                  geminiStatus: (row.gemini_status || 'idle') as GeminiStatus,
                  geminiStartTime: row.gemini_start_time || null,
                  geminiEndTime: row.gemini_end_time || null,
                  geminiXmlPath: row.gemini_xml_path || row.gemini_patch_path || null,
                  geminiStatusMessage: row.gemini_status_message || null,
                  geminiTokensReceived: row.gemini_tokens_received || 0,
                  geminiCharsReceived: row.gemini_chars_received || 0,
                  geminiLastUpdate: row.gemini_last_update || null,
                  updatedAt: row.updated_at || 0
                };
                
                sessions.push(session);
              } catch (error) {
                console.error(`Error processing session ${row.id}:`, error);
                // Continue with next session instead of rejecting the whole promise
              }
            }
            
            resolve(sessions);
          }
        }
      );
    });
  }, true); // Use read-only connection
}

/**
 * Delete a session by ID
 */
export async function deleteSession(sessionId: string): Promise<void> {
  console.log(`[DB Client] Deleting session: ${sessionId}`);
  
  if (!sessionId) {
    console.error('[DB Client] Session ID is required for deletion');
    throw new Error('Session ID is required for deletion');
  }
  
  return connectionPool.withConnection(async (db) => {
    return new Promise<void>((resolve, reject) => {
      // Delete the session - cascade will handle related records
      db.run(
        `DELETE FROM sessions WHERE id = ?`,
        [sessionId],
        (err) => {
          if (err) {
            console.error("Error deleting session:", err);
            reject(err);
          } else {
            resolve();
          }
        }
      );
    });
  });
}

/**
 * Get a session with all of its Gemini requests
 */
export async function getSessionWithRequests(sessionId: string): Promise<Session | null> {
  console.log(`[DB Client] Getting session with requests: ${sessionId}`);
  
  try {
    // First, get the session using the existing getSession function
    const session = await sessionRepository.getSession(sessionId);
    if (!session) {
      console.log(`[DB Client] Session ${sessionId} not found`);
      return null;
    }
    
    // Then, get the Gemini requests for this session
    // Use the existing getGeminiRequests function from sessionRepository
    const requests = await sessionRepository.getGeminiRequests(sessionId);
    
    // Create a new session object with the requests
    const sessionWithRequests: Session = {
      ...session,
      geminiRequests: requests
    };
    
    return sessionWithRequests;
  } catch (error) {
    console.error(`[DB Client] Error fetching session with requests:`, error);
    throw error;
  }
}

// Re-export session repository methods for convenience
export { sessionRepository };