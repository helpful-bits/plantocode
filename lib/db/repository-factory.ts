import { connectionPool } from './connection-pool';
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
      return connectionPool.withTransaction((db) => {
        try {
          // First check if the sessions table exists and get column info
          const columnsResult = db.prepare("PRAGMA table_info(sessions)").all();
          
          // Prepare data for insertion/replacement
          const sessionValues = {
            id: session.id,
            name: session.name,
            project_directory: session.projectDirectory,
            project_hash: projectHash,
            task_description: session.taskDescription || '',
            search_term: session.searchTerm || '',
            pasted_paths: session.pastedPaths || '',
            title_regex: session.titleRegex || '',
            content_regex: session.contentRegex || '',
            is_regex_active: session.isRegexActive ? 1 : 0,
            diff_temperature: session.diffTemperature || 0.9, // Default to 0.9 if not provided
            codebase_structure: '', // Empty codebase structure
            updated_at: Date.now(), // Updated timestamp
          };
          
          // Build SQL statement
          const sql = `
            INSERT OR REPLACE INTO sessions
            (id, name, project_directory, project_hash, task_description, search_term, pasted_paths,
             title_regex, content_regex, is_regex_active, diff_temperature, codebase_structure, updated_at)
            VALUES (@id, @name, @project_directory, @project_hash, @task_description, @search_term, @pasted_paths,
             @title_regex, @content_regex, @is_regex_active, @diff_temperature, @codebase_structure, @updated_at)`;
          
          // Insert or replace the session
          db.prepare(sql).run(sessionValues);
          
          // Handle included files
          if (Array.isArray(session.includedFiles)) {
            // First delete all existing included files for this session
            db.prepare(`DELETE FROM included_files WHERE session_id = ?`).run(session.id);
            
            // Then insert new files if there are any
            if (session.includedFiles.length > 0) {
              // Use a prepared statement for better performance
              const insertStmt = db.prepare(`INSERT INTO included_files (session_id, path) VALUES (?, ?)`);
              
              // Insert each included file path
              for (const filePath of session.includedFiles) {
                insertStmt.run(session.id, filePath);
              }
            }
          }
          
          // Handle excluded files
          if (Array.isArray(session.forceExcludedFiles)) {
            // First delete all existing excluded files for this session
            db.prepare(`DELETE FROM excluded_files WHERE session_id = ?`).run(session.id);
            
            // Then insert new files if there are any
            if (session.forceExcludedFiles.length > 0) {
              // Use a prepared statement for better performance
              const insertStmt = db.prepare(`INSERT INTO excluded_files (session_id, path) VALUES (?, ?)`);
              
              // Insert each excluded file path
              for (const filePath of session.forceExcludedFiles) {
                insertStmt.run(session.id, filePath);
              }
            }
          }
          
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
      
      return connectionPool.withConnection((db) => {
        try {
          // Get the session
          const row = db.prepare(`SELECT * FROM sessions WHERE id = ?`).get(sessionId);
          
          if (!row) {
            return null;
          }
          
          // Fetch included files
          const includedFiles = db.prepare(`
            SELECT id, session_id, path 
            FROM included_files 
            WHERE session_id = ?
          `).all(sessionId).map(r => r.path);
          
          // Fetch excluded files
          const excludedFiles = db.prepare(`
            SELECT id, session_id, path 
            FROM excluded_files 
            WHERE session_id = ?
          `).all(sessionId).map(r => r.path);
          
          // Create and return the Session object
          const session: Session = {
            id: row.id,
            name: row.name,
            projectDirectory: row.project_directory,
            projectHash: row.project_hash,
            includedFiles,
            forceExcludedFiles: excludedFiles,
            taskDescription: row.task_description,
            searchTerm: row.search_term,
            pastedPaths: row.pasted_paths,
            titleRegex: row.title_regex,
            contentRegex: row.content_regex,
            isRegexActive: !!row.is_regex_active,
            diffTemperature: row.diff_temperature,
            updatedAt: row.updated_at
          };
          
          return session;
        } catch (error) {
          console.error("Error in getSession:", error);
          throw error;
        }
      }, true); // Use readonly connection
    },
    
    /**
     * Get all sessions
     */
    getAllSessions: async (): Promise<Session[]> => {
      console.log(`[Repo] Getting all sessions`);
      
      return connectionPool.withConnection((db) => {
        try {
          // Get all sessions
          const rows = db.prepare(`
            SELECT * FROM sessions 
            ORDER BY updated_at DESC
          `).all();
          
          if (!rows || rows.length === 0) {
            return [];
          }
          
          // Map rows to Session objects
          const sessions = rows.map((row: any) => {
            const includedFiles = db.prepare(`
              SELECT path FROM included_files 
              WHERE session_id = ?
            `).all(row.id).map((r: any) => r.path);
            
            const excludedFiles = db.prepare(`
              SELECT path FROM excluded_files 
              WHERE session_id = ?
            `).all(row.id).map((r: any) => r.path);
            
            return {
              id: row.id,
              name: row.name,
              projectDirectory: row.project_directory,
              projectHash: row.project_hash,
              includedFiles,
              forceExcludedFiles: excludedFiles,
              taskDescription: row.task_description,
              searchTerm: row.search_term,
              pastedPaths: row.pasted_paths,
              titleRegex: row.title_regex,
              contentRegex: row.content_regex,
              isRegexActive: !!row.is_regex_active,
              diffTemperature: row.diff_temperature,
              updatedAt: row.updated_at
            } as Session;
          });
          
          return sessions;
        } catch (error) {
          console.error("Error in getAllSessions:", error);
          throw error;
        }
      }, true); // Use readonly connection
    },
    
    /**
     * Get all sessions for a project
     */
    getSessionsForProject: async (projectDirectory: string): Promise<Session[]> => {
      console.log(`[Repo] Getting sessions for project: ${projectDirectory}`);
      
      // Hash the project directory for consistent lookup
      const projectHash = hashString(projectDirectory);
      
      return connectionPool.withConnection((db) => {
        try {
          // Get all sessions for this project
          const rows = db.prepare(`
            SELECT * FROM sessions 
            WHERE project_hash = ? 
            ORDER BY updated_at DESC
          `).all(projectHash);
          
          if (!rows || rows.length === 0) {
            return [];
          }
          
          // Map rows to Session objects
          const sessions = rows.map((row: any) => {
            const includedFiles = db.prepare(`
              SELECT path FROM included_files 
              WHERE session_id = ?
            `).all(row.id).map((r: any) => r.path);
            
            const excludedFiles = db.prepare(`
              SELECT path FROM excluded_files 
              WHERE session_id = ?
            `).all(row.id).map((r: any) => r.path);
            
            return {
              id: row.id,
              name: row.name,
              projectDirectory: row.project_directory,
              projectHash: row.project_hash,
              includedFiles,
              forceExcludedFiles: excludedFiles,
              taskDescription: row.task_description,
              searchTerm: row.search_term,
              pastedPaths: row.pasted_paths,
              titleRegex: row.title_regex,
              contentRegex: row.content_regex,
              isRegexActive: !!row.is_regex_active,
              diffTemperature: row.diff_temperature,
              updatedAt: row.updated_at
            } as Session;
          });
          
          return sessions;
        } catch (error) {
          console.error("Error in getSessionsForProject:", error);
          throw error;
        }
      }, true); // Use readonly connection
    },
    
    /**
     * Get a session with its background jobs
     */
    getSessionWithBackgroundJobs: async (sessionId: string): Promise<Session | null> => {
      console.log(`[Repo] Getting session with background jobs: ${sessionId}`);
      
      return connectionPool.withConnection((db) => {
        try {
          // First get the session
          const session = db.prepare(`SELECT * FROM sessions WHERE id = ?`).get(sessionId);
          
          if (!session) {
            return null;
          }
          
          // Fetch included files
          const includedFiles = db.prepare(`
            SELECT path FROM included_files WHERE session_id = ?
          `).all(sessionId).map(r => r.path);
          
          // Fetch excluded files
          const excludedFiles = db.prepare(`
            SELECT path FROM excluded_files WHERE session_id = ?
          `).all(sessionId).map(r => r.path);
          
          // Fetch background jobs
          const backgroundJobs = db.prepare(`
            SELECT * FROM background_jobs WHERE session_id = ? ORDER BY created_at DESC
          `).all(sessionId);
          
          // Create the Session object
          const sessionObj: Session = {
            id: session.id,
            name: session.name,
            projectDirectory: session.project_directory,
            projectHash: session.project_hash,
            includedFiles,
            forceExcludedFiles: excludedFiles,
            taskDescription: session.task_description,
            searchTerm: session.search_term,
            pastedPaths: session.pasted_paths,
            titleRegex: session.title_regex,
            contentRegex: session.content_regex,
            isRegexActive: !!session.is_regex_active,
            diffTemperature: session.diff_temperature,
            updatedAt: session.updated_at,
            backgroundJobs: backgroundJobs.map(job => ({
              id: job.id,
              sessionId: job.session_id,
              status: job.status as JobStatus,
              apiType: job.api_type as ApiType,
              taskType: job.task_type as TaskType,
              model: job.model,
              prompt: job.prompt,
              response: job.response,
              errorMessage: job.error_message,
              metadata: job.metadata ? JSON.parse(job.metadata) : {},
              createdAt: job.created_at,
              updatedAt: job.updated_at
            }))
          };
          
          return sessionObj;
        } catch (error) {
          console.error("Error in getSessionWithBackgroundJobs:", error);
          throw error;
        }
      }, true); // Use readonly connection
    },
    
    /**
     * Delete a session and all of its data
     */
    deleteSession: async (sessionId: string): Promise<boolean> => {
      console.log(`[Repo] Deleting session: ${sessionId}`);
      
      return connectionPool.withTransaction((db) => {
        try {
          // Delete all related data first
          db.prepare(`DELETE FROM background_jobs WHERE session_id = ?`).run(sessionId);
          db.prepare(`DELETE FROM included_files WHERE session_id = ?`).run(sessionId);
          db.prepare(`DELETE FROM excluded_files WHERE session_id = ?`).run(sessionId);
          
          // Delete from active_sessions if it's the active session
          db.prepare(`DELETE FROM active_sessions WHERE session_id = ?`).run(sessionId);
          
          // Finally delete the session
          const result = db.prepare(`DELETE FROM sessions WHERE id = ?`).run(sessionId);
          
          return result.changes > 0;
        } catch (error) {
          console.error("Error in deleteSession:", error);
          throw error;
        }
      });
    },
    
    /**
     * Delete all sessions for a project
     */
    deleteAllSessions: async (projectDirectory: string): Promise<number> => {
      console.log(`[Repo] Deleting all sessions for project: ${projectDirectory}`);
      
      const projectHash = hashString(projectDirectory);
      
      return connectionPool.withTransaction((db) => {
        try {
          // Get all session IDs for this project
          const sessions = db.prepare(`
            SELECT id FROM sessions WHERE project_hash = ?
          `).all(projectHash);
          
          if (sessions.length === 0) {
            return 0;
          }
          
          // Delete all sessions one by one to handle relations correctly
          for (const session of sessions) {
            db.prepare(`DELETE FROM background_jobs WHERE session_id = ?`).run(session.id);
            db.prepare(`DELETE FROM included_files WHERE session_id = ?`).run(session.id);
            db.prepare(`DELETE FROM excluded_files WHERE session_id = ?`).run(session.id);
          }
          
          // Delete from active_sessions
          db.prepare(`DELETE FROM active_sessions WHERE project_hash = ?`).run(projectHash);
          
          // Delete all sessions for this project
          const result = db.prepare(`DELETE FROM sessions WHERE project_hash = ?`).run(projectHash);
          
          return result.changes;
        } catch (error) {
          console.error("Error in deleteAllSessions:", error);
          throw error;
        }
      });
    },
    
    /**
     * Save a background job
     */
    saveBackgroundJob: async (job: BackgroundJob): Promise<BackgroundJob> => {
      console.log(`[Repo] Saving background job: ${job.id} for session: ${job.sessionId}`);
      
      return connectionPool.withTransaction((db) => {
        try {
          // Check if the background_jobs table exists
          const tableExists = db.prepare(`
            SELECT name FROM sqlite_master WHERE type='table' AND name='background_jobs'
          `).get();
          
          if (!tableExists) {
            // Create the table if it doesn't exist
            db.prepare(`
              CREATE TABLE background_jobs (
                id TEXT PRIMARY KEY,
                session_id TEXT NOT NULL,
                status TEXT NOT NULL,
                api_type TEXT NOT NULL,
                task_type TEXT NOT NULL,
                model TEXT,
                prompt TEXT,
                response TEXT,
                error_message TEXT,
                metadata TEXT,
                created_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL,
                FOREIGN KEY(session_id) REFERENCES sessions(id) ON DELETE CASCADE
              )
            `).run();
          }
          
          // Format the metadata as JSON string
          const metadata = job.metadata ? JSON.stringify(job.metadata) : null;
          
          // Prepare values for insert/update
          const jobValues = {
            id: job.id,
            session_id: job.sessionId,
            status: job.status,
            api_type: job.apiType,
            task_type: job.taskType,
            model: job.model || null,
            prompt: job.prompt || null,
            response: job.response || null,
            error_message: job.errorMessage || null,
            metadata: metadata,
            created_at: job.createdAt || Date.now(),
            updated_at: Date.now()
          };
          
          // Insert or replace the job
          db.prepare(`
            INSERT OR REPLACE INTO background_jobs
            (id, session_id, status, api_type, task_type, model, prompt, response, error_message, metadata, created_at, updated_at)
            VALUES (@id, @session_id, @status, @api_type, @task_type, @model, @prompt, @response, @error_message, @metadata, @created_at, @updated_at)
          `).run(jobValues);
          
          // Return the updated job with current timestamp
          return {
            ...job,
            updatedAt: jobValues.updated_at
          };
        } catch (error) {
          console.error("Error in saveBackgroundJob:", error);
          throw error;
        }
      });
    },
    
    /**
     * Get a background job by ID
     */
    getBackgroundJob: async (jobId: string): Promise<BackgroundJob | null> => {
      console.log(`[Repo] Getting background job: ${jobId}`);
      
      return connectionPool.withConnection((db) => {
        try {
          // Get the job
          const job = db.prepare(`SELECT * FROM background_jobs WHERE id = ?`).get(jobId);
          
          if (!job) {
            return null;
          }
          
          // Parse metadata if it exists
          let metadata = {};
          try {
            if (job.metadata) {
              metadata = JSON.parse(job.metadata);
            }
          } catch (err) {
            console.warn(`Error parsing metadata for job ${jobId}:`, err);
          }
          
          // Return the background job
          return {
            id: job.id,
            sessionId: job.session_id,
            status: job.status as JobStatus,
            apiType: job.api_type as ApiType,
            taskType: job.task_type as TaskType,
            model: job.model,
            prompt: job.prompt,
            response: job.response,
            errorMessage: job.error_message,
            metadata,
            createdAt: job.created_at,
            updatedAt: job.updated_at
          };
        } catch (error) {
          console.error("Error in getBackgroundJob:", error);
          throw error;
        }
      }, true); // Use readonly connection
    },
    
    /**
     * Get all visible background jobs (not in terminal states)
     */
    getAllVisibleBackgroundJobs: async (): Promise<BackgroundJob[]> => {
      console.log(`[Repo] Getting all visible background jobs`);
      
      return connectionPool.withConnection((db) => {
        try {
          // Get active jobs (not in terminal states)
          const rows = db.prepare(`
            SELECT * FROM background_jobs 
            WHERE status NOT IN ('completed', 'failed', 'cancelled')
          `).all();
          
          if (!rows || rows.length === 0) {
            return [];
          }
          
          // Map rows to BackgroundJob objects
          return rows.map((job: any) => {
            // Parse metadata if it exists
            let metadata = {};
            try {
              if (job.metadata) {
                metadata = JSON.parse(job.metadata);
              }
            } catch (err) {
              console.warn(`Error parsing metadata for job ${job.id}:`, err);
            }
            
            return {
              id: job.id,
              sessionId: job.session_id,
              status: job.status as JobStatus,
              apiType: job.api_type as ApiType,
              taskType: job.task_type as TaskType,
              model: job.model,
              prompt: job.prompt,
              response: job.response,
              errorMessage: job.error_message,
              metadata,
              createdAt: job.created_at,
              updatedAt: job.updated_at
            };
          });
        } catch (error) {
          console.error("Error in getAllVisibleBackgroundJobs:", error);
          throw error;
        }
      }, true); // Use readonly connection
    },
    
    /**
     * Update specific fields of a session
     */
    updateSessionFields: async (sessionId: string, fields: Partial<Session>): Promise<boolean> => {
      console.log(`[Repo] Updating fields for session: ${sessionId}`, JSON.stringify(fields, null, 2));
      
      return connectionPool.withTransaction((db) => {
        try {
          // First get the column names from the sessions table
          const tableInfo = db.prepare("PRAGMA table_info(sessions)").all();
          const columnNames = tableInfo.map((col: any) => col.name);
          console.log(`[Repo] Available columns in sessions table:`, columnNames);
          
          // Build dynamic SET clause only for fields that exist in the database
          const validFieldEntries = Object.entries(fields).filter(([key, _]) => {
            // Skip id field
            if (key === 'id') return false;
            
            // Convert camelCase to snake_case
            const snakeCase = key.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
            
            // Check if this column exists in the database
            const isValid = columnNames.includes(snakeCase);
            if (!isValid) {
              console.log(`[Repo] Skipping field ${key} -> ${snakeCase} as it doesn't exist in the database`);
            }
            return isValid;
          });
          
          if (validFieldEntries.length === 0) {
            console.log(`[Repo] No valid fields to update for session ${sessionId}`);
            return true; // No valid fields to update
          }
          
          // Convert session field names to database column names
          const setClause = validFieldEntries.map(([key, _]) => {
            const snakeCase = key.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
            return `${snakeCase} = @${key}`;
          }).join(', ');
          
          // Add updated_at automatically
          const query = `UPDATE sessions SET ${setClause}, updated_at = @updatedAt WHERE id = @id`;
          console.log(`[Repo] Update query: ${query}`);
          
          // Prepare parameters with proper naming and ensure all values are safe for SQLite
          const params: Record<string, string | number | bigint | Buffer | null> = {
            id: sessionId,
            updatedAt: Date.now()
          };
          
          // Process and convert fields to valid SQLite types
          for (const [key, value] of validFieldEntries) {
            if (value === null || value === undefined) {
              params[key] = null;
            } else if (typeof value === 'boolean') {
              params[key] = value ? 1 : 0;
            } else if (typeof value === 'object') {
              // Convert objects/arrays to JSON strings
              params[key] = JSON.stringify(value);
            } else {
              // String, number types are passed directly
              params[key] = value;
            }
            console.log(`[Repo] Parameter ${key} = ${params[key]} (${typeof params[key]})`);
          }
          
          try {
            // Execute the update
            const result = db.prepare(query).run(params);
            console.log(`[Repo] Update result: ${result.changes} rows affected`);
            return result.changes > 0;
          } catch (sqlError) {
            console.error(`[Repo] SQL Error in updateSessionFields:`, sqlError);
            console.log(`[Repo] Params:`, params);
            throw sqlError;
          }
        } catch (error) {
          console.error("Error in updateSessionFields:", error);
          throw error;
        }
      });
    }
  };
  
  return repository;
}

// Create and export a singleton instance of the repository
export const sessionRepository = createSessionRepository(); 