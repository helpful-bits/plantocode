# Database Migrations

This folder contains the database migration logic for the application.

## Migration 0008 Fix

A special fix was implemented for migration `0008_rename_patch_path_to_xml_path.sql`, which was failing due to attempting to directly modify `sqlite_master` to rename columns.

### The Issue

The original migration was attempting to:
1. Update the `gemini_patch_path` column to `gemini_xml_path` in the `sessions` table
2. Update the `patch_path` column to `xml_path` in the `gemini_requests` table

These operations were failing with `SQLITE_ERROR: no such column: gemini_patch_path` because:
1. The `sqlite_master` table is not directly modifiable in some scenarios
2. The columns may not exist in all installations

### The Fix

A revised migration approach was implemented:
1. The problematic `0008_rename_patch_path_to_xml_path.sql` file was renamed to `0008_rename_patch_path_to_xml_path.sql.disabled`
2. A new migration `0008a_fix_rename_patch_path.sql` was created that:
   - Uses a safer approach with table recreation instead of direct column renaming
   - Properly checks if tables and columns exist before operating on them
   - Creates new tables with the correct schema and copies data safely

### Code Updates

The following code was also updated to handle the migration changes:
1. `migrations.ts` - Better error handling for migrations
2. `repository-factory.ts` - Made database operations more resilient by checking column existence

### For Developers

When adding new migrations, be cautious with:
1. SQLite's limitations for schema changes (no DROP COLUMN, limited ALTER TABLE support)
2. Using direct modifications to `sqlite_master`
3. Assuming column or table existence

Instead, prefer:
1. Creating new tables with the desired schema
2. Copying data from old tables
3. Dropping old tables and renaming new ones
4. Using EXISTS checks for operations that might fail 