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
      
      // Generate project hash for safer SQL queries
      const projectHash = hashString(session.projectDirectory);
      
      // Extract included and excluded files from session
      const includedFilesArray = session.includedFiles || [];
      const excludedFilesArray = session.forceExcludedFiles || [];
      
      // Determine current Gemini status for cleaner database operations
      const currentGeminiStatus = session.geminiStatus || 'idle';
      
      // Use the connection pool with transaction
      return connectionPool.withTransaction(async (db) => {
        // Prepare data for insertion/replacement
        const sessionValues = [
          session.id,
          session.name,
          session.projectDirectory,
          projectHash,
          session.taskDescription || '',
          session.searchTerm || '',
          session.pastedPaths || '',
          session.patternDescription || '',
          session.titleRegex || '',
          session.contentRegex || '',
          session.isRegexActive ? 1 : 0,
          '', // Empty codebase structure
          Date.now(), // Updated timestamp
          currentGeminiStatus,
          session.geminiStartTime || null,
          session.geminiEndTime || null,
          session.geminiPatchPath ? normalizePath(session.geminiPatchPath) : null,
          session.geminiStatusMessage || null,
          session.geminiTokensReceived || 0,
          session.geminiCharsReceived || 0,
          session.geminiLastUpdate || null
        ];
        
        // Insert or replace the session
        await new Promise<void>((resolve, reject) => {
          db.run(`
            INSERT OR REPLACE INTO sessions
            (id, name, project_directory, project_hash, task_description, search_term, pasted_paths,
             pattern_description, title_regex, content_regex, is_regex_active, codebase_structure, updated_at,
             gemini_status, gemini_start_time, gemini_end_time, gemini_patch_path, gemini_status_message, 
             gemini_tokens_received, gemini_chars_received, gemini_last_update)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `, sessionValues, function(err) {
            if (err) {
              console.error("Error saving session:", err);
              return reject(err);
            }
            resolve();
          });
        });
        
        // Delete and reinsert included files
        await new Promise<void>((resolve, reject) => {
          db.run(`DELETE FROM included_files WHERE session_id = ?`, [session.id], (err) => {
            if (err) {
              console.error("Error deleting included files:", err);
              return reject(err);
            }
            resolve();
          });
        });
        
        // Insert new included files
        if (includedFilesArray.length > 0) {
          const includedStmt = db.prepare(`INSERT INTO included_files (session_id, file_path) VALUES (?, ?)`);
          
          for (const filePath of includedFilesArray) {
            await new Promise<void>((resolve) => {
              includedStmt.run(session.id, filePath, (err) => {
                if (err) {
                  console.error("Error inserting included file:", err, { filePath });
                }
                resolve();
              });
            });
          }
          
          await new Promise<void>((resolve, reject) => {
            includedStmt.finalize((err) => {
              if (err) {
                console.error("Error finalizing included files statement:", err);
                return reject(err);
              }
              resolve();
            });
          });
        }
        
        // Delete and reinsert excluded files
        await new Promise<void>((resolve, reject) => {
          db.run(`DELETE FROM excluded_files WHERE session_id = ?`, [session.id], (err) => {
            if (err) {
              console.error("Error deleting excluded files:", err);
              return reject(err);
            }
            resolve();
          });
        });
        
        // Insert new excluded files
        if (excludedFilesArray.length > 0) {
          const excludedStmt = db.prepare(`INSERT INTO excluded_files (session_id, file_path) VALUES (?, ?)`);
          
          for (const filePath of excludedFilesArray) {
            await new Promise<void>((resolve) => {
              excludedStmt.run(session.id, filePath, (err) => {
                if (err) {
                  console.error("Error inserting excluded file:", err, { filePath });
                }
                resolve();
              });
            });
          }
          
          await new Promise<void>((resolve, reject) => {
            excludedStmt.finalize((err) => {
              if (err) {
                console.error("Error finalizing excluded files statement:", err);
                return reject(err);
              }
              resolve();
            });
          });
        }
        
        return session;
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
              patternDescription: row.pattern_description || '',
              titleRegex: row.title_regex || '',
              contentRegex: row.content_regex || '',
              isRegexActive: !!row.is_regex_active,
              includedFiles,
              forceExcludedFiles: excludedFiles,
              // Add Gemini fields
              geminiStatus: row.gemini_status || 'idle',
              geminiStartTime: row.gemini_start_time || null,
              geminiEndTime: row.gemini_end_time || null,
              geminiPatchPath: row.gemini_patch_path || null,
              geminiStatusMessage: row.gemini_status_message || null,
              geminiTokensReceived: row.gemini_tokens_received || 0,
              geminiCharsReceived: row.gemini_chars_received || 0,
              geminiLastUpdate: row.gemini_last_update || null,
            };
            
            resolve(session);
          });
        });
      }, true); // Use read-only connection
    },
    
    /**
     * Create a new Gemini request for a session
     */
    createGeminiRequest: async (
      sessionId: string,
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
        patchPath: null,
        statusMessage: null,
        tokensReceived: 0,
        charsReceived: 0,
        lastUpdate: null,
        createdAt: timestamp
      };
      
      return connectionPool.withConnection(async (db) => {
        return new Promise<GeminiRequest>((resolve, reject) => {
          db.run(`
            INSERT INTO gemini_requests 
            (id, session_id, prompt, status, start_time, end_time, patch_path, 
             status_message, tokens_received, chars_received, last_update, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `, [
            request.id,
            request.sessionId,
            request.prompt,
            request.status,
            request.startTime,
            request.endTime,
            request.patchPath,
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
                patchPath: row.patch_path,
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
                patchPath: row.patch_path,
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
     * Update the status of a Gemini request
     */
    updateGeminiRequestStatus: async (
      requestId: string,
      status: GeminiStatus,
      startTime?: number | null,
      endTime?: number | null,
      patchPath?: string | null,
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
        setClauses.push('patch_path = ?');
        values.push(patchPath);
      }
      
      if (statusMessage !== undefined) {
        setClauses.push('status_message = ?');
        values.push(statusMessage);
      }
      
      // Add streaming stats if provided
      if (streamStats?.tokensReceived !== undefined) {
        setClauses.push('tokens_received = ?');
        values.push(streamStats.tokensReceived);
      }
      
      if (streamStats?.charsReceived !== undefined) {
        setClauses.push('chars_received = ?');
        values.push(streamStats.charsReceived);
      }
      
      // Add last update timestamp if any streaming stats were provided
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
    },
    
    /**
     * Update the Gemini status of a session
     */
    updateSessionGeminiStatus: async (
      sessionId: string,
      status: GeminiStatus,
      startTime?: number | null,
      endTime?: number | null,
      patchPath?: string | null,
      statusMessage?: string | null,
      streamStats?: {
        tokensReceived?: number;
        charsReceived?: number;
      }
    ): Promise<void> => {
      console.log(`[Repo] Updating session ${sessionId} Gemini status to ${status}`);
      
      // Construct the SET clause and values dynamically
      const setClauses: string[] = ['gemini_status = ?'];
      const values: any[] = [status];
      
      if (startTime !== undefined) {
        setClauses.push('gemini_start_time = ?');
        values.push(startTime);
      }
      
      if (endTime !== undefined) {
        setClauses.push('gemini_end_time = ?');
        values.push(endTime);
      }
      
      if (patchPath !== undefined) {
        setClauses.push('gemini_patch_path = ?');
        values.push(patchPath ? normalizePath(patchPath) : null);
      }
      
      if (statusMessage !== undefined) {
        setClauses.push('gemini_status_message = ?');
        values.push(statusMessage);
      }
      
      if (streamStats?.tokensReceived !== undefined) {
        setClauses.push('gemini_tokens_received = ?');
        values.push(streamStats.tokensReceived);
      }
      
      if (streamStats?.charsReceived !== undefined) {
        setClauses.push('gemini_chars_received = ?');
        values.push(streamStats.charsReceived);
      }
      
      // Add last update timestamp if any streaming stats were provided
      if (streamStats?.tokensReceived !== undefined || streamStats?.charsReceived !== undefined) {
        setClauses.push('gemini_last_update = ?');
        values.push(Date.now());
      }
      
      // Add updated_at timestamp
      setClauses.push('updated_at = ?');
      values.push(Date.now());
      
      // Add the sessionId for the WHERE clause
      values.push(sessionId);
      
      return connectionPool.withConnection(async (db) => {
        return new Promise<void>((resolve, reject) => {
          const sql = `UPDATE sessions SET ${setClauses.join(', ')} WHERE id = ?`;
          
          db.run(sql, values, (err) => {
            if (err) {
              console.error("Error updating session Gemini status:", err);
              reject(err);
            } else {
              resolve();
            }
          });
        });
      });
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
    }
  };
}

// Create and export a default instance
export const sessionRepository = createSessionRepository(); 