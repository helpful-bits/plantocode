// Add regex description columns to sessions table if they don't exist
import connectionPool from "../../core/lib/db/connection-pool";

async function addRegexDescriptionColumns() {
  try {
    console.log("Adding regex description columns to sessions table...");

    await connectionPool.withConnection(async (database) => {
      // Define the columns to add
      const columnsToAdd = [
        { name: 'title_regex_description', type: 'TEXT DEFAULT ""' },
        { name: 'content_regex_description', type: 'TEXT DEFAULT ""' },
        { name: 'negative_title_regex_description', type: 'TEXT DEFAULT ""' },
        { name: 'negative_content_regex_description', type: 'TEXT DEFAULT ""' },
        { name: 'regex_summary_explanation', type: 'TEXT DEFAULT ""' }
      ];

      let addedColumns = 0;

      for (const column of columnsToAdd) {
        // Check if column exists
        const columnExists = database
          .prepare(
            `
            SELECT name FROM pragma_table_info('sessions') WHERE name=?
          `
          )
          .get(column.name);

        if (columnExists) {
          console.log(`${column.name} column already exists in sessions table`);
          continue;
        }

        console.log(`Adding ${column.name} column to sessions table...`);

        // Add the column
        database.prepare(
          `
          ALTER TABLE sessions ADD COLUMN ${column.name} ${column.type}
        `
        ).run();

        addedColumns++;
        console.log(`Successfully added ${column.name} column to sessions table`);
      }

      if (addedColumns > 0) {
        console.log(`Added ${addedColumns} new regex description columns`);

        // Add migration record
        const migrationExists = database
          .prepare(
            `
            SELECT name FROM migrations WHERE name='add_regex_description_columns'
          `
          )
          .get();

        if (!migrationExists) {
          database.prepare(
            `
            INSERT INTO migrations (name, applied_at) 
            VALUES ('add_regex_description_columns', strftime('%s', 'now'))
          `
          ).run();

          console.log("Added migration record");
        }
      } else {
        console.log("All regex description columns already exist");
      }
    }, false); // false for writable connection

    console.log("Migration completed successfully");
  } catch (error) {
    console.error("Error adding regex description columns:", error);
    throw error;
  } finally {
    await connectionPool.closeAll();
  }
}

// Run the migration
addRegexDescriptionColumns()
  .then(() => {
    console.log("Done!");
    process.exit(0);
  })
  .catch((error) => {
    console.error("Migration failed:", error);
    process.exit(1);
  });