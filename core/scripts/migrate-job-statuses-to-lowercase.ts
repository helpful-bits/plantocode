import connectionPool from '../lib/db/connection-pool';
import Database from 'better-sqlite3';

/**
 * This script migrates any uppercase job status values to lowercase
 * It converts:
 * - PREPARING_INPUT -> preparing_input
 * - GENERATING_STREAM -> generating_stream
 * - PROCESSING_STREAM -> processing_stream
 * - COMPLETED_BY_TAG -> completed_by_tag
 */
async function migrateJobStatusesToLowercase() {
  console.log('Starting job statuses migration to lowercase...');

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

      // Define our status mappings
      const statusMappings = [
        { oldStatus: 'PREPARING_INPUT', newStatus: 'preparing_input' },
        { oldStatus: 'GENERATING_STREAM', newStatus: 'generating_stream' },
        { oldStatus: 'PROCESSING_STREAM', newStatus: 'processing_stream' },
        { oldStatus: 'COMPLETED_BY_TAG', newStatus: 'completed_by_tag' }
      ];

      // Count how many records need updating
      const countStmt = db.prepare(`
        SELECT COUNT(*) as count FROM background_jobs 
        WHERE status IN ('PREPARING_INPUT', 'GENERATING_STREAM', 'PROCESSING_STREAM', 'COMPLETED_BY_TAG')
      `);
      
      const countResult = countStmt.get();
      const recordsToUpdate = (countResult as any)?.count || 0;
      
      console.log(`Found ${recordsToUpdate} jobs with uppercase statuses to update`);
      
      if (recordsToUpdate === 0) {
        console.log('No records need updating');
        return;
      }

      // Update each status type
      for (const mapping of statusMappings) {
        const updateStmt = db.prepare(`
          UPDATE background_jobs
          SET status = ?
          WHERE status = ?
        `);

        const result = updateStmt.run(mapping.newStatus, mapping.oldStatus);
        const updatedCount = result?.changes || 0;
        
        if (updatedCount > 0) {
          console.log(`Updated ${updatedCount} jobs from '${mapping.oldStatus}' to '${mapping.newStatus}'`);
        }
      }

      console.log('Status migration completed successfully!');
      
      // Record this migration in the migrations table
      const migrationStmt = db.prepare(`
        INSERT OR IGNORE INTO migrations (name, applied_at)
        VALUES ('migrate_job_statuses_to_lowercase', strftime('%s', 'now'))
      `);
      
      migrationStmt.run();
      
    } catch (error) {
      console.error('Error migrating job statuses to lowercase:', error);
      throw error;
    }
  });
}

// Run the migration
migrateJobStatusesToLowercase()
  .then(() => {
    console.log('Job status lowercase migration completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Job status lowercase migration failed:', error);
    process.exit(1);
  });