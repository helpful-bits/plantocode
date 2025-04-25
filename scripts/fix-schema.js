// Script to fix database schema issues by ensuring all required tables and columns exist
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const os = require('os');
const fs = require('fs');
const crypto = require('crypto');

// Updated location with new names
const APP_DATA_DIR = path.join(os.homedir(), '.ai-architect-studio');
const DB_FILE = path.join(APP_DATA_DIR, 'ai-architect-studio.db');
// Legacy location for migration
const OLD_APP_DATA_DIR = path.join(os.homedir(), '.o1-pro-flow');
const OLD_DB_FILE = path.join(OLD_APP_DATA_DIR, 'o1-pro-flow.db');

console.log(`Attempting to fix schema for database at: ${DB_FILE}`);

// Ensure directory exists
if (!fs.existsSync(APP_DATA_DIR)) {
  fs.mkdirSync(APP_DATA_DIR, { recursive: true });
}

// Check if migration is needed
if (!fs.existsSync(DB_FILE) && fs.existsSync(OLD_DB_FILE)) {
  console.log(`New database not found but old database exists at: ${OLD_DB_FILE}`);
  console.log('Migrating old database to new location before fixing schema...');
  
  try {
    // Copy old database to new location
    fs.copyFileSync(OLD_DB_FILE, DB_FILE);
    console.log('Database migrated successfully.');
    
    // Create a backup of the old database
    const backupFile = `${OLD_DB_FILE}.backup-${new Date().toISOString().replace(/[:.]/g, '-')}`;
    fs.copyFileSync(OLD_DB_FILE, backupFile);
    console.log(`Backup of old database created at: ${backupFile}`);
  } catch (error) {
    console.error('Error during migration:', error);
    process.exit(1);
  }
}

// Open database connection
const db = new sqlite3.Database(DB_FILE, (err) => {
  if (err) {
    console.error('Error opening database:', err.message);
    process.exit(1);
  }
  console.log('Connected to database.');
});

// Turn on foreign keys
db.run('PRAGMA foreign_keys=off;', async (err) => {
  if (err) {
    console.error('Error setting PRAGMA:', err.message);
  }

  // Start the schema fixing process
  try {
    // Drop all tables and start fresh
    const tables = await getTables();
    if (tables.length > 0) {
      console.log(`Found ${tables.length} tables to drop: ${tables.join(', ')}`);
      for (const table of tables) {
        await executeQuery(`DROP TABLE IF EXISTS ${table}`);
        console.log(`- Dropped table ${table}`);
      }
    }

    // Ensure migrations table exists
    await executeQuery(`
      CREATE TABLE IF NOT EXISTS migrations (
        id INTEGER PRIMARY KEY, 
        name TEXT UNIQUE, 
        applied_at INTEGER
      )
    `);
    console.log('- Ensured migrations table exists');

    // Ensure sessions table exists with correct schema
    await executeQuery(`
      CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        project_directory TEXT NOT NULL,
        project_hash TEXT,
        task_description TEXT DEFAULT '',
        search_term TEXT DEFAULT '',
        pasted_paths TEXT DEFAULT '',
        title_regex TEXT DEFAULT '',
        content_regex TEXT DEFAULT '',
        is_regex_active INTEGER DEFAULT 1 CHECK(is_regex_active IN (0, 1)),
        codebase_structure TEXT DEFAULT '',
        updated_at INTEGER,
        gemini_status TEXT DEFAULT 'idle',
        gemini_start_time INTEGER,
        gemini_end_time INTEGER,
        gemini_patch_path TEXT,
        gemini_xml_path TEXT,
        gemini_status_message TEXT,
        gemini_tokens_received INTEGER DEFAULT 0,
        gemini_chars_received INTEGER DEFAULT 0,
        gemini_last_update INTEGER
      )
    `);
    console.log('- Ensured sessions table exists');

    // Ensure active_sessions table exists
    await executeQuery(`
      CREATE TABLE IF NOT EXISTS active_sessions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        project_directory TEXT UNIQUE,
        project_hash TEXT,
        session_id TEXT,
        updated_at INTEGER,
        FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE SET NULL
      )
    `);
    console.log('- Ensured active_sessions table exists');

    // Create cached_state table with correct schema
    await executeQuery(`
      CREATE TABLE IF NOT EXISTS cached_state (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        project_directory TEXT,
        project_hash TEXT NOT NULL,
        key TEXT NOT NULL,
        value TEXT,
        updated_at INTEGER,
        UNIQUE(project_hash, key)
      )
    `);
    console.log('- Ensured cached_state table exists with correct schema');

    // Ensure project_settings table exists with project_hash as a column
    await executeQuery(`
      CREATE TABLE IF NOT EXISTS project_settings (
        project_hash TEXT PRIMARY KEY,
        active_session_id TEXT,
        updated_at INTEGER,
        FOREIGN KEY (active_session_id) REFERENCES sessions(id) ON DELETE SET NULL
      )
    `);
    console.log('- Ensured project_settings table exists with project_hash as primary key');

    // Ensure gemini_requests table exists
    await executeQuery(`
      CREATE TABLE IF NOT EXISTS gemini_requests (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        prompt TEXT NOT NULL,
        status TEXT DEFAULT 'idle' NOT NULL CHECK(status IN ('idle', 'running', 'completed', 'failed', 'canceled', 'preparing')),
        start_time INTEGER,
        end_time INTEGER,
        patch_path TEXT,
        xml_path TEXT,
        status_message TEXT,
        tokens_received INTEGER DEFAULT 0,
        chars_received INTEGER DEFAULT 0,
        last_update INTEGER,
        created_at INTEGER DEFAULT (strftime('%s', 'now')) NOT NULL,
        FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
      )
    `);
    console.log('- Ensured gemini_requests table exists');

    // Ensure included_files and excluded_files tables exist
    await executeQuery(`
      CREATE TABLE IF NOT EXISTS included_files (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id TEXT NOT NULL,
        path TEXT NOT NULL,
        FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE,
        UNIQUE(session_id, path)
      )
    `);
    console.log('- Ensured included_files table exists');

    await executeQuery(`
      CREATE TABLE IF NOT EXISTS excluded_files (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id TEXT NOT NULL,
        path TEXT NOT NULL,
        FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE,
        UNIQUE(session_id, path)
      )
    `);
    console.log('- Ensured excluded_files table exists');

    // Create indexes
    await executeQuery('CREATE INDEX IF NOT EXISTS idx_sessions_project_hash ON sessions(project_hash)');
    await executeQuery('CREATE INDEX IF NOT EXISTS idx_active_sessions_project_hash ON active_sessions(project_hash)');
    await executeQuery('CREATE INDEX IF NOT EXISTS idx_active_sessions_project_directory ON active_sessions(project_directory)');
    await executeQuery('CREATE INDEX IF NOT EXISTS idx_gemini_requests_session_id ON gemini_requests(session_id)');
    await executeQuery('CREATE INDEX IF NOT EXISTS idx_gemini_requests_status ON gemini_requests(status)');
    await executeQuery('CREATE INDEX IF NOT EXISTS idx_cached_state_lookup ON cached_state(project_hash, key)');
    console.log('- Created necessary indexes');

    // Find all migration files
    const migrationsDir = path.join(process.cwd(), 'migrations');
    let migrationFiles = [];
    if (fs.existsSync(migrationsDir)) {
      migrationFiles = fs.readdirSync(migrationsDir)
        .filter(file => file.endsWith('.sql') && !file.endsWith('.disabled'))
        .sort();
      console.log(`Found ${migrationFiles.length} migration files`);
    }

    // Mark all migrations as applied
    const now = Math.floor(Date.now() / 1000);
    for (const file of migrationFiles) {
      await executeQuery(`
        INSERT OR IGNORE INTO migrations (name, applied_at) 
        VALUES ('${file}', ${now})
      `);
      console.log(`- Marked migration ${file} as applied`);
    }

    // Insert a default entry in project_settings for the current project
    const currentProjectDir = process.cwd();
    const currentProjectHash = hashString(currentProjectDir);
    
    await executeQuery(`
      INSERT OR IGNORE INTO project_settings 
      (project_hash, updated_at) 
      VALUES ('${currentProjectHash}', ${now})
    `);
    console.log(`- Added default project settings for current directory: ${currentProjectDir} (hash: ${currentProjectHash})`);

    // Add entry in active_sessions 
    await executeQuery(`
      INSERT OR IGNORE INTO active_sessions
      (project_directory, project_hash, updated_at)
      VALUES ('${currentProjectDir}', '${currentProjectHash}', ${now})
    `);
    console.log(`- Added default active_sessions entry for current directory`);

    // Close database
    db.close(() => {
      console.log('Database schema fixed. Database connection closed.');
      console.log('You can now restart your application.');
    });
  } catch (error) {
    console.error('Error fixing schema:', error);
    db.close();
    process.exit(1);
  }
});

// Helper function to execute a query
function executeQuery(sql) {
  return new Promise((resolve, reject) => {
    db.exec(sql, (err) => {
      if (err) {
        console.error(`Error executing SQL: ${sql.substring(0, 100)}...`, err.message);
        reject(err);
      } else {
        resolve();
      }
    });
  });
}

// Helper function to get table columns
function getTableColumns(tableName) {
  return new Promise((resolve, reject) => {
    db.all(`PRAGMA table_info(${tableName})`, (err, rows) => {
      if (err) {
        console.error(`Error getting columns for ${tableName}:`, err.message);
        reject(err);
      } else {
        resolve(rows.map(row => row.name));
      }
    });
  });
}

// Helper function to get all tables
function getTables() {
  return new Promise((resolve, reject) => {
    db.all(
      "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'",
      (err, rows) => {
        if (err) {
          console.error('Error getting tables:', err.message);
          reject(err);
        } else {
          resolve(rows.map(row => row.name));
        }
      }
    );
  });
}

// Implementation of hashString to match the one used in the application
function hashString(str) {
  // Treat null, undefined, empty string, or 'global' as 'global' consistently
  if (str === 'global' || !str) return 'global';
  
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  // Convert to hex string and pad to ensure consistent length
  return (hash >>> 0).toString(16).padStart(8, '0'); // Pad to ensure consistent length
} 