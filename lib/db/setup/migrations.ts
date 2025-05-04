import connectionPool from "../connection-pool";

/**
 * Run all database migrations to ensure the schema is up to date
 */
export async function runMigrations(): Promise<void> {
  try {
    await connectionPool.withConnection(async (db) => {
      console.log("[DB Migrations] Running database migrations...");
      
      // Create version table if it doesn't exist
      db.prepare(`
        CREATE TABLE IF NOT EXISTS schema_version (
          version INTEGER PRIMARY KEY,
          applied_at INTEGER NOT NULL
        )
      `).run();
      
      // Get current schema version
      const versionRow = db.prepare("SELECT MAX(version) as version FROM schema_version").get() as { version: number | null };
      const currentVersion = versionRow?.version || 0;
      
      console.log(`[DB Migrations] Current database schema version: ${currentVersion}`);
      
      // Apply migrations in order
      const migrations = getMigrations();
      let appliedCount = 0;
      
      for (const [version, migration] of migrations.entries()) {
        // Skip if already applied
        if (version <= currentVersion) continue;
        
        console.log(`[DB Migrations] Applying migration ${version}...`);
        
        try {
          // Execute migration in a transaction
          db.transaction(() => {
            migration(db);
            
            // Update schema version
            db.prepare("INSERT INTO schema_version (version, applied_at) VALUES (?, ?)").run(
              version, Math.floor(Date.now() / 1000)
            );
          })();
          
          appliedCount++;
        } catch (error) {
          console.error(`[DB Migrations] Error applying migration ${version}:`, error);
          throw error;
        }
      }
      
      console.log(`[DB Migrations] Applied ${appliedCount} migrations. Schema is now at version ${currentVersion + appliedCount}`);
    }, false);
  } catch (error) {
    console.error("[DB Migrations] Migration error:", error);
    throw error;
  }
}

/**
 * Get all migrations in order
 */
function getMigrations(): Array<(db: any) => void> {
  return [
    // Migration 1: Initial tables
    (db) => {
      // Create core tables
      createCoreTables(db);
    },
    
    // Migration 2: Add additional fields
    (db) => {
      // Check if visible column exists in background_jobs table
      const visibleExists = db.prepare(`
        SELECT name FROM pragma_table_info('background_jobs') WHERE name='visible'
      `).get();
      
      if (!visibleExists) {
        console.log("[DB Migrations] Adding visible column to background_jobs table");
        db.prepare("ALTER TABLE background_jobs ADD COLUMN visible BOOLEAN DEFAULT 1").run();
      }
    }
    
    // Add more migrations here as needed
  ];
}

/**
 * Create the core database tables
 */
export function createCoreTables(db: any): void {
  // Create sessions table
  db.prepare(`
    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      project_directory TEXT NOT NULL,
      project_hash TEXT,
      task_description TEXT,
      search_term TEXT,
      pasted_paths TEXT,
      title_regex TEXT,
      content_regex TEXT,
      negative_title_regex TEXT,
      negative_content_regex TEXT,
      is_regex_active INTEGER DEFAULT 0,
      diff_temperature REAL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      codebase_structure TEXT
    )
  `).run();
  
  // Create session_files table
  db.prepare(`
    CREATE TABLE IF NOT EXISTS session_files (
      session_id TEXT NOT NULL,
      file_path TEXT NOT NULL,
      included INTEGER NOT NULL,
      PRIMARY KEY (session_id, file_path),
      FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
    )
  `).run();
  
  // Create active_sessions table
  db.prepare(`
    CREATE TABLE IF NOT EXISTS active_sessions (
      project_hash TEXT PRIMARY KEY,
      session_id TEXT,
      updated_at INTEGER NOT NULL,
      FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE SET NULL
    )
  `).run();
  
  // Create background_jobs table
  db.prepare(`
    CREATE TABLE IF NOT EXISTS background_jobs (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      status TEXT NOT NULL,
      status_message TEXT,
      raw_input TEXT,
      model_output TEXT,
      diff_patch TEXT,
      prompt_tokens INTEGER,
      completion_tokens INTEGER,
      total_tokens INTEGER,
      api_type TEXT NOT NULL,
      task_type TEXT NOT NULL,
      model_used TEXT,
      max_output_tokens INTEGER,
      include_syntax INTEGER,
      temperature REAL,
      error_message TEXT,
      response TEXT,
      metadata TEXT,
      start_time INTEGER,
      end_time INTEGER,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      cleared INTEGER DEFAULT 0,
      FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
    )
  `).run();
  
  // Create cached_state table
  db.prepare(`
    CREATE TABLE IF NOT EXISTS cached_state (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_hash TEXT,
      key TEXT NOT NULL,
      value TEXT NOT NULL,
      updated_at INTEGER NOT NULL,
      UNIQUE(project_hash, key)
    )
  `).run();
  
  // Create project_settings table
  db.prepare(`
    CREATE TABLE IF NOT EXISTS project_settings (
      project_hash TEXT PRIMARY KEY,
      project_directory TEXT NOT NULL,
      settings TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    )
  `).run();
  
  // Create indexes for better performance
  db.prepare("CREATE INDEX IF NOT EXISTS idx_sessions_project_hash ON sessions(project_hash)").run();
  db.prepare("CREATE INDEX IF NOT EXISTS idx_background_jobs_session_id ON background_jobs(session_id)").run();
  db.prepare("CREATE INDEX IF NOT EXISTS idx_background_jobs_task_type ON background_jobs(task_type)").run();
  db.prepare("CREATE INDEX IF NOT EXISTS idx_background_jobs_status ON background_jobs(status)").run();
} 