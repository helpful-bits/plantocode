import connectionPool from "../../core/lib/db/connection-pool";
import fs from "fs"; // Keep fs import
import path from "path"; // Keep path import
import Database from "better-sqlite3"; // Add Database import

async function runCachedStateMigration() {
  // Keep function signature
  console.log(
    "Running migration to remove output_format from cached_state table..."
  );

  const migrationFile = path.join(
    process.cwd(),
    "migrations",
    "0005_remove_output_format_from_cached_state.sql"
  );

  if (!fs.existsSync(migrationFile)) {
    console.error("Migration file not found:", migrationFile);
    process.exit(1);
  }

  const sql = fs.readFileSync(migrationFile, "utf8");

  try {
    // First check if the migration has already been applied
    const migrationExists = await connectionPool.withConnection(
      (db: Database.Database) => {
        const row = db
          .prepare(
            "SELECT name FROM migrations WHERE name = '0005_remove_output_format_from_cached_state.sql'"
          )
          .get();
        return !!row;
      },
      true
    );

    if (migrationExists) {
      console.log("Migration has already been applied. Skipping.");
      return;
    }

    // Run the migration as a transaction
    await connectionPool.withTransaction((db: Database.Database) => {
      // Execute the SQL
      db.exec(sql);

      // Record the migration
      db.prepare("INSERT INTO migrations (name) VALUES (?)").run(
        "0005_remove_output_format_from_cached_state.sql"
      );

      console.log("Migration completed successfully!");
    });
  } catch (error) {
    console.error(
      "Error during migration:",
      error instanceof Error ? error.message : String(error)
    );
    throw error;
  }
}

// Run the migration
runCachedStateMigration()
  .then(() => {
    console.log("Done!");
    process.exit(0);
  })
  .catch((error) => {
    console.error(
      "Migration failed:",
      error instanceof Error ? error.message : String(error)
    );
    process.exit(1);
  });
