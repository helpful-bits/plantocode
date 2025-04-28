#!/usr/bin/env node

import { DB_FILE } from "../lib/db/connection-pool";
import Database from "better-sqlite3";

/**
 * Script to enforce path column as the only column for file paths
 * Execute with: npx tsx scripts/enforce-path-column.ts
 */
async function main() {
  console.log(`Opening database at ${DB_FILE}`);
  const db = new Database(DB_FILE);

  try {
    // Start a transaction
    db.prepare("BEGIN").run();

    // Drop file_path column from included_files
    console.log("Removing file_path column from included_files table...");
    db.prepare(`
      CREATE TABLE included_files_new (
        id INTEGER PRIMARY KEY,
        session_id TEXT,
        path TEXT,
        FOREIGN KEY (session_id) REFERENCES sessions(id)
      )
    `).run();
    
    db.prepare(`
      INSERT INTO included_files_new (id, session_id, path)
      SELECT id, session_id, path FROM included_files
    `).run();
    
    db.prepare("DROP TABLE included_files").run();
    db.prepare("ALTER TABLE included_files_new RENAME TO included_files").run();

    // Drop file_path column from excluded_files
    console.log("Removing file_path column from excluded_files table...");
    db.prepare(`
      CREATE TABLE excluded_files_new (
        id INTEGER PRIMARY KEY,
        session_id TEXT,
        path TEXT,
        FOREIGN KEY (session_id) REFERENCES sessions(id)
      )
    `).run();
    
    db.prepare(`
      INSERT INTO excluded_files_new (id, session_id, path)
      SELECT id, session_id, path FROM excluded_files
    `).run();
    
    db.prepare("DROP TABLE excluded_files").run();
    db.prepare("ALTER TABLE excluded_files_new RENAME TO excluded_files").run();

    // Commit the transaction
    db.prepare("COMMIT").run();
    console.log("Successfully removed file_path columns from tables");
  } catch (error) {
    // Rollback in case of error
    db.prepare("ROLLBACK").run();
    console.error("Error occurred, changes rolled back:", error);
    process.exit(1);
  } finally {
    db.close();
  }
}

main().catch(console.error); 