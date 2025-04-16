import { db } from './index';
import { Session } from '@/types/session-types';
import { GeminiStatus } from '@/types';
import { hashString } from '@/lib/hash'; // Keep hashString import
import { normalizePath } from '../path-utils';
/**
 * Session Repository - Handles all session-related database operations
 */
export class SessionRepository {
  // Add transaction state tracking property
  private _transactionActive = false;

  /**
   * Save a session to the database (create or update)
   */
  saveSession = async (session: Session): Promise<Session> => {
    console.log(`[Repo] saveSession called for ID: ${session.id} - Name: ${session.name}`);
    console.log(`[Repo] Current transaction state before saveSession: ${this._transactionActive}`);
    // Create a reference to this instance to use in callbacks
    const self = this;
    
    return new Promise((resolve, reject) => {
      try {
        if (!session.projectDirectory) {
          return reject(new Error("Missing required session fields: projectDirectory"));
        }
        const projectHash = hashString(session.projectDirectory);
        
        // Extract included files and excluded files
        const includedFilesArray = session.includedFiles || []; // Ensure arrays exist
        const excludedFilesArray = session.forceExcludedFiles || [];

        // Helper function to handle session save logic
        const handleSessionSave = async (
          resolve: (value: Session) => void, reject: (reason: any) => void, projectHash: string, session: Session, includedFilesArray: string[], excludedFilesArray: string[], noTransaction: boolean
        ) => {
          // console.log(`[Repo] handleSessionSave called for ${session.id}, noTransaction: ${noTransaction}`); // Reduce logging
          // Ensure Gemini fields have defaults if not provided
          const currentGeminiStatus = session.geminiStatus || 'idle';
          // Prepare data for insertion/replacement
          const sessionValues: Omit<Session, 'includedFiles' | 'forceExcludedFiles' | 'updatedAt'> & { projectHash: string; updatedAt: number } = {
            id: session.id,
            name: session.name,
            projectDirectory: session.projectDirectory,
            projectHash, // Store the hash as well for safer queries
            taskDescription: session.taskDescription || '',
            searchTerm: session.searchTerm || '',
            pastedPaths: session.pastedPaths || '',
            patternDescription: session.patternDescription || '',
            titleRegex: session.titleRegex || '',
            contentRegex: session.contentRegex || '',
            isRegexActive: session.isRegexActive ?? true, // Default to true for backwards compatibility
            updatedAt: Date.now(), // Use current timestamp for update
            // Explicitly include Gemini fields, providing defaults if they are missing
            geminiStatus: currentGeminiStatus,
            geminiStartTime: session.geminiStartTime || null,
            geminiEndTime: session.geminiEndTime || null,
            geminiPatchPath: session.geminiPatchPath ? normalizePath(session.geminiPatchPath) : null, // Normalize path
            geminiTokensReceived: session.geminiTokensReceived || 0,
            geminiCharsReceived: session.geminiCharsReceived || 0,
            geminiLastUpdate: session.geminiLastUpdate || null,
            geminiStatusMessage: session.geminiStatusMessage || null,
          };
          // console.log(`[Repo] Preparing to INSERT/REPLACE session ${sessionValues.id} with values:`, sessionValues); // Reduce logging

          db.run(`
            -- Insert or update the main session data
            INSERT OR REPLACE INTO sessions
            (id, name, project_directory, project_hash, task_description, search_term, pasted_paths, -- Keep session fields
             pattern_description, title_regex, content_regex, is_regex_active, codebase_structure, updated_at,
             gemini_status, gemini_start_time, gemini_end_time, gemini_patch_path, gemini_status_message, gemini_tokens_received, gemini_chars_received, gemini_last_update)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '', ?, ?, ?, ?, ?, ?, ?, ?, ?) -- Keep 21 placeholders, use empty string for codebase_structure
          `, [ // Ensure values match the order of columns
            sessionValues.id,
            sessionValues.name,
            sessionValues.projectDirectory, // Ensure project directory is saved
            projectHash, // Add project_hash parameter
            sessionValues.taskDescription,
            sessionValues.searchTerm,
            sessionValues.pastedPaths,
            sessionValues.patternDescription,
            sessionValues.titleRegex,
            sessionValues.contentRegex,
            sessionValues.isRegexActive ? 1 : 0, // Convert boolean to 0/1 for SQLite
            // Empty string for codebaseStructure
            sessionValues.updatedAt,
            sessionValues.geminiStatus, // Ensure geminiStatus is passed
            sessionValues.geminiStartTime,
            sessionValues.geminiEndTime,
            sessionValues.geminiPatchPath,
            sessionValues.geminiStatusMessage, // Add status message
            sessionValues.geminiTokensReceived,
            sessionValues.geminiCharsReceived,
            sessionValues.geminiLastUpdate,
          ], async function(saveErr) {
            if (saveErr) {
              console.error("Error saving session:", saveErr);
              // Only rollback if we're in a transaction
              if (!noTransaction) { // Use noTransaction flag
                console.log(`[Repo] Error saving session data, executing ROLLBACK for session ${session.id}`);
                db.run('ROLLBACK', () => {
                  // Use captured reference instead of this
                  self._transactionActive = false; // Reset transaction flag
                  console.log(`[Repo] ROLLBACK completed after save error, transaction flag reset to: ${self._transactionActive}`);
                  reject(saveErr);
                });
              } else {
                console.log(`[Repo] Error saving session data in nested transaction for ${session.id}, no ROLLBACK needed`);
                reject(saveErr);
              }
              return;
            }

            try {
              // Delete existing included files for this session
              await new Promise<void>((resolveDelete, rejectDelete) => {
                db.run(`DELETE FROM included_files WHERE session_id = ?`, [session.id], (deleteErr) => {
                  if (deleteErr) { console.error("Error deleting included files:", deleteErr); rejectDelete(deleteErr); }
                  else resolveDelete();
                });
              });
              // console.log(`[Repo] Deleted existing included_files for session ${session.id}`); // Reduce logging

              // Insert new included files - safely handle each file path
              if (includedFilesArray.length > 0) {
                const includedStmt = db.prepare(`INSERT INTO included_files (session_id, file_path) VALUES (?, ?)`);
                for (const filePath of includedFilesArray) {
                  try {
                    await new Promise<void>((resolveInsert, rejectInsert) => {
                      includedStmt.run(session.id, filePath, (insertErr) => {
                        if (insertErr) { 
                          console.error("Error inserting included file:", insertErr, { filePath });
                          // Skip this file instead of failing the entire transaction
                          resolveInsert(); 
                        }
                        else resolveInsert();
                      });
                    });
                  } catch (innerErr) {
                    console.error("Error processing included file:", innerErr, { filePath });
                    // Continue with next file
                  }
                }
                includedStmt.finalize();
                // console.log(`[Repo] Inserted ${includedFilesArray.length} included_files for session ${session.id}`); // Reduce logging
              }

              // Delete existing excluded files for this session
              await new Promise<void>((resolveDelete, rejectDelete) => {
                db.run(`DELETE FROM excluded_files WHERE session_id = ?`, [session.id], (deleteErr) => {
                  if (deleteErr) { console.error("Error deleting excluded files:", deleteErr); rejectDelete(deleteErr); }
                  else resolveDelete();
                });
              });
               // console.log(`[Repo] Deleted existing excluded_files for session ${session.id}`); // Reduce logging

              // Insert new excluded files - safely handle each file path
              if (excludedFilesArray.length > 0) {
                const excludedStmt = db.prepare(`INSERT INTO excluded_files (session_id, file_path) VALUES (?, ?)`);
                for (const filePath of excludedFilesArray) {
                  try {
                    await new Promise<void>((resolveInsert, rejectInsert) => {
                      excludedStmt.run(session.id, filePath, (insertErr) => {
                        if (insertErr) { 
                          console.error("Error inserting excluded file:", insertErr, { filePath });
                          // Skip this file instead of failing the entire transaction
                          resolveInsert(); 
                        }
                        else resolveInsert();
                      });
                    });
                  } catch (innerErr) {
                    console.error("Error processing excluded file:", innerErr, { filePath });
                    // Continue with next file
                  }
                }
                excludedStmt.finalize();
                // console.log(`[Repo] Inserted ${excludedFilesArray.length} excluded_files for session ${session.id}`); // Reduce logging
              }

              // Only commit if we started a transaction
              if (!noTransaction) { // Use noTransaction flag
                // Log transaction state before commit
                // console.log(`[Repo] Transaction is active: ${self._transactionActive}, attempting to commit for session ${session.id}`); // Reduce logging

                // Commit the transaction
                db.run('COMMIT', (commitErr) => {
                  // Use captured reference instead of this
                  self._transactionActive = false; // Reset transaction flag
                  console.log(`[Repo] COMMIT completed for session ${session.id}, transaction flag reset to: ${self._transactionActive}`);
                  
                  if (commitErr) {
                    console.error("Commit error:", commitErr);
                    db.run('ROLLBACK', () => {
                      console.log(`[Repo] ROLLBACK completed due to COMMIT error for session ${session.id}`);
                      reject(commitErr);
                    });
                  } else {
                    console.log(`[Repo] Successfully committed save for session ${session.id}`);
                    resolve(session);
                  }
                });
              } else {
                // If we're not in a transaction (due to nesting), just resolve
                console.log(`[Repo] No transaction to commit (nested transaction) for session ${session.id}`);
                resolve(session);
              }
            } catch (fileError) {
              console.error("Error processing files:", fileError);
              // Only rollback if we started a transaction
              if (!noTransaction) { // Use noTransaction flag
                console.log(`[Repo] Error occurred, executing ROLLBACK for session ${session.id}`);
                db.run('ROLLBACK', () => {
                  // Use captured reference instead of this
                  self._transactionActive = false; // Reset transaction flag
                  console.log(`[Repo] ROLLBACK completed, transaction flag reset to: ${self._transactionActive}`);
                  reject(fileError);
                });
                console.log(`[Repo] Rolled back transaction for session ${session.id} due to file error`);
              } else {
                console.log(`[Repo] Error in nested transaction for session ${session.id}, no ROLLBACK needed`);
                reject(fileError);
              }
            }
          });
        }; // End of handleSessionSave helper

        // Check if transaction is already active
        if (self._transactionActive) {
          // Skip starting a new transaction if one is already active
          console.log(`[Repo] Transaction already active, skipping BEGIN for session ${session.id}`);
          handleSessionSave(resolve, reject, projectHash, session, includedFilesArray, excludedFilesArray, true);
        } else {
          // Start a new transaction if none is active
          self._transactionActive = true;
          console.log(`[Repo] Starting new transaction for session ${session.id}, flag set to: ${self._transactionActive}`);
          
          db.run('BEGIN TRANSACTION', (err) => {
            if (err) {
              self._transactionActive = false; // Reset flag on error
              console.error(`[Repo] Failed to begin transaction: ${err.message}`);
              return reject(err);
            }
            
            // Call the helper function with the transaction already started
            handleSessionSave(resolve, reject, projectHash, session, includedFilesArray, excludedFilesArray, false);
          });
        }
      } catch (error) {
        console.error("Outer catch error in saveSession:", error);
        // Add rollback if transaction might be started
        if (self._transactionActive) {
          console.log(`[Repo] Outer catch error, executing ROLLBACK for session ${session.id}`);
          db.run('ROLLBACK', () => {
            self._transactionActive = false; // Reset transaction flag
            console.log(`[Repo] ROLLBACK completed from outer catch, transaction flag reset to: ${self._transactionActive}`);
            reject(error);
          });
        } else {
          console.log(`[Repo] Outer catch error, no active transaction for session ${session.id}`);
          reject(error);
        }
      }
    });
  };

  /**
   * Get all sessions for a specific project directory and output format
   */
  getSessions = async (projectDirectory: string): Promise<Session[]> => {
    console.log(`[Repo] Getting sessions for Project: ${projectDirectory}`);
    // Generate project hash for safer SQL queries
    const projectHash = hashString(projectDirectory);
    
    const sessions: Session[] = [];
    
    return new Promise((resolve, reject) => { // Keep promise
      db.all(`
        SELECT * FROM sessions
        WHERE project_hash = ?
        ORDER BY updated_at DESC
      `, [projectHash], async (err, sessionRows: any[]) => {
        if (err) {
          console.error("Error fetching sessions:", err);
          return reject(err);
        }
        
        // If no sessions found, return empty array
        if (!sessionRows || sessionRows.length === 0) {
          return resolve(sessions);
        }
        
        try {
          // Batch fetch all included files for these sessions
          const sessionIds = sessionRows.map(row => row.id);
          
          // Get all included files for all sessions
          const includedFilesData = await new Promise<{sessionId: string, filePath: string}[]>((resolveFiles, rejectFiles) => {
            db.all(
              `SELECT session_id, file_path FROM included_files WHERE session_id IN (${sessionIds.map(() => '?').join(',')})`,
              sessionIds,
              (errFiles, rows: any[]) => {
                if (errFiles) { console.error("Error fetching included files:", errFiles); rejectFiles(errFiles); }
                else resolveFiles(rows.map(r => ({ sessionId: r.session_id, filePath: r.file_path })));
              }
            );
          });
          
          // Get all excluded files for all sessions
          const excludedFilesData = await new Promise<{sessionId: string, filePath: string}[]>((resolveFiles, rejectFiles) => {
            db.all(
              `SELECT session_id, file_path FROM excluded_files WHERE session_id IN (${sessionIds.map(() => '?').join(',')})`,
              sessionIds,
              (errFiles, rows: any[]) => {
                if (errFiles) { console.error("Error fetching excluded files:", errFiles); rejectFiles(errFiles); }
                else resolveFiles(rows.map(r => ({ sessionId: r.session_id, filePath: r.file_path })));
              }
            );
          });
          
          // Organize files by session ID
          const includedFilesMap: Record<string, string[]> = {};
          includedFilesData.forEach(({ sessionId, filePath }) => {
            if (!includedFilesMap[sessionId]) includedFilesMap[sessionId] = [];
            includedFilesMap[sessionId].push(filePath);
          });
          
          // Organize excluded files by session ID
          const excludedFilesMap: Record<string, string[]> = {};
          excludedFilesData.forEach(({ sessionId, filePath }) => {
            if (!excludedFilesMap[sessionId]) excludedFilesMap[sessionId] = [];
            excludedFilesMap[sessionId].push(filePath);
          });

          // Create Session objects
          for (const row of sessionRows) {
            sessions.push({
              id: row.id,
              name: row.name,
              projectDirectory: row.project_directory,
              taskDescription: row.task_description || '',
              searchTerm: row.search_term || '',
              pastedPaths: row.pasted_paths || '',
              patternDescription: row.pattern_description || '',
              titleRegex: row.title_regex || '',
              contentRegex: row.content_regex || '',
              isRegexActive: !!row.is_regex_active,
              includedFiles: includedFilesMap[row.id] || [],
              forceExcludedFiles: excludedFilesMap[row.id] || [],
              // Add Gemini fields
              geminiStatus: row.gemini_status as GeminiStatus || 'idle', // Add type assertion
              geminiStartTime: row.gemini_start_time || null, // Keep start time
              geminiEndTime: row.gemini_end_time || null,
              geminiPatchPath: row.gemini_patch_path || null,
              geminiStatusMessage: row.gemini_status_message || null, // Add status message
              geminiTokensReceived: row.gemini_tokens_received || 0,
              geminiCharsReceived: row.gemini_chars_received || 0,
              geminiLastUpdate: row.gemini_last_update || null,
            });
          }

          resolve(sessions);
        } catch (error) {
          console.error("Error assembling session objects:", error);
          reject(error);
        }
      });
    });
  };

  /**
   * Get a session by ID
   */
  getSession = async (sessionId: string): Promise<Session | null> => {
     console.log(`[Repo] Getting session by ID: ${sessionId}`);
    return new Promise((resolve, reject) => {
      db.get(`SELECT * FROM sessions WHERE id = ?`, [sessionId], async (err, row: any) => {
        if (err) {
          console.error("Error fetching session by ID:", err);
          return reject(err);
        }

        if (!row) {
          return resolve(null);
        }

        try {
          // Get included files
          const includedFiles = await new Promise<string[]>((resolveFiles, rejectFiles) => {
            db.all(`SELECT file_path FROM included_files WHERE session_id = ?`, [sessionId], (errFiles, rows: any[]) => {
              if (errFiles) { console.error("Error fetching included files for session:", errFiles); rejectFiles(errFiles); }
              else resolveFiles((rows || []).map(r => r.file_path));
            });
          });

          // Get excluded files
          const excludedFiles = await new Promise<string[]>((resolveFiles, rejectFiles) => {
            db.all(`SELECT file_path FROM excluded_files WHERE session_id = ?`, [sessionId], (errFiles, rows: any[]) => {
              if (errFiles) { console.error("Error fetching excluded files for session:", errFiles); rejectFiles(errFiles); }
              else resolveFiles((rows || []).map(r => r.file_path));
            });
          });

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
            geminiPatchPath: row.gemini_patch_path || null, // Keep patch path
            geminiStatusMessage: row.gemini_status_message || null, // Add status message
            geminiTokensReceived: row.gemini_tokens_received || 0,
            geminiCharsReceived: row.gemini_chars_received || 0,
            geminiLastUpdate: row.gemini_last_update || null,
          };

          resolve(session);
        } catch (error) {
          console.error("Error assembling single session object:", error);
          reject(error);
        }
      });
    });
  };

  /**
   * Delete a session by ID
   */
  deleteSession = async (sessionId: string): Promise<void> => {
     console.log(`[Repo] Deleting session: ${sessionId}`);
    return new Promise((resolve, reject) => {
      // Foreign key constraints with ON DELETE CASCADE handle related files
      db.run(`DELETE FROM sessions WHERE id = ?`, [sessionId], (err) => {
        if (err) { console.error("Error deleting session:", err); reject(err); }
        else resolve();
      });
    });
  };

  /**
   * Set the active session for a project directory and output format
   */
  setActiveSession = async (
    projectDirectory: string,
    sessionId: string | null // Allow null to clear active session
  ): Promise<void> => { // Removed outputFormat
    // Generate project hash for safer SQL queries
    const projectHash = hashString(projectDirectory);
    
    return new Promise((resolve, reject) => {
      db.run(`
        INSERT OR REPLACE INTO project_settings (project_hash, active_session_id, updated_at)
        VALUES (?, ?, ?)
      `, [projectHash, sessionId, Date.now()], (err) => {
        if (err) {
          console.error("Error setting active session:", err);
          reject(err);
        } else {
          resolve();
        }
      });
    });
  };

  /**
   * Get the active session ID for a project directory and output format
   */
  getActiveSessionId = async (
    projectDirectory: string // Keep projectDirectory parameter
  ): Promise<string | null> => { // Removed outputFormat
    // Generate project hash for safer SQL queries
    const projectHash = hashString(projectDirectory);
    
    return new Promise((resolve, reject) => { // Removed outputFormat from SELECT
      db.get(`
        SELECT active_session_id FROM project_settings
        WHERE project_hash = ?
      `, [projectHash], (err, row: any) => {
        if (err) {
          console.error("Error getting active session ID:", err);
          reject(err);
        } else {
          resolve(row?.active_session_id || null);
        }
      });
    });
  };

  /**
   * Get a cached state value by key
   */
  getCachedState = async (
    projectDirectory: string | null | undefined, // Allow null/undefined for global - removed outputFormat
    key: string
  ): Promise<string | null> => {
    // Generate project hash for safer SQL queries
    const projectHash = hashString(projectDirectory || 'global'); // Use 'global' scope if needed

    if (!key) {
      console.error("Missing key in getCachedState");
      return null;
    }

    // Only log for non-files keys to reduce noise
    if (!key.includes('files')) {
      console.log(`[Repo] Getting cached state for ${projectHash}/${key}`); // Removed outputFormat
    }

    return new Promise((resolve, reject) => {
      db.get(`
        SELECT value FROM cached_state -- Select only value
        WHERE project_hash = ? AND key = ? -- Removed outputFormat
      `, [projectHash, key], (err, row: any) => {
        if (err) { 
          console.error("Error getting cached state:", err);
          reject(err);
        } else { // Check if row exists before accessing value
          // Only log for non-files keys to reduce noise
          if (!key.includes('files')) {
            console.log(`[Repo] Cache result for ${key}:`, row ? 'Found' : 'Not Found');
          }
          resolve(row?.value || null);
        }
      });
    });
  };

  /**
   * Save a cached state value
   */
  saveCachedState = async (
    projectDirectory: string | null | undefined, // Allow null/undefined for global - removed outputFormat
    key: string,
    value: string
  ): Promise<void> => {
    // Generate project hash for safer SQL queries
    const projectHash = hashString(projectDirectory || 'global');
    if (!key) {
      console.error("Missing key in saveCachedState");
      return;
    } // Close key check
    const timestamp = Date.now();
    
    // Ensure value is a string
    const safeValue = value === null || value === undefined ? '' : String(value);
    
    return new Promise((resolve, reject) => {
      db.run(`
        INSERT OR REPLACE INTO cached_state (project_hash, key, value, updated_at)
        VALUES (?, ?, ?, ?)
      `, [projectHash, key, safeValue, timestamp], (err) => {
        if (err) {
          console.error("Error saving cached state:", err);
          reject(err);
        } else {
          // Completely remove logging for successful saves to reduce noise
          resolve();
        }
      });
    });
  };

  /**
   * Update only the Gemini-related status fields for a session.
   */
  updateSessionGeminiStatus = async (
    sessionId: string | null | undefined, // Allow null/undefined session ID
    status: GeminiStatus, // Correct type usage
    startTime?: number | null,
    endTime?: number | null,   // Optional end time
    patchPath?: string | null, // Optional patch path
    statusMessage?: string | null, // Optional status message
    streamStats?: {
      tokensReceived?: number;
      charsReceived?: number;
    }
  ): Promise<void> => {
    console.log(`[Repo] Updating Gemini status for session ${sessionId} to ${status}, patchPath: ${patchPath}, msg: ${statusMessage}`);
    // Guard against invalid session ID
    if (!sessionId) {
      console.warn(`[Repo] Attempted to update Gemini status for invalid sessionId: ${sessionId}`);
      return Promise.resolve(); // Or reject, depending on desired behavior
    }
    return new Promise((resolve, reject) => {
      // Construct the SET clause dynamically based on provided values
      const setClauses: string[] = ['gemini_status = ?', 'updated_at = ?'];
      const values: any[] = [status, Date.now()];

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
        values.push(patchPath);
      }
      if (statusMessage !== undefined) {
        setClauses.push('gemini_status_message = ?');
        values.push(statusMessage);
      }
      
      // Add streaming stats if provided
      // Only update stats if explicitly provided in the call
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

      values.push(sessionId); // Add sessionId for the WHERE clause

      const sql = `UPDATE sessions SET ${setClauses.join(', ')} WHERE id = ?`;

      console.log(`[Repo] SQL: ${sql}`, values); // Log the SQL and values for debugging
      db.run(sql, values, (err) => {
        if (err) { console.error("Error updating Gemini status:", err); reject(err); }
        else resolve();
      });
    });
  };

  /**
   * Get all sessions from the database
   */
  getAllSessions = async (): Promise<Session[]> => {
    return new Promise((resolve, reject) => {
      // Get the main session data
      db.all(`
        SELECT 
          s.id, s.name, s.project_directory, s.task_description, 
          s.search_term, s.pasted_paths, s.pattern_description, 
          s.title_regex, s.content_regex, s.is_regex_active, 
          s.codebase_structure,
          s.updated_at, s.gemini_status, s.gemini_status_message, s.gemini_start_time,
          s.gemini_tokens_received, s.gemini_chars_received, s.gemini_last_update, 
          s.gemini_end_time, s.gemini_patch_path 
        FROM sessions s
        ORDER BY s.updated_at DESC
      `, [], async (err, rows) => {
        if (err) {
          console.error("Error getting all sessions:", err);
          return reject(err);
        }

        try {
          // For each session, get included and excluded files
          const sessionsWithFiles = await Promise.all(rows.map(async (row) => {
            // Convert row to Session object with empty file arrays initially
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
              includedFiles: [],
              forceExcludedFiles: [],
              updatedAt: row.updated_at,
              geminiStatus: row.gemini_status || 'idle', 
              geminiStartTime: row.gemini_start_time || null,
              geminiEndTime: row.gemini_end_time || null,
              geminiPatchPath: row.gemini_patch_path || null,
              geminiStatusMessage: row.gemini_status_message || null, // Add status message
              geminiTokensReceived: row.gemini_tokens_received || 0,
              geminiCharsReceived: row.gemini_chars_received || 0,
              geminiLastUpdate: row.gemini_last_update || null,
            };

            // Get included files for this session
            const includedFiles = await new Promise<string[]>((resolveIncluded, rejectIncluded) => {
              db.all(`SELECT file_path FROM included_files WHERE session_id = ?`, [row.id], (inclErr, inclRows) => {
                if (inclErr) {
                  console.error("Error getting included files:", inclErr);
                  rejectIncluded(inclErr);
                } else {
                  resolveIncluded(inclRows.map(r => r.file_path));
                }
              });
            });
            session.includedFiles = includedFiles;

            // Get excluded files for this session
            const excludedFiles = await new Promise<string[]>((resolveExcluded, rejectExcluded) => {
              db.all(`SELECT file_path FROM excluded_files WHERE session_id = ?`, [row.id], (exclErr, exclRows) => {
                if (exclErr) {
                  console.error("Error getting excluded files:", exclErr);
                  rejectExcluded(exclErr);
                } else {
                  resolveExcluded(exclRows.map(r => r.file_path));
                }
              });
            });
            session.forceExcludedFiles = excludedFiles;

            return session;
          }));

          resolve(sessionsWithFiles);
        } catch (processErr) {
          console.error("Error processing sessions:", processErr);
          reject(processErr);
        }
      });
    });
  };

  createSession = async (name: string, projectDirectory: string): Promise<Session> => {
    console.log(`[Repo] Creating session: ${name} for project: ${projectDirectory}`);
    
    // Generate a random ID for the session
    const id = crypto.randomUUID();
    
    // Create default session object with empty values
    const session: Session = {
      id,
      name,
      projectDirectory,
      taskDescription: '',
      searchTerm: '',
      pastedPaths: '',
      patternDescription: '',
      titleRegex: '',
      contentRegex: '',
      isRegexActive: true,
      includedFiles: [],
      forceExcludedFiles: [],
      geminiStatus: 'idle',
      geminiStartTime: null,
      geminiEndTime: null,
      geminiPatchPath: null,
      geminiStatusMessage: null,
      geminiTokensReceived: 0, 
      geminiCharsReceived: 0,
      geminiLastUpdate: null,
    };
    
    // Save the session to the database
    return this.saveSession(session);
  };
}

// Create and export a singleton instance of the repository
export const sessionRepository = new SessionRepository();
