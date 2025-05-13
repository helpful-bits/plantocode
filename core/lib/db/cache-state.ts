import connectionPool from './connection-pool';
import crypto from 'crypto';
import Database from 'better-sqlite3';

/**
 * Get cached state value from the database
 */
export async function getCachedState(projectDirectory: string | null, key: string): Promise<string | null> {
  try {
    if (!key) {
      console.error("[DB] Cannot get cached state with empty key");
      return null;
    }

    // Hash project directory if provided, otherwise use the global hash
    let projectHash: string;
    if (projectDirectory) {
      projectDirectory = projectDirectory.trim();
      projectHash = crypto.createHash('md5').update(projectDirectory).digest('hex');
    } else {
      // Use a fixed hash for global settings to match saveCachedState behavior
      projectHash = crypto.createHash('md5').update('global').digest('hex');
    }

    return await connectionPool.withConnection((db: Database.Database) => {
      // Check if table exists before querying
      const tableExists = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='cached_state'").get();
      if (!tableExists) {
        return null;
      }

      const query = 'SELECT value FROM cached_state WHERE project_hash = ? AND key = ? LIMIT 1';
      const params = [projectHash, key];

      const row = db.prepare(query).get(...params) as { value: string | null } | undefined;
      return row && row.value ? row.value : null;
    }, true); // Use readonly connection
  } catch (error) {
    console.error(`[DB] Error in getCachedState for key "${key}" (project: ${projectDirectory || 'global'}):`, error);
    return null;
  }
}

/**
 * Save cached state value to the database
 */
export async function saveCachedState(projectDirectory: string | null, key: string, value: string): Promise<void> {
  try {
    if (!key) {
      console.error("[DB] Cannot save cached state with empty key");
      return;
    }

    // Hash project directory if provided, otherwise use a default "global" hash
    let projectHash: string;
    if (projectDirectory) {
      projectDirectory = projectDirectory.trim();
      projectHash = crypto.createHash('md5').update(projectDirectory).digest('hex');
    } else {
      // Use a fixed hash for global settings to avoid NULL constraint issues
      projectHash = crypto.createHash('md5').update('global').digest('hex');
    }

    await connectionPool.withConnection((db: Database.Database) => {
      const now = Math.floor(Date.now() / 1000); // Current time in seconds

      // Ensure table exists
      const tableExists = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='cached_state'").get();

      if (!tableExists) {
        db.prepare(`
          CREATE TABLE cached_state (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            project_hash TEXT NOT NULL,
            key TEXT NOT NULL,
            value TEXT NOT NULL,
            updated_at INTEGER NOT NULL,
            UNIQUE(project_hash, key)
          )
        `).run();
      }

      // Use REPLACE to handle both insert and update cases
      const query = `
        REPLACE INTO cached_state (project_hash, key, value, updated_at)
        VALUES (?, ?, ?, ?)
      `;

      db.prepare(query).run(projectHash, key, value, now);
    }, false); // Use writable connection
  } catch (error) {
    console.error(`[DB] Error in saveCachedState for key "${key}" (project: ${projectDirectory || 'global'}):`, error);
    throw error;
  }
} 