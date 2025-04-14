import { db } from './index';
import { Session } from '@/types/session-types';
import { OutputFormat } from '@/types';
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
        }
        const projectHash = hashString(session.projectDirectory);
        
        // Extract included files and excluded files
        const includedFilesArray = session.includedFiles || [];
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
            }
          } else {
            await handleSessionSave(resolve, reject, projectHash, session, includedFilesArray, excludedFilesArray, false); // Pass projectHash and false for noTransaction
          }
          
          // Helper function to handle session save logic - extracted to avoid code duplication
          async function handleSessionSave(resolve: (value: Session) => void, reject: (reason: any) => void) {
            // First save or update the session
            const sessionValues = {
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
              customFormat: (session as any).customFormat || '',
              updatedAt: Date.now(), // Use milliseconds timestamp,
            };

            // Log the values being inserted/replaced
            console.log(`[Repo] Preparing to INSERT/REPLACE session ${sessionValues.id} with values:`, sessionValues);

            // Insert or replace the session data
            // Update schema query to include project_hash if needed
            db.run(`
              INSERT OR REPLACE INTO sessions
              (id, name, project_directory, project_hash, task_description, search_term, pasted_paths,
               pattern_description, title_regex, content_regex, is_regex_active,
               codebase_structure, output_format, custom_format, updated_at)
              VALUES
              (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) 
            `, [
              sessionValues.id,
              sessionValues.name,
              sessionValues.projectDirectory,
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
              sessionValues.updatedAt
            ], async function(saveErr) {
              if (saveErr) {
                console.error("Error saving session:", saveErr);
                // Only rollback if we're in a transaction
                if (!err) {
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
                if (!err) {
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
                  // If we're not in a transaction, just resolve
                  resolve(session);
                }
              } catch (fileError) {
                console.error("Error processing files:", fileError);
                // Only rollback if we started a transaction
                if (!err) {
                  db.run('ROLLBACK', () => reject(fileError));
                  console.log(`[Repo] Rolled back transaction for session ${session.id} due to file error`);
                } else {
                  reject(fileError);
                }
              }
            });
          }
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
              customFormat: row.custom_format || '',
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
            customFormat: row.custom_format || '',
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

      console.log(`[Repo] Getting cached state for ${projectHash}/${safeOutputFormat}/${key}`);
    return new Promise((resolve, reject) => {
      db.get(`
        SELECT value FROM cached_state
        WHERE project_hash = ? AND output_format = ? AND key = ?
      `, [projectHash, safeOutputFormat, key], (err, row: any) => {
        if (err) {
          console.error("Error getting cached state:", err);
          reject(err);
        } else { // Check if row exists before accessing value
          console.log(`[Repo] Cache result for ${key}:`, row ? 'Found' : 'Not Found');
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
    if (!key) {
      console.error("Missing key in saveCachedState");
      return;
    }
    
    // Generate project hash for safer SQL queries
    const projectHash = hashString(projectDirectory || 'global');
    const safeOutputFormat = outputFormat || 'global';
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
          // console.log(`[Repo] Saved cached state for ${key}`); // Reduce noise
          resolve();
        }
      });
    });
  };
}

// Create and export a singleton instance of the repository
export const sessionRepository = new SessionRepository();
