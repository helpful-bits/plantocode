import { db } from './index';
import { Session } from '@/types/session-types'; // Keep Session import
import { OutputFormat, GeminiStatus } from '@/types';
import { hashString } from '@/lib/hash';

/**
 * Session Repository - Handles all session-related database operations
 */
export class SessionRepository {
  /**
   * Save a session to the database (create or update)
   */
  saveSession = async (session: Session): Promise<Session> => {
    console.log(`[Repo] saveSession called for ID: ${session.id} - Name: ${session.name}`);
    return new Promise((resolve, reject) => {
      try {
        if (!session.projectDirectory || !session.outputFormat) {
          return reject(new Error("Missing required session fields: projectDirectory and outputFormat"));
        } // Close validation check
        const projectHash = hashString(session.projectDirectory);
        
        // Extract included files and excluded files
        const includedFilesArray = session.includedFiles || []; // Ensure arrays exist
        const excludedFilesArray = session.forceExcludedFiles || [];

        // Begin transaction
        db.run('BEGIN TRANSACTION', async (err) => {
          if (err) {
            console.error("Begin transaction error:", err);
            if (err.message && err.message.includes('cannot start a transaction within a transaction')) {
              console.log("Detected nested transaction, proceeding without explicit transaction");
              await handleSessionSave(resolve, reject, projectHash, session, includedFilesArray, excludedFilesArray, true); // Pass projectHash and true for noTransaction
            } else {
              return reject(err);
            } // Close nested transaction check
          } else {
            await handleSessionSave(resolve, reject, projectHash, session, includedFilesArray, excludedFilesArray, false);
          } // Close else block
          
          // Helper function to handle session save logic
          async function handleSessionSave(
            resolve: (value: Session) => void, reject: (reason: any) => void, projectHash: string, session: Session, includedFilesArray: string[], excludedFilesArray: string[], noTransaction: boolean
          ) { // Added parameters
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
              isRegexActive: session.isRegexActive,
              codebaseStructure: session.codebaseStructure || '',
              outputFormat: session.outputFormat,
              customFormat: session.customFormat || '',
              updatedAt: Date.now(), // Use current timestamp for update
              // Explicitly include Gemini fields, providing defaults if they are missing
              geminiStatus: currentGeminiStatus,
              geminiStartTime: session.geminiStartTime || null,
              geminiEndTime: session.geminiEndTime || null,
              geminiPatchPath: session.geminiPatchPath || null,
              geminiTokensReceived: session.geminiTokensReceived || 0,
              geminiCharsReceived: session.geminiCharsReceived || 0,
              geminiLastUpdate: session.geminiLastUpdate || null,
              geminiStatusMessage: session.geminiStatusMessage || null,
            };
            console.log(`[Repo] Preparing to INSERT/REPLACE session ${sessionValues.id} with values:`, sessionValues);

            db.run(`
              -- Insert or update the main session data
              INSERT OR REPLACE INTO sessions
              (id, name, project_directory, project_hash, task_description, search_term, pasted_paths,
               pattern_description, title_regex, content_regex, is_regex_active,
               codebase_structure, output_format, custom_format, updated_at,
               gemini_status, gemini_start_time, gemini_end_time, gemini_patch_path, gemini_status_message, gemini_tokens_received, gemini_chars_received, gemini_last_update)
              VALUES -- Match the order of columns
              (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
              sessionValues.isRegexActive ? 1 : 0,
              sessionValues.codebaseStructure,
              sessionValues.outputFormat,
              sessionValues.customFormat,
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
                  db.run('ROLLBACK', () => reject(saveErr));
                } else {
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
                console.log(`[Repo] Deleted existing included_files for session ${session.id}`);

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
                  console.log(`[Repo] Inserted ${includedFilesArray.length} included_files for session ${session.id}`);
                }

                // Delete existing excluded files for this session
                await new Promise<void>((resolveDelete, rejectDelete) => {
                  db.run(`DELETE FROM excluded_files WHERE session_id = ?`, [session.id], (deleteErr) => {
                    if (deleteErr) { console.error("Error deleting excluded files:", deleteErr); rejectDelete(deleteErr); }
                    else resolveDelete();
                  });
                });
                 console.log(`[Repo] Deleted existing excluded_files for session ${session.id}`);

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
                  console.log(`[Repo] Inserted ${excludedFilesArray.length} excluded_files for session ${session.id}`);
                }

                // Only commit if we started a transaction
                if (!noTransaction) { // Use noTransaction flag
                  // Commit the transaction
                  db.run('COMMIT', (commitErr) => {
                    if (commitErr) {
                      console.error("Commit error:", commitErr);
                      db.run('ROLLBACK', () => reject(commitErr));
                    } else {
                      console.log(`[Repo] Successfully committed save for session ${session.id}`);
                      resolve(session);
                    }
                  });
                } else {
                  // If we're not in a transaction (due to nesting), just resolve
                  resolve(session);
                }
              } catch (fileError) {
                console.error("Error processing files:", fileError);
                // Only rollback if we started a transaction
                if (!noTransaction) { // Use noTransaction flag
                  db.run('ROLLBACK', () => reject(fileError));
                  console.log(`[Repo] Rolled back transaction for session ${session.id} due to file error`);
                } else {
                  reject(fileError);
                }
              }
            });
          } // End of handleSessionSave helper
        });
      } catch (error) {
        console.error("Outer catch error in saveSession:", error);
        reject(error);
      }
    });
  };

  /**
   * Get all sessions for a specific project directory and output format
   */
  getSessions = async (projectDirectory: string, outputFormat: OutputFormat): Promise<Session[]> => { // Add async keyword
    console.log(`[Repo] Getting sessions for Project: ${projectDirectory}, Format: ${outputFormat}`);
    
    // Generate project hash for safer SQL queries
    const projectHash = hashString(projectDirectory);
    
    return new Promise((resolve, reject) => {
      db.all(`
        SELECT * FROM sessions
        WHERE project_hash = ? AND output_format = ?
        ORDER BY updated_at DESC -- Show most recent first
      `, [projectHash, outputFormat], async (err, sessionRows: any[]) => {
        if (err) {
          console.error("Error fetching sessions:", err);
          return reject(err);
        }

        if (!sessionRows || sessionRows.length === 0) {
          return resolve([]);
        }

        try {
          const sessions: Session[] = [];
          const sessionIds = sessionRows.map(row => row.id);

          if (sessionIds.length === 0) return resolve([]);

          // Create placeholders for IN clause
          const placeholders = sessionIds.map(() => '?').join(',');

          // Get included files for these sessions
          const includedFiles = await new Promise<any[]>((resolveFiles, rejectFiles) => {
            db.all(`SELECT session_id, file_path FROM included_files WHERE session_id IN (${placeholders})`,
              sessionIds, (errFiles, rows) => {
                if (errFiles) { console.error("Error fetching included files:", errFiles); rejectFiles(errFiles); }
                else resolveFiles(rows || []);
            });
          });

          // Get excluded files for these sessions
          const excludedFiles = await new Promise<any[]>((resolveFiles, rejectFiles) => {
            db.all(`SELECT session_id, file_path FROM excluded_files WHERE session_id IN (${placeholders})`,
              sessionIds, (errFiles, rows) => {
              if (errFiles) { console.error("Error fetching excluded files:", errFiles); rejectFiles(errFiles); }
              else resolveFiles(rows || []);
            });
          });

          // Group files by session ID for efficient lookup
          const includedFilesMap = includedFiles.reduce((acc, file) => {
            if (!acc[file.session_id]) acc[file.session_id] = [];
            acc[file.session_id].push(file.file_path);
            return acc;
          }, {} as Record<string, string[]>);

          const excludedFilesMap = excludedFiles.reduce((acc, file) => {
            if (!acc[file.session_id]) acc[file.session_id] = [];
            acc[file.session_id].push(file.file_path);
            return acc;
          }, {} as Record<string, string[]>);

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
              codebaseStructure: row.codebase_structure || '',
              includedFiles: includedFilesMap[row.id] || [],
              forceExcludedFiles: excludedFilesMap[row.id] || [],
              outputFormat: row.output_format as OutputFormat,
              // Ensure updatedAt is populated if needed later
              customFormat: row.custom_format || '', // Add customFormat
              // Add Gemini fields
              geminiStatus: row.gemini_status as GeminiStatus || 'idle', // Add type assertion
              geminiStartTime: row.gemini_start_time || null,
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
            projectDirectory: row.project_directory,
            taskDescription: row.task_description || '',
            searchTerm: row.search_term || '',
            pastedPaths: row.pasted_paths || '',
            patternDescription: row.pattern_description || '',
            titleRegex: row.title_regex || '',
            contentRegex: row.content_regex || '',
            isRegexActive: !!row.is_regex_active,
            codebaseStructure: row.codebase_structure || '',
            includedFiles,
            forceExcludedFiles: excludedFiles,
            outputFormat: row.output_format as OutputFormat,
            // Ensure updatedAt is populated if needed later
            customFormat: row.custom_format || '', // Add customFormat
            // Add Gemini fields
            geminiStatus: row.gemini_status || 'idle',
            geminiStartTime: row.gemini_start_time || null,
            geminiEndTime: row.gemini_end_time || null,
            geminiPatchPath: row.gemini_patch_path || null,
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
    outputFormat: OutputFormat,
    sessionId: string | null // Allow null to clear active session
  ): Promise<void> => {
    // Generate project hash for safer SQL queries
    const projectHash = hashString(projectDirectory);
    
    return new Promise((resolve, reject) => {
      db.run(`
        INSERT OR REPLACE INTO project_settings (project_hash, output_format, active_session_id, updated_at)
        VALUES (?, ?, ?, ?)
      `, [projectHash, outputFormat, sessionId, Date.now()], (err) => {
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
    projectDirectory: string,
    outputFormat: OutputFormat
  ): Promise<string | null> => {
    // Generate project hash for safer SQL queries
    const projectHash = hashString(projectDirectory);
    
    return new Promise((resolve, reject) => {
      db.get(`
        SELECT active_session_id FROM project_settings
        WHERE project_hash = ? AND output_format = ?
      `, [projectHash, outputFormat], (err, row: any) => {
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
    projectDirectory: string | null | undefined, // Allow null/undefined for global
    outputFormat: OutputFormat,
    key: string
  ): Promise<string | null> => {
    // Generate project hash for safer SQL queries
    const projectHash = hashString(projectDirectory || 'global');
    const safeOutputFormat = outputFormat || 'global';
    
    if (!key) {
      console.error("Missing key in getCachedState");
      return null;
    }

    // Only log for non-files keys to reduce noise
    if (!key.includes('files')) {
      console.log(`[Repo] Getting cached state for ${projectHash}/${safeOutputFormat}/${key}`);
    }

    return new Promise((resolve, reject) => {
      db.get(`
        SELECT value FROM cached_state -- Select only value
        WHERE project_hash = ? AND output_format = ? AND key = ?
      `, [projectHash, safeOutputFormat, key], (err, row: any) => {
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
    projectDirectory: string | null | undefined, // Allow null/undefined for global
    outputFormat: OutputFormat,
    key: string,
    value: string
  ): Promise<void> => {
    // Generate project hash for safer SQL queries
    const projectHash = hashString(projectDirectory || 'global'); // Use 'global' context if needed
    const safeOutputFormat = outputFormat || 'global'; // Use 'global' context if needed
    if (!key) {
      console.error("Missing key in saveCachedState");
      return;
    } // Close key check
    const timestamp = Date.now();
    
    // Ensure value is a string
    const safeValue = value === null || value === undefined ? '' : String(value);
    
    return new Promise((resolve, reject) => {
      db.run(`
        INSERT OR REPLACE INTO cached_state (project_hash, output_format, key, value, updated_at)
        VALUES (?, ?, ?, ?, ?)
      `, [projectHash, safeOutputFormat, key, safeValue, timestamp], (err) => {
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
        setClauses.push('gemini_patch_path = ?'); // Ensure column name matches DB schema
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
          s.codebase_structure, s.output_format, s.custom_format,
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
              projectDirectory: row.project_directory,
              taskDescription: row.task_description || '',
              searchTerm: row.search_term || '',
              pastedPaths: row.pasted_paths || '',
              patternDescription: row.pattern_description || '',
              titleRegex: row.title_regex || '',
              contentRegex: row.content_regex || '',
              isRegexActive: !!row.is_regex_active,
              codebaseStructure: row.codebase_structure || '',
              outputFormat: row.output_format as OutputFormat,
              customFormat: row.custom_format || '',
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
}

// Create and export a singleton instance of the repository
export const sessionRepository = new SessionRepository(); // Keep export
