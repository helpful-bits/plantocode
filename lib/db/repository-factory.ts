import connectionPool from './connection-pool';
import { Session, JobStatus, BackgroundJob, ApiType, TaskType } from '@/types';
import { hashString } from '@/lib/hash';
import { normalizePath } from '../path-utils';
import crypto from 'crypto';

/**
 * Repository Factory for Session Management
 * 
 * IMPORTANT REFACTORING NOTES:
 * - The 'gemini_requests' table has been replaced by the 'background_jobs' table
 * - All methods have been updated to use the new table structure
 * - 'background_jobs' now supports multiple API types (Gemini, Claude, Whisper) 
 *   and task types (xml_generation, pathfinder, transcription, etc.)
 * - The 'task_settings' column has been removed from the 'sessions' table
 *   as settings are now stored globally per project in the 'cached_state' table
 * - References to model-specific fields in 'sessions' have been removed
 *
 * This factory creates a repository for managing sessions, their files,
 * and associated background jobs (formerly gemini_requests).
 */

/**
 * Creates a SessionRepository instance that uses the connection pool
 * for better concurrent database access
 */
export function createSessionRepository() {
  // Create the repository object
  const repository = {
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
            Date.now(), // Updated timestamp
          ];
          
          // Build SQL statement
          let sql = `
            INSERT OR REPLACE INTO sessions
            (id, name, project_directory, project_hash, task_description, search_term, pasted_paths,
             title_regex, content_regex, is_regex_active, diff_temperature, codebase_structure, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
          
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
              projectHash: row.project_hash,
              taskDescription: row.task_description || '',
              searchTerm: row.search_term || '',
              pastedPaths: row.pasted_paths || '',
              titleRegex: row.title_regex || '',
              contentRegex: row.content_regex || '',
              isRegexActive: !!row.is_regex_active,
              diffTemperature: row.diff_temperature || 0.9,
              codebaseStructure: row.codebase_structure || '',
              includedFiles,
              forceExcludedFiles: excludedFiles,
              updatedAt: row.updated_at || Date.now(),
            };
            
            resolve(session);
          });
        });
      }, true); // Use read-only connection
    },
    
    /**
     * Get all sessions
     */
    getAllSessions: async (): Promise<Session[]> => {
      console.log(`[Repo] Getting all sessions`);
      
      return connectionPool.withConnection(async (db) => {
        return new Promise<Session[]>((resolve, reject) => {
          db.all(`SELECT * FROM sessions ORDER BY updated_at DESC`, [], async (err, rows: any[]) => {
            if (err) {
              console.error("Error fetching all sessions:", err);
              return reject(err);
            }
            
            if (!rows || rows.length === 0) {
              return resolve([]);
            }
            
            try {
              // Process each session
              const sessions: Session[] = [];
              
              for (const row of rows) {
                const sessionId = row.id;
                
                // Fetch included files for this session
                let includedFiles: string[] = [];
                try {
                  includedFiles = await new Promise<string[]>((resolveFiles, rejectFiles) => {
                    db.all(`SELECT file_path FROM included_files WHERE session_id = ?`, [sessionId], (fileErr, fileRows: any[]) => {
                      if (fileErr) {
                        console.error(`Error fetching included files for session ${sessionId}:`, fileErr);
                        return rejectFiles(fileErr);
                      }
                      resolveFiles(fileRows.map(r => r.file_path));
                    });
                  });
                } catch (error) {
                  console.error(`Error fetching included files for session ${sessionId}:`, error);
                  includedFiles = [];
                }
                
                // Fetch excluded files for this session
                let excludedFiles: string[] = [];
                try {
                  excludedFiles = await new Promise<string[]>((resolveFiles, rejectFiles) => {
                    db.all(`SELECT file_path FROM excluded_files WHERE session_id = ?`, [sessionId], (fileErr, fileRows: any[]) => {
                      if (fileErr) {
                        console.error(`Error fetching excluded files for session ${sessionId}:`, fileErr);
                        return rejectFiles(fileErr);
                      }
                      resolveFiles(fileRows.map(r => r.file_path));
                    });
                  });
                } catch (error) {
                  console.error(`Error fetching excluded files for session ${sessionId}:`, error);
                  excludedFiles = [];
                }
                
                // Create and add the Session object
                const session: Session = {
                  id: sessionId,
                  name: row.name,
                  projectDirectory: row.project_directory || '',
                  projectHash: row.project_hash,
                  taskDescription: row.task_description || '',
                  searchTerm: row.search_term || '',
                  pastedPaths: row.pasted_paths || '',
                  titleRegex: row.title_regex || '',
                  contentRegex: row.content_regex || '',
                  isRegexActive: !!row.is_regex_active,
                  diffTemperature: row.diff_temperature || 0.9,
                  codebaseStructure: row.codebase_structure || '',
                  includedFiles,
                  forceExcludedFiles: excludedFiles,
                  updatedAt: row.updated_at || Date.now(),
                };
                
                sessions.push(session);
              }
              
              resolve(sessions);
            } catch (error) {
              console.error("Error processing sessions:", error);
              reject(error);
            }
          });
        });
      }, true); // Use read-only connection
    },
    
    /**
     * Delete a session by ID
     */
    deleteSession: async (sessionId: string): Promise<void> => {
      console.log(`[Repo] Deleting session: ${sessionId}`);
      
      try {
        return await connectionPool.withTransaction(async (db) => {
          try {
            // Delete included files
            await new Promise<void>((resolve, reject) => {
              db.run(`DELETE FROM included_files WHERE session_id = ?`, [sessionId], (err) => {
                if (err) {
                  console.error(`Error deleting included files for session ${sessionId}:`, err);
                  return reject(err);
                }
                resolve();
              });
            });
            
            // Delete excluded files
            await new Promise<void>((resolve, reject) => {
              db.run(`DELETE FROM excluded_files WHERE session_id = ?`, [sessionId], (err) => {
                if (err) {
                  console.error(`Error deleting excluded files for session ${sessionId}:`, err);
                  return reject(err);
                }
                resolve();
              });
            });
            
            // Delete background jobs
            await new Promise<void>((resolve, reject) => {
              db.run(`DELETE FROM background_jobs WHERE session_id = ?`, [sessionId], (err) => {
                if (err) {
                  console.error(`Error deleting background jobs for session ${sessionId}:`, err);
                  return reject(err);
                }
                resolve();
              });
            });
            
            // Delete the session itself
            await new Promise<void>((resolve, reject) => {
              db.run(`DELETE FROM sessions WHERE id = ?`, [sessionId], function(err) {
                if (err) {
                  console.error(`Error deleting session ${sessionId}:`, err);
                  return reject(err);
                }
                
                if (this.changes === 0) {
                  console.warn(`No session found with ID ${sessionId} to delete`);
                }
                
                resolve();
              });
            });
          } catch (error) {
            console.error(`Error deleting session ${sessionId}:`, error);
            throw error;
          }
        });
      } catch (error) {
        // Check for readonly database error and provide more helpful message
        if (error instanceof Error && 
            (error.message.includes('SQLITE_READONLY') || 
             error.message.includes('readonly database'))) {
          console.error(`Cannot delete session: database is in read-only mode. Please check file permissions for the database.`);
          throw new Error(`Cannot delete session: The database is in read-only mode. This may be due to file permission issues.`);
        }
        throw error;
      }
    },
    
    /**
     * Delete all sessions
     */
    deleteAllSessions: async (): Promise<void> => {
      console.log(`[Repo] Deleting all sessions`);
      
      return connectionPool.withTransaction(async (db) => {
        try {
          // Delete all included files
          await new Promise<void>((resolve, reject) => {
            db.run(`DELETE FROM included_files`, [], (err) => {
              if (err) {
                console.error(`Error deleting all included files:`, err);
                return reject(err);
              }
              resolve();
            });
          });
          
          // Delete all excluded files
          await new Promise<void>((resolve, reject) => {
            db.run(`DELETE FROM excluded_files`, [], (err) => {
              if (err) {
                console.error(`Error deleting all excluded files:`, err);
                return reject(err);
              }
              resolve();
            });
          });
          
          // Delete all background jobs
          await new Promise<void>((resolve, reject) => {
            db.run(`DELETE FROM background_jobs`, [], (err) => {
              if (err) {
                console.error(`Error deleting all background jobs:`, err);
                return reject(err);
              }
              resolve();
            });
          });
          
          // Delete all sessions
          await new Promise<void>((resolve, reject) => {
            db.run(`DELETE FROM sessions`, [], (err) => {
              if (err) {
                console.error(`Error deleting all sessions:`, err);
                return reject(err);
              }
              resolve();
            });
          });
        } catch (error) {
          console.error(`Error deleting all sessions:`, error);
          throw error;
        }
      });
    },
    
    /**
     * Create a background job record
     */
    createBackgroundJob: async (
      sessionId: string,
      prompt: string,
      apiType: ApiType = 'gemini',
      taskType: TaskType = 'xml_generation',
      modelUsed: string | null = null,
      maxOutputTokens: number | null = null
    ): Promise<BackgroundJob> => {
      console.log(`[Repo] Creating background job for session: ${sessionId}, type: ${taskType}, api: ${apiType}`);
      
      // Generate a random ID for the job
      const id = crypto.randomUUID();
      const timestamp = Date.now();
      
      // Create the default job object
      const job: BackgroundJob = {
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
        createdAt: timestamp,
        apiType,
        taskType,
        modelUsed,
        maxOutputTokens
      };
      
      // Insert the job record
      await connectionPool.withConnection(async (db) => {
        return new Promise<void>((resolve, reject) => {
          db.run(`
            INSERT INTO background_jobs (
              id, session_id, prompt, status, created_at, 
              api_type, task_type, model_used, max_output_tokens
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
          `, [
            id,
            sessionId,
            prompt,
            'idle',
            timestamp,
            apiType,
            taskType,
            modelUsed,
            maxOutputTokens
          ], (err) => {
            if (err) {
              console.error("Error creating background job:", err);
              reject(err);
            } else {
              resolve();
            }
          });
        });
      });
      
      return job;
    },
    
    /**
     * Get a background job by ID
     */
    getBackgroundJob: async (jobId: string): Promise<BackgroundJob | null> => {
      console.log(`[Repo] Getting background job: ${jobId}`);
      
      return connectionPool.withConnection(async (db) => {
        return new Promise<BackgroundJob | null>((resolve, reject) => {
          db.get(`
            SELECT * FROM background_jobs WHERE id = ?
          `, [jobId], (err, row: any) => {
            if (err) {
              console.error("Error fetching background job:", err);
              reject(err);
            } else if (!row) {
              resolve(null);
            } else {
              const job: BackgroundJob = {
                id: row.id,
                sessionId: row.session_id,
                prompt: row.prompt,
                status: row.status as JobStatus,
                startTime: row.start_time,
                endTime: row.end_time,
                xmlPath: row.xml_path,
                statusMessage: row.status_message,
                tokensReceived: row.tokens_received || 0,
                charsReceived: row.chars_received || 0,
                lastUpdate: row.last_update,
                createdAt: row.created_at,
                cleared: !!row.cleared,
                apiType: row.api_type as ApiType,
                taskType: row.task_type as TaskType,
                modelUsed: row.model_used,
                maxOutputTokens: row.max_output_tokens
              };
              resolve(job);
            }
          });
        });
      }, true); // Use read-only connection
    },
    
    /**
     * Get all background jobs for a session
     */
    getBackgroundJobs: async (sessionId: string): Promise<BackgroundJob[]> => {
      console.log(`[Repo] Getting background jobs for session: ${sessionId}`);
      
      return connectionPool.withConnection(async (db) => {
        return new Promise<BackgroundJob[]>((resolve, reject) => {
          db.all(`
            SELECT * FROM background_jobs 
            WHERE session_id = ? 
            ORDER BY created_at DESC
          `, [sessionId], (err, rows: any[]) => {
            if (err) {
              console.error("Error fetching background jobs:", err);
              reject(err);
            } else {
              const jobs: BackgroundJob[] = rows.map(row => ({
                id: row.id,
                sessionId: row.session_id,
                prompt: row.prompt,
                status: row.status as JobStatus,
                startTime: row.start_time,
                endTime: row.end_time,
                xmlPath: row.xml_path,
                statusMessage: row.status_message,
                tokensReceived: row.tokens_received || 0,
                charsReceived: row.chars_received || 0,
                lastUpdate: row.last_update,
                createdAt: row.created_at,
                cleared: !!row.cleared,
                apiType: row.api_type as ApiType,
                taskType: row.task_type as TaskType,
                modelUsed: row.model_used,
                maxOutputTokens: row.max_output_tokens
              }));
              resolve(jobs);
            }
          });
        });
      }, true); // Use read-only connection
    },
    
    /**
     * Find background jobs for a session with filtering options
     */
    findBackgroundJobsBySessionId: async (
      sessionId: string,
      options?: { 
        limit?: number, 
        status?: JobStatus | JobStatus[], 
        type?: TaskType 
      }
    ): Promise<BackgroundJob[]> => {
      console.log(`[Repo] Finding background jobs for session: ${sessionId} with options:`, options);
      
      return connectionPool.withConnection(async (db) => {
        return new Promise<BackgroundJob[]>((resolve, reject) => {
          // Build the query with conditions
          let query = `
            SELECT * FROM background_jobs 
            WHERE session_id = ?
          `;
          
          const params: any[] = [sessionId];
          
          // Add status condition if provided
          if (options?.status) {
            if (Array.isArray(options.status)) {
              // Handle multiple statuses with IN clause
              const placeholders = options.status.map(() => '?').join(',');
              query += ` AND status IN (${placeholders})`;
              params.push(...options.status);
            } else {
              // Handle single status
              query += ` AND status = ?`;
              params.push(options.status);
            }
          }
          
          // Add task type condition if provided
          if (options?.type) {
            query += ` AND task_type = ?`;
            params.push(options.type);
          }
          
          // Add ordering
          query += ` ORDER BY created_at DESC`;
          
          // Add limit if provided
          if (options?.limit) {
            query += ` LIMIT ?`;
            params.push(options.limit);
          }
          
          db.all(query, params, (err, rows: any[]) => {
            if (err) {
              console.error("Error finding background jobs:", err);
              reject(err);
            } else {
              const jobs: BackgroundJob[] = rows.map(row => ({
                id: row.id,
                sessionId: row.session_id,
                prompt: row.prompt,
                status: row.status as JobStatus,
                startTime: row.start_time,
                endTime: row.end_time,
                xmlPath: row.xml_path,
                statusMessage: row.status_message,
                tokensReceived: row.tokens_received || 0,
                charsReceived: row.chars_received || 0,
                lastUpdate: row.last_update,
                createdAt: row.created_at,
                cleared: !!row.cleared,
                apiType: row.api_type as ApiType,
                taskType: row.task_type as TaskType,
                modelUsed: row.model_used,
                maxOutputTokens: row.max_output_tokens
              }));
              resolve(jobs);
            }
          });
        });
      }, true); // Use read-only connection
    },
    
    /**
     * Get all visible background jobs
     */
    getAllVisibleBackgroundJobs: async (): Promise<BackgroundJob[]> => {
      // Removed logging to prevent spam
      
      return connectionPool.withConnection(async (db) => {
        return new Promise<BackgroundJob[]>((resolve, reject) => {
          db.all(`
            SELECT * FROM background_jobs 
            WHERE cleared = 0 
            ORDER BY created_at DESC
          `, [], (err, rows: any[]) => {
            if (err) {
              console.error("Error fetching visible background jobs:", err);
              reject(err);
            } else {
              const jobs: BackgroundJob[] = rows.map(row => ({
                id: row.id,
                sessionId: row.session_id,
                prompt: row.prompt,
                status: row.status as JobStatus,
                startTime: row.start_time,
                endTime: row.end_time,
                xmlPath: row.xml_path,
                statusMessage: row.status_message,
                tokensReceived: row.tokens_received || 0,
                charsReceived: row.chars_received || 0,
                lastUpdate: row.last_update,
                createdAt: row.created_at,
                cleared: !!row.cleared,
                apiType: row.api_type as ApiType,
                taskType: row.task_type as TaskType,
                modelUsed: row.model_used,
                maxOutputTokens: row.max_output_tokens
              }));
              resolve(jobs);
            }
          });
        });
      }, true); // Use read-only connection
    },
    
    /**
     * Update background job status
     */
    updateBackgroundJobStatus: async (
      jobId: string,
      status: JobStatus,
      startTime?: number | null,
      endTime?: number | null,
      xmlPath?: string | null,
      statusMessage?: string | null,
      stats?: { tokensReceived?: number, charsReceived?: number }
    ): Promise<void> => {
      console.log(`[Repo] Updating background job ${jobId} status to ${status}`);
      
      // Build the update fields and parameters
      const updates: string[] = [];
      const params: any[] = [];
      
      updates.push('status = ?');
      params.push(status);
      
      if (startTime !== undefined) {
        updates.push('start_time = ?');
        params.push(startTime);
      }
      
      if (endTime !== undefined) {
        updates.push('end_time = ?');
        params.push(endTime);
      }
      
      if (xmlPath !== undefined) {
        updates.push('xml_path = ?');
        params.push(xmlPath);
      }
      
      if (statusMessage !== undefined) {
        updates.push('status_message = ?');
        params.push(statusMessage);
      }
      
      if (stats) {
        if (stats.tokensReceived !== undefined) {
          updates.push('tokens_received = ?');
          params.push(stats.tokensReceived);
        }
        
        if (stats.charsReceived !== undefined) {
          updates.push('chars_received = ?');
          params.push(stats.charsReceived);
        }
      }
      
      if (status === 'running' || startTime !== undefined || stats) {
        updates.push('last_update = ?');
        params.push(Date.now());
      }
      
      // Add the job ID to the params
      params.push(jobId);
      
      // Execute the update query
      await connectionPool.withConnection(async (db) => {
        return new Promise<void>((resolve, reject) => {
          const sql = `UPDATE background_jobs SET ${updates.join(', ')} WHERE id = ?`;
          
          db.run(sql, params, function(err) {
            if (err) {
              console.error("Error updating background job status:", err);
              reject(err);
            } else {
              resolve();
            }
          });
        });
      });
    },
    
    /**
     * Clear background job history for all sessions
     */
    clearBackgroundJobHistory: async (): Promise<void> => {
      console.log(`[Repo] Clearing all background job history`);
      
      await connectionPool.withConnection(async (db) => {
        return new Promise<void>((resolve, reject) => {
          db.run(`UPDATE background_jobs SET cleared = 1`, [], (err) => {
            if (err) {
              console.error("Error clearing background job history:", err);
              reject(err);
            } else {
              resolve();
            }
          });
        });
      });
    },
    
    /**
     * Update background job cleared status
     */
    updateBackgroundJobClearedStatus: async (jobId: string, cleared: boolean): Promise<void> => {
      console.log(`[Repo] Updating background job ${jobId} cleared status to ${cleared}`);
      
      return connectionPool.withConnection(async (db) => {
        return new Promise<void>((resolve, reject) => {
          db.run(`
            UPDATE background_jobs 
            SET cleared = ?
            WHERE id = ?
          `, [cleared ? 1 : 0, jobId], async (err) => {
            if (err) {
              console.error(`Error updating background job ${jobId} cleared status:`, err);
              reject(err);
            } else {
              resolve();
            }
          });
        });
      });
    },
    
    /**
     * Cancel all running background jobs for a session
     */
    cancelAllSessionBackgroundJobs: async (sessionId: string): Promise<void> => {
      console.log(`[Repo] Canceling all running background jobs for session: ${sessionId}`);
      
      return connectionPool.withConnection(async (db) => {
        return new Promise<void>((resolve, reject) => {
          db.run(`
            UPDATE background_jobs 
            SET status = 'canceled', end_time = ?, status_message = 'Canceled by user.'
            WHERE session_id = ? AND status = 'running'
          `, [Date.now(), sessionId], async (err) => {
            if (err) {
              reject(err);
            } else {
              try {
                // Fetch and broadcast all canceled jobs
                const canceledJobs = await repository.getBackgroundJobs(sessionId);
                // Note: Broadcasting can be handled by the consumer of this method
                // We've removed direct reference to websocketHandler as it's not defined here
              } catch (error) {
                console.error(`Error fetching canceled jobs for session ${sessionId}:`, error);
              }
              resolve();
            }
          });
        });
      });
    },
    
    /**
     * Retrieve a session with all of its background jobs
     */
    getSessionWithBackgroundJobs: async (sessionId: string): Promise<Session | null> => {
      console.log(`[Repo] Getting session with background jobs: ${sessionId}`);
      
      try {
        // First, get the session
        const session = await repository.getSession(sessionId);
        if (!session) {
          return null;
        }
        
        // Then, get the background jobs for the session
        const jobs = await repository.getBackgroundJobs(sessionId);
        
        // Add the jobs to the session
        session.backgroundJobs = jobs;
        
        return session;
      } catch (error) {
        console.error("Error getting session with background jobs:", error);
        throw error;
      }
    },
    
    updateSessionProjectDirectory: async (sessionId: string, projectDirectory: string): Promise<void> => {
      const projectHash = hashString(projectDirectory);
      console.log(`[Repo] Updating project directory for session ${sessionId} to: ${projectDirectory} (hash: ${projectHash})`);
      
      return connectionPool.withConnection(async (db) => {
        return new Promise<void>((resolve, reject) => {
          db.run(`
            UPDATE sessions 
            SET project_directory = ?, project_hash = ?, updated_at = ?
            WHERE id = ?
          `, [projectDirectory, projectHash, Date.now(), sessionId], function(err) {
            if (err) {
              console.error(`Error updating project directory for session ${sessionId}:`, err);
              reject(err);
            } else {
              if (this.changes === 0) {
                console.warn(`No session found with ID ${sessionId} to update project directory`);
              }
              resolve();
            }
          });
        });
      });
    },
    
    /**
     * Update a session's name
     */
    updateSessionName: async (sessionId: string, name: string): Promise<void> => {
      console.log(`[Repo] Updating name for session ${sessionId} to: ${name}`);
      
      return connectionPool.withConnection(async (db) => {
        return new Promise<void>((resolve, reject) => {
          db.run(`
            UPDATE sessions 
            SET name = ?, updated_at = ?
            WHERE id = ?
          `, [name, Date.now(), sessionId], function(err) {
            if (err) {
              console.error(`Error updating name for session ${sessionId}:`, err);
              reject(err);
            } else {
              if (this.changes === 0) {
                console.warn(`No session found with ID ${sessionId} to update name`);
                reject(new Error(`Session not found: ${sessionId}`));
              } else {
                resolve();
              }
            }
          });
        });
      });
    },
    
    /**
     * Update specific fields of a session
     * Used for partial updates via the API
     */
    updateSessionFields: async (sessionId: string, fields: Partial<Session>): Promise<void> => {
      console.log(`[Repo] Updating fields for session ${sessionId}:`, Object.keys(fields));
      
      // Validate session ID
      if (!sessionId) {
        throw new Error('Session ID is required for updating session fields');
      }
      
      // Max retries for transient errors like database locks
      const MAX_RETRIES = 3;
      let lastError: Error | null = null;
      
      for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
        // Add delay between retries
        if (attempt > 0) {
          const delay = 300 * attempt; // Progressive delay
          console.log(`[Repo] Retry attempt ${attempt}/${MAX_RETRIES} for updating session ${sessionId} after ${delay}ms`);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
        
        try {
          return await connectionPool.withConnection(async (db) => {
            return new Promise<void>((resolve, reject) => {
              // Build the update fields and parameters
              const updates: string[] = [];
              const params: any[] = [];
              
              // Map Session properties to database column names
              const fieldMappings: Record<string, string> = {
                name: 'name',
                projectDirectory: 'project_directory',
                taskDescription: 'task_description',
                searchTerm: 'search_term',
                pastedPaths: 'pasted_paths',
                titleRegex: 'title_regex',
                contentRegex: 'content_regex',
                isRegexActive: 'is_regex_active',
                diffTemperature: 'diff_temperature',
                codebaseStructure: 'codebase_structure'
              };
              
              // Process each field in the update
              for (const [key, value] of Object.entries(fields)) {
                // Skip non-scalar properties that can't be directly updated
                if (key === 'id' || key === 'includedFiles' || key === 'forceExcludedFiles' || 
                    key === 'backgroundJobs' || key === 'updatedAt' || key === 'projectHash') {
                  continue;
                }
                
                const columnName = fieldMappings[key];
                if (columnName) {
                  updates.push(`${columnName} = ?`);
                  
                  // Convert boolean to integer for SQLite
                  const paramValue = key === 'isRegexActive' ? (value ? 1 : 0) : value;
                  params.push(paramValue);
                }
              }
              
              // Always update the timestamp
              updates.push('updated_at = ?');
              params.push(Date.now());
              
              // Add the session ID to the params
              params.push(sessionId);
              
              // Execute the update query if there are fields to update
              if (updates.length > 0) {
                const sql = `UPDATE sessions SET ${updates.join(', ')} WHERE id = ?`;
                
                db.run(sql, params, function(err) {
                  if (err) {
                    console.error(`Error updating fields for session ${sessionId}:`, err);
                    reject(err);
                  } else {
                    if (this.changes === 0) {
                      console.warn(`No session found with ID ${sessionId} to update fields`);
                      reject(new Error(`Session not found: ${sessionId}`));
                    } else {
                      resolve();
                    }
                  }
                });
              } else {
                // No valid fields to update
                console.warn(`No valid fields to update for session ${sessionId}`);
                resolve();
              }
            });
          });
        } catch (error: any) {
          lastError = error instanceof Error ? error : new Error(String(error));
          
          // Only retry on database locked/busy errors
          const isTransientError = 
            error.code === 'SQLITE_BUSY' || 
            error.code === 'SQLITE_LOCKED' ||
            (error.message && (
              error.message.includes('database is locked') || 
              error.message.includes('SQLITE_BUSY')
            ));
            
          if (!isTransientError || attempt === MAX_RETRIES - 1) {
            break; // Don't retry on non-transient errors or if it's the last attempt
          }
        }
      }
      
      // If we've exhausted all retries, throw the last error
      if (lastError) {
        throw lastError;
      }
    },
  };
  
  return repository;
}

// Create and export a default instance
export const sessionRepository = createSessionRepository(); 