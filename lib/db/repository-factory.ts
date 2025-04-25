import connectionPool from './connection-pool';
import { Session, GeminiStatus, GeminiRequest } from '@/types';
import { hashString } from '@/lib/hash';
import { normalizePath } from '../path-utils';
import crypto from 'crypto';

/**
 * Creates a SessionRepository instance that uses the connection pool
 * for better concurrent database access
 */
export function createSessionRepository() {
  return {
    /**
     * Save a session to the database (create or update)
     */
    saveSession: async (session: Session): Promise<Session> => {
      console.log(`[Repo] saveSession called for ID: ${session.id} - Name: ${session.name}`);
      
      // Calculate hash for project directory
      const projectHash = hashString(session.projectDirectory);
      
      // Use the connection pool with transaction
      return connectionPool.withTransaction(async (db) => {
        try {
          // First check if the sessions table exists and get column info
          const columnsResult = await new Promise<any[]>((resolve, reject) => {
            db.all("PRAGMA table_info(sessions)", [], (err, rows) => {
              if (err) {
                reject(err);
                return;
              }
              resolve(rows || []);
            });
          });
          
          // Check if model_used column exists (for backward compatibility)
          const hasModelUsed = columnsResult.some(col => col.name === 'model_used');
          
          // Prepare data for insertion/replacement
          const sessionValues = [
            session.id,
            session.name,
            session.projectDirectory,
            projectHash,
            session.taskDescription || '',
            session.searchTerm || '',
            session.pastedPaths || '',
            session.titleRegex || '',
            session.contentRegex || '',
            session.isRegexActive ? 1 : 0,
            session.diffTemperature || 0.9, // Default to 0.9 if not provided
            '', // Empty codebase structure
            Date.now() // Updated timestamp
          ];
          
          // Add model_used if the column exists
          if (hasModelUsed) {
            sessionValues.push(session.modelUsed || 'gemini-2.5-flash-preview-04-17');
          }
          
          // Build SQL statement with conditional model_used column
          let sql = `
            INSERT OR REPLACE INTO sessions
            (id, name, project_directory, project_hash, task_description, search_term, pasted_paths,
             title_regex, content_regex, is_regex_active, diff_temperature, codebase_structure, updated_at`;
          
          if (hasModelUsed) {
            sql += `, model_used`;
          }
          
          sql += `)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?`;
          
          if (hasModelUsed) {
            sql += `, ?`;
          }
          
          sql += `)`;
          
          // Insert or replace the session
          await new Promise<void>((resolve, reject) => {
            db.run(sql, sessionValues, function(err) {
              if (err) {
                console.error("Error saving session:", err);
                return reject(err);
              }
              resolve();
            });
          });
          
          // Return the updated session
          return {
            ...session,
            projectHash,
            updatedAt: Date.now()
          };
        } catch (error) {
          console.error("Error in saveSession:", error);
          throw error;
        }
      });
    },
    
    /**
     * Get a session by ID
     */
    getSession: async (sessionId: string): Promise<Session | null> => {
      console.log(`[Repo] Getting session by ID: ${sessionId}`);
      
      return connectionPool.withConnection(async (db) => {
        return new Promise<Session | null>((resolve, reject) => {
          db.get(`SELECT * FROM sessions WHERE id = ?`, [sessionId], async (err, row: any) => {
            if (err) {
              console.error("Error fetching session:", err);
              return reject(err);
            }
            
            if (!row) {
              return resolve(null);
            }
            
            // Fetch included files
            let includedFiles: string[] = [];
            try {
              includedFiles = await new Promise<string[]>((resolveFiles, rejectFiles) => {
                db.all(`SELECT file_path FROM included_files WHERE session_id = ?`, [sessionId], (fileErr, rows: any[]) => {
                  if (fileErr) {
                    console.error("Error fetching included files:", fileErr);
                    return rejectFiles(fileErr);
                  }
                  resolveFiles(rows.map(r => r.file_path));
                });
              });
            } catch (error) {
              console.error("Error fetching included files:", error);
              includedFiles = [];
            }
            
            // Fetch excluded files
            let excludedFiles: string[] = [];
            try {
              excludedFiles = await new Promise<string[]>((resolveFiles, rejectFiles) => {
                db.all(`SELECT file_path FROM excluded_files WHERE session_id = ?`, [sessionId], (fileErr, rows: any[]) => {
                  if (fileErr) {
                    console.error("Error fetching excluded files:", fileErr);
                    return rejectFiles(fileErr);
                  }
                  resolveFiles(rows.map(r => r.file_path));
                });
              });
            } catch (error) {
              console.error("Error fetching excluded files:", error);
              excludedFiles = [];
            }
            
            // Create and return the Session object
            const session: Session = {
              id: row.id,
              name: row.name,
              projectDirectory: row.project_directory || '',
              taskDescription: row.task_description || '',
              searchTerm: row.search_term || '',
              pastedPaths: row.pasted_paths || '',
              titleRegex: row.title_regex || '',
              contentRegex: row.content_regex || '',
              isRegexActive: !!row.is_regex_active,
              diffTemperature: row.diff_temperature || 0.9,
              modelUsed: row.model_used || 'gemini-2.5-flash-preview-04-17',
              includedFiles,
              forceExcludedFiles: excludedFiles,
            };
            
            resolve(session);
          });
        });
      }, true); // Use read-only connection
    },
    
    createGeminiRequest: async (sessionId: string,
      prompt: string
    ): Promise<GeminiRequest> => {
      console.log(`[Repo] Creating Gemini request for session: ${sessionId}`);
      
      // Generate a random ID for the request
      const id = crypto.randomUUID();
      const timestamp = Date.now();
      
      // Create the default request object
      const request: GeminiRequest = {
        id,
        sessionId,
        prompt,
        status: 'idle',
        startTime: null,
        endTime: null,
        xmlPath: null,
        statusMessage: null,
        tokensReceived: 0,
        charsReceived: 0,
        lastUpdate: null,
        createdAt: timestamp
      };
      
      return connectionPool.withConnection(async (db) => {
        return new Promise<GeminiRequest>((resolve, reject) => {
          // Check if xml_path column exists
          db.get("PRAGMA table_info(gemini_requests)", [], (err, rows: any[]) => {
            if (err) {
              console.error("Error checking table schema:", err);
              reject(err);
              return;
            }
            
            try {
              // Determine if we're using the old or new column name
              const hasXmlPath = Array.isArray(rows) && rows.some((row: any) => row.name === 'xml_path');
              const patchColumn = hasXmlPath ? 'xml_path' : 'patch_path';
              
              db.run(`
                INSERT INTO gemini_requests 
                (id, session_id, prompt, status, start_time, end_time, ${patchColumn}, 
                 status_message, tokens_received, chars_received, last_update, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
              `, [
                request.id,
                request.sessionId,
                request.prompt,
                request.status,
                request.startTime,
                request.endTime,
                request.xmlPath,
                request.statusMessage,
                request.tokensReceived,
                request.charsReceived,
                request.lastUpdate,
                request.createdAt
              ], (err) => {
                if (err) {
                  console.error("Error creating Gemini request:", err);
                  reject(err);
                } else {
                  resolve(request);
                }
              });
            } catch (error) {
              console.error("Error processing table info:", error);
              reject(error);
            }
          });
        });
      });
    },
    
    /**
     * Get a Gemini request by ID
     */
    getGeminiRequest: async (requestId: string): Promise<GeminiRequest | null> => {
      console.log(`[Repo] Getting Gemini request: ${requestId}`);
      
      return connectionPool.withConnection(async (db) => {
        return new Promise<GeminiRequest | null>((resolve, reject) => {
          db.get(`
            SELECT * FROM gemini_requests WHERE id = ?
          `, [requestId], (err, row: any) => {
            if (err) {
              console.error("Error fetching Gemini request:", err);
              reject(err);
            } else if (!row) {
              resolve(null);
            } else {
              const request: GeminiRequest = {
                id: row.id,
                sessionId: row.session_id,
                prompt: row.prompt,
                status: row.status as GeminiStatus,
                startTime: row.start_time,
                endTime: row.end_time,
                xmlPath: row.xml_path || row.patch_path, // Use xml_path with fallback to patch_path
                statusMessage: row.status_message,
                tokensReceived: row.tokens_received || 0,
                charsReceived: row.chars_received || 0,
                lastUpdate: row.last_update,
                createdAt: row.created_at
              };
              resolve(request);
            }
          });
        });
      }, true); // Use read-only connection
    },
    
    /**
     * Get all Gemini requests for a session
     */
    getGeminiRequests: async (sessionId: string): Promise<GeminiRequest[]> => {
      console.log(`[Repo] Getting Gemini requests for session: ${sessionId}`);
      
      return connectionPool.withConnection(async (db) => {
        return new Promise<GeminiRequest[]>((resolve, reject) => {
          db.all(`
            SELECT * FROM gemini_requests 
            WHERE session_id = ? 
            ORDER BY created_at DESC
          `, [sessionId], (err, rows: any[]) => {
            if (err) {
              console.error("Error fetching Gemini requests:", err);
              reject(err);
            } else {
              const requests: GeminiRequest[] = rows.map(row => ({
                id: row.id,
                sessionId: row.session_id,
                prompt: row.prompt,
                status: row.status as GeminiStatus,
                startTime: row.start_time,
                endTime: row.end_time,
                xmlPath: row.xml_path || row.patch_path, // Use xml_path with fallback to patch_path
                statusMessage: row.status_message,
                tokensReceived: row.tokens_received || 0,
                charsReceived: row.chars_received || 0,
                lastUpdate: row.last_update,
                createdAt: row.created_at
              }));
              resolve(requests);
            }
          });
        });
      }, true); // Use read-only connection
    },
    
    /**
     * Get all visible (non-cleared) Gemini requests
     */
    getAllVisibleGeminiRequests: async (): Promise<GeminiRequest[]> => {
      const timestamp = new Date().toISOString();
      console.log(`[Repo] [${timestamp}] Getting all visible Gemini requests`);
      
      return connectionPool.withConnection(async (db) => {
        return new Promise<GeminiRequest[]>((resolve, reject) => {
          // Query for all non-cleared requests regardless of status
          const sql = `
            SELECT * FROM gemini_requests 
            WHERE (cleared = 0 OR cleared IS NULL)
            ORDER BY created_at DESC
          `;
          
          db.all(sql, [], (err, rows: any[]) => {
            if (err) {
              console.error("Error fetching visible Gemini requests:", err);
              return reject(err);
            }
            
            // Map rows to GeminiRequest objects
            const requests: GeminiRequest[] = (rows || []).map(row => ({
              id: row.id,
              sessionId: row.session_id,
              prompt: row.prompt,
              status: row.status as GeminiStatus,
              startTime: row.start_time,
              endTime: row.end_time,
              xmlPath: row.xml_path || row.patch_path, // Handle both column names
              statusMessage: row.status_message,
              tokensReceived: row.tokens_received || 0,
              charsReceived: row.chars_received || 0,
              lastUpdate: row.last_update,
              createdAt: row.created_at,
              cleared: !!row.cleared
            }));
            
            resolve(requests);
          });
        });
      }, true); // Use read-only connection for queries
    },
    
    /**
     * Retrieve a session with all of its Gemini requests
     */
    getSessionWithRequests: async (sessionId: string): Promise<Session | null> => {
      console.log(`[Repo] Getting session with requests: ${sessionId}`);
      
      try {
        // First, get the session
        const session = await this.getSession(sessionId);
        if (!session) {
          return null;
        }
        
        // Then, get the Gemini requests for the session
        const requests = await this.getGeminiRequests(sessionId);
        
        // Add the requests to the session
        session.geminiRequests = requests;
        
        return session;
      } catch (error) {
        console.error("Error getting session with requests:", error);
        throw error;
      }
    },
    
    /**
     * Cancel all running Gemini requests for a session
     */
    cancelAllSessionRequests: async (sessionId: string): Promise<void> => {
      console.log(`[Repo] Canceling all running requests for session: ${sessionId}`);
      return connectionPool.withConnection(async (db) => {
        return new Promise<void>((resolve, reject) => {
          db.run(`
            UPDATE gemini_requests SET status = 'canceled', end_time = ?, status_message = 'Canceled by user.'
            WHERE session_id = ? AND status = 'running'
          `, [Date.now(), sessionId], (err) => {
            if (err) reject(err);
            else resolve();
          });
        });
      });
    },
    
    /**
     * Clear Gemini request history (mark completed/failed/canceled requests as cleared)
     */
    clearGeminiRequestHistory: async (): Promise<void> => {
      console.log('[Repo] Clearing Gemini request history');
      
      return connectionPool.withTransaction(async (db) => {
        return new Promise<void>((resolve, reject) => {
          // Update completed/failed/canceled requests to set cleared=1
          const sql = `
            UPDATE gemini_requests
            SET cleared = 1
            WHERE status IN ('completed', 'failed', 'canceled')
              AND (cleared = 0 OR cleared IS NULL)
          `;
          
          db.run(sql, [], function(err) {
            if (err) {
              console.error("Error clearing Gemini request history:", err);
              return reject(err);
            }
            
            console.log(`[Repo] Cleared ${this.changes} Gemini requests from history`);
            resolve();
          });
        });
      });
    },
    
    /**
     * Update the 'cleared' status of a specific request
     */
    updateRequestClearedStatus: async (requestId: string, cleared: boolean): Promise<void> => {
      console.log(`[Repo] Updating cleared status for request ${requestId} to ${cleared}`);
      
      return connectionPool.withTransaction(async (db) => {
        return new Promise<void>((resolve, reject) => {
          db.run(
            'UPDATE gemini_requests SET cleared = ? WHERE id = ?',
            [cleared ? 1 : 0, requestId],
            function(err) {
              if (err) {
                console.error(`Error updating cleared status for request ${requestId}:`, err);
                return reject(err);
              }
              
              if (this.changes === 0) {
                console.warn(`Request ${requestId} not found when updating cleared status`);
              }
              
              resolve();
            }
          );
        });
      });
    },
    
    /**
     * Update the status of a Gemini request
     */
    updateGeminiRequestStatus: async (
      requestId: string,
      status: GeminiStatus,
      startTime?: number | null,
      endTime?: number | null,
      patchPath?: string | null, // Keep parameter name for backward compatibility
      statusMessage?: string | null,
      streamStats?: {
        tokensReceived?: number;
        charsReceived?: number;
      }
    ): Promise<void> => {
      console.log(`[Repo] Updating Gemini request ${requestId} to ${status}`);
      
      // Construct the SET clause and values dynamically
      const setClauses: string[] = ['status = ?'];
      const values: any[] = [status];
      
      if (startTime !== undefined) {
        setClauses.push('start_time = ?');
        values.push(startTime);
      }
      
      if (endTime !== undefined) {
        setClauses.push('end_time = ?');
        values.push(endTime);
      }
      
      if (patchPath !== undefined) {
        setClauses.push('xml_path = ?');
        values.push(patchPath);
      }
      
      if (statusMessage !== undefined) {
        setClauses.push('status_message = ?');
        values.push(statusMessage);
      }
      
      // Add streaming stats if provided and are valid numbers
      if (streamStats?.tokensReceived !== undefined) {
        setClauses.push('tokens_received = ?');
        values.push(streamStats.tokensReceived);
      }
      
      if (streamStats?.charsReceived !== undefined) {
        setClauses.push('chars_received = ?');
        values.push(streamStats.charsReceived);
      }
      
      // Update last update timestamp if status is 'running' or stats were provided
      if (streamStats?.tokensReceived !== undefined || streamStats?.charsReceived !== undefined) {
        setClauses.push('last_update = ?');
        values.push(Date.now());
      }
      
      // Add the requestId for the WHERE clause
      values.push(requestId);
      
      return connectionPool.withConnection(async (db) => {
        return new Promise<void>((resolve, reject) => {
          const sql = `UPDATE gemini_requests SET ${setClauses.join(', ')} WHERE id = ?`;
          
          db.run(sql, values, (err) => {
            if (err) {
              console.error("Error updating Gemini request status:", err);
              reject(err);
            } else {
              resolve();
            }
          });
        }); 
      });
    }
  };
}

// Create and export a default instance
export const sessionRepository = createSessionRepository(); 