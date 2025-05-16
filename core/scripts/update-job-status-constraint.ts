import connectionPool from '../lib/db/connection-pool';
import Database from 'better-sqlite3';

/**
 * This script updates the CHECK constraint on the background_jobs table's status column
 * to include the new job statuses: 'PREPARING_INPUT', 'GENERATING_STREAM', 'PROCESSING_STREAM', and 'COMPLETED_BY_TAG'
 */
async function updateJobStatusConstraint() {
  console.log('Starting background_jobs status constraint update...');

  return connectionPool.withTransaction((db: Database.Database) => {
    try {
      // First, check if the table exists
      const tableExists = db.prepare(`
        SELECT name FROM sqlite_master WHERE type='table' AND name='background_jobs'
      `).get();

      if (!tableExists) {
        console.log('background_jobs table does not exist, nothing to update');
        return;
      }

      // 1. Create a backup table with the correct constraint
      console.log('Creating temporary table with updated constraint...');
      db.prepare(`
        CREATE TABLE background_jobs_new (
          id TEXT PRIMARY KEY,
          session_id TEXT NOT NULL,
          prompt TEXT NOT NULL,
          status TEXT DEFAULT 'created' NOT NULL CHECK(status IN ('idle', 'running', 'completed', 'failed', 'canceled', 'preparing', 'created', 'queued', 'acknowledged_by_worker', 'preparing_input', 'generating_stream', 'processing_stream', 'completed_by_tag')),
          start_time INTEGER,
          end_time INTEGER,
          output_file_path TEXT,
          status_message TEXT,
          tokens_received INTEGER DEFAULT 0,
          tokens_sent INTEGER DEFAULT 0,
          chars_received INTEGER DEFAULT 0,
          last_update INTEGER,
          created_at INTEGER DEFAULT (strftime('%s', 'now')) NOT NULL,
          updated_at INTEGER DEFAULT (strftime('%s', 'now')),
          cleared INTEGER DEFAULT 0 CHECK(cleared IN (0, 1)),
          api_type TEXT DEFAULT 'gemini' NOT NULL,
          task_type TEXT DEFAULT 'xml_generation' NOT NULL,
          model_used TEXT,
          max_output_tokens INTEGER,
          response TEXT,
          error_message TEXT,
          metadata TEXT,
          project_directory TEXT,
          visible BOOLEAN DEFAULT 1,
          FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
        )
      `).run();

      // 2. Copy all data from the old table to the new one
      console.log('Copying data to the new table...');
      db.prepare(`
        INSERT INTO background_jobs_new
        SELECT * FROM background_jobs
      `).run();

      // 3. Drop the old table
      console.log('Dropping old table...');
      db.prepare('DROP TABLE background_jobs').run();

      // 4. Rename the new table to the original name
      console.log('Renaming new table to background_jobs...');
      db.prepare('ALTER TABLE background_jobs_new RENAME TO background_jobs').run();

      // 5. Recreate indexes
      console.log('Recreating indexes...');
      db.prepare("CREATE INDEX IF NOT EXISTS idx_background_jobs_session_id ON background_jobs(session_id)").run();
      db.prepare("CREATE INDEX IF NOT EXISTS idx_background_jobs_status ON background_jobs(status)").run();
      db.prepare("CREATE INDEX IF NOT EXISTS idx_background_jobs_cleared ON background_jobs(cleared)").run();
      db.prepare("CREATE INDEX IF NOT EXISTS idx_background_jobs_status_cleared ON background_jobs(status, cleared)").run();
      db.prepare("CREATE INDEX IF NOT EXISTS idx_background_jobs_api_type ON background_jobs(api_type)").run();
      db.prepare("CREATE INDEX IF NOT EXISTS idx_background_jobs_task_type ON background_jobs(task_type)").run();

      console.log('Status constraint update completed successfully!');
    } catch (error) {
      console.error('Error updating job status constraint:', error);
      throw error;
    }
  });
}

// Run the migration
updateJobStatusConstraint()
  .then(() => {
    console.log('Job status constraint migration completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Job status constraint migration failed:', error);
    process.exit(1);
  });