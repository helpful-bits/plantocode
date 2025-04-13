import { db } from './index';
import { Session } from '@/types/session-types';
import { OutputFormat } from '@/types';
import { hashString } from '@/lib/hash';

/**
 * Session Repository - Handles all session-related database operations
 */
export class SessionRepository {
  /**
   * Save a session to the database
   */
  saveSession = async (session: Session): Promise<Session> => {
    return new Promise((resolve, reject) => {
      try {
        // Extract included files and excluded files
        const includedFilesArray = session.includedFiles || [];
        const excludedFilesArray = session.forceExcludedFiles || [];

        // Begin transaction
        db.run('BEGIN TRANSACTION', async (err) => {
          if (err) {
            return reject(err);
          }

          // First save or update the session
          const sessionValues = {
            id: session.id,
            name: session.name,
            projectDirectory: session.projectDirectory,
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
            updatedAt: Date.now(),
          };

          // Try to insert first
          db.run(`
            INSERT OR REPLACE INTO sessions 
            (id, name, project_directory, task_description, search_term, pasted_paths, 
             pattern_description, title_regex, content_regex, is_regex_active, 
             codebase_structure, output_format, custom_format, updated_at)
            VALUES 
            (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `, [
            sessionValues.id,
            sessionValues.name,
            sessionValues.projectDirectory,
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
          ], async (err) => {
            if (err) {
              db.run('ROLLBACK', () => reject(err));
              return;
            }

            try {
              // Delete existing included files for this session
              await new Promise<void>((resolve, reject) => {
                db.run(`DELETE FROM included_files WHERE session_id = ?`, [session.id], (err) => {
                  if (err) reject(err);
                  else resolve();
                });
              });

              // Insert new included files
              if (includedFilesArray.length > 0) {
                for (const filePath of includedFilesArray) {
                  await new Promise<void>((resolve, reject) => {
                    db.run(`INSERT INTO included_files (session_id, file_path) VALUES (?, ?)`, 
                      [session.id, filePath], (err) => {
                        if (err) reject(err);
                        else resolve();
                    });
                  });
                }
              }

              // Delete existing excluded files for this session
              await new Promise<void>((resolve, reject) => {
                db.run(`DELETE FROM excluded_files WHERE session_id = ?`, [session.id], (err) => {
                  if (err) reject(err);
                  else resolve();
                });
              });

              // Insert new excluded files
              if (excludedFilesArray.length > 0) {
                for (const filePath of excludedFilesArray) {
                  await new Promise<void>((resolve, reject) => {
                    db.run(`INSERT INTO excluded_files (session_id, file_path) VALUES (?, ?)`, 
                      [session.id, filePath], (err) => {
                        if (err) reject(err);
                        else resolve();
                    });
                  });
                }
              }

              // Commit the transaction
              db.run('COMMIT', (err) => {
                if (err) {
                  db.run('ROLLBACK', () => reject(err));
                } else {
                  resolve(session);
                }
              });

            } catch (error) {
              db.run('ROLLBACK', () => reject(error));
            }
          });
        });
      } catch (error) {
        reject(error);
      }
    });
  };

  /**
   * Get all sessions for a specific project directory and output format
   */
  getSessions = async (projectDirectory: string, outputFormat: OutputFormat): Promise<Session[]> => {
    return new Promise((resolve, reject) => {
      db.all(`
        SELECT * FROM sessions 
        WHERE project_directory = ? AND output_format = ?
        ORDER BY updated_at
      `, [projectDirectory, outputFormat], async (err, sessionRows) => {
        if (err) {
          return reject(err);
        }

        if (!sessionRows || sessionRows.length === 0) {
          return resolve([]);
        }

        try {
          const sessions: Session[] = [];
          const sessionIds = sessionRows.map(row => row.id);
          
          // Get included files for these sessions
          const includedFiles = await new Promise<any[]>((resolve, reject) => {
            db.all(`
              SELECT * FROM included_files 
              WHERE session_id IN (${sessionIds.map(() => '?').join(',')})
            `, sessionIds, (err, rows) => {
              if (err) reject(err);
              else resolve(rows || []);
            });
          });
          
          // Get excluded files for these sessions
          const excludedFiles = await new Promise<any[]>((resolve, reject) => {
            db.all(`
              SELECT * FROM excluded_files 
              WHERE session_id IN (${sessionIds.map(() => '?').join(',')})
            `, sessionIds, (err, rows) => {
              if (err) reject(err);
              else resolve(rows || []);
            });
          });
          
          // Group files by session ID
          const includedFilesMap: Record<string, string[]> = {};
          const excludedFilesMap: Record<string, string[]> = {};
          
          includedFiles.forEach(file => {
            if (!includedFilesMap[file.session_id]) {
              includedFilesMap[file.session_id] = [];
            }
            includedFilesMap[file.session_id].push(file.file_path);
          });
          
          excludedFiles.forEach(file => {
            if (!excludedFilesMap[file.session_id]) {
              excludedFilesMap[file.session_id] = [];
            }
            excludedFilesMap[file.session_id].push(file.file_path);
          });
          
          // Create Session objects
          for (const row of sessionRows) {
            sessions.push({
              id: row.id,
              name: row.name,
              projectDirectory: row.project_directory,
              taskDescription: row.task_description,
              searchTerm: row.search_term,
              pastedPaths: row.pasted_paths,
              patternDescription: row.pattern_description,
              titleRegex: row.title_regex,
              contentRegex: row.content_regex,
              isRegexActive: !!row.is_regex_active,
              codebaseStructure: row.codebase_structure,
              includedFiles: includedFilesMap[row.id] || [],
              forceExcludedFiles: excludedFilesMap[row.id] || [],
              outputFormat: row.output_format as OutputFormat,
              ...(row.custom_format ? { customFormat: row.custom_format } : {})
            });
          }
          
          resolve(sessions);
        } catch (error) {
          reject(error);
        }
      });
    });
  };

  /**
   * Get a session by ID
   */
  getSession = async (sessionId: string): Promise<Session | null> => {
    return new Promise((resolve, reject) => {
      db.get(`SELECT * FROM sessions WHERE id = ?`, [sessionId], async (err, row) => {
        if (err) {
          return reject(err);
        }

        if (!row) {
          return resolve(null);
        }

        try {
          // Get included files
          const includedFiles = await new Promise<string[]>((resolve, reject) => {
            db.all(`SELECT file_path FROM included_files WHERE session_id = ?`, [sessionId], (err, rows) => {
              if (err) reject(err);
              else resolve((rows || []).map(row => row.file_path));
            });
          });
          
          // Get excluded files
          const excludedFiles = await new Promise<string[]>((resolve, reject) => {
            db.all(`SELECT file_path FROM excluded_files WHERE session_id = ?`, [sessionId], (err, rows) => {
              if (err) reject(err);
              else resolve((rows || []).map(row => row.file_path));
            });
          });
          
          // Create and return the Session object
          const session: Session = {
            id: row.id,
            name: row.name,
            projectDirectory: row.project_directory,
            taskDescription: row.task_description,
            searchTerm: row.search_term,
            pastedPaths: row.pasted_paths,
            patternDescription: row.pattern_description,
            titleRegex: row.title_regex,
            contentRegex: row.content_regex,
            isRegexActive: !!row.is_regex_active,
            codebaseStructure: row.codebase_structure,
            includedFiles,
            forceExcludedFiles: excludedFiles,
            outputFormat: row.output_format as OutputFormat,
            ...(row.custom_format ? { customFormat: row.custom_format } : {})
          };
          
          resolve(session);
        } catch (error) {
          reject(error);
        }
      });
    });
  };

  /**
   * Delete a session by ID
   */
  deleteSession = async (sessionId: string): Promise<void> => {
    return new Promise((resolve, reject) => {
      // The related included_files and excluded_files will be automatically deleted
      // due to the ON DELETE CASCADE constraint
      db.run(`DELETE FROM sessions WHERE id = ?`, [sessionId], (err) => {
        if (err) reject(err);
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
    sessionId: string | null
  ): Promise<void> => {
    return new Promise((resolve, reject) => {
      const projectHash = hashString(projectDirectory);
      
      // First check if the record exists
      db.get(`
        SELECT * FROM project_settings
        WHERE project_hash = ? AND output_format = ?
      `, [projectHash, outputFormat], (err, row) => {
        if (err) {
          return reject(err);
        }
        
        const timestamp = Date.now();
        
        if (row) {
          // Update existing record
          db.run(`
            UPDATE project_settings
            SET active_session_id = ?, updated_at = ?
            WHERE project_hash = ? AND output_format = ?
          `, [sessionId, timestamp, projectHash, outputFormat], (err) => {
            if (err) reject(err);
            else resolve();
          });
        } else {
          // Insert new record
          db.run(`
            INSERT INTO project_settings
            (project_hash, output_format, active_session_id, updated_at)
            VALUES (?, ?, ?, ?)
          `, [projectHash, outputFormat, sessionId, timestamp], (err) => {
            if (err) reject(err);
            else resolve();
          });
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
    return new Promise((resolve, reject) => {
      const projectHash = hashString(projectDirectory);
      
      db.get(`
        SELECT active_session_id FROM project_settings
        WHERE project_hash = ? AND output_format = ?
      `, [projectHash, outputFormat], (err, row) => {
        if (err) {
          reject(err);
        } else {
          resolve(row ? row.active_session_id : null);
        }
      });
    });
  };

  /**
   * Save a cached state item
   */
  saveCachedState = async (
    projectDirectory: string,
    outputFormat: OutputFormat,
    key: string,
    value: string
  ): Promise<void> => {
    return new Promise((resolve, reject) => {
      const projectHash = hashString(projectDirectory);
      const timestamp = Date.now();
      
      // First check if the record exists
      db.get(`
        SELECT * FROM cached_state_items
        WHERE project_hash = ? AND output_format = ? AND key = ?
      `, [projectHash, outputFormat, key], (err, row) => {
        if (err) {
          return reject(err);
        }
        
        if (row) {
          // Update existing record
          db.run(`
            UPDATE cached_state_items
            SET value = ?, updated_at = ?
            WHERE project_hash = ? AND output_format = ? AND key = ?
          `, [value, timestamp, projectHash, outputFormat, key], (err) => {
            if (err) reject(err);
            else resolve();
          });
        } else {
          // Insert new record
          db.run(`
            INSERT INTO cached_state_items
            (project_hash, output_format, key, value, updated_at)
            VALUES (?, ?, ?, ?, ?)
          `, [projectHash, outputFormat, key, value, timestamp], (err) => {
            if (err) reject(err);
            else resolve();
          });
        }
      });
    });
  };

  /**
   * Get a cached state item
   */
  getCachedState = async (
    projectDirectory: string,
    outputFormat: OutputFormat,
    key: string
  ): Promise<string | null> => {
    return new Promise((resolve, reject) => {
      const projectHash = hashString(projectDirectory);
      
      db.get(`
        SELECT value FROM cached_state_items
        WHERE project_hash = ? AND output_format = ? AND key = ?
      `, [projectHash, outputFormat, key], (err, row) => {
        if (err) {
          reject(err);
        } else {
          resolve(row ? row.value : null);
        }
      });
    });
  };
}

// Create and export a singleton instance
export const sessionRepository = new SessionRepository(); 