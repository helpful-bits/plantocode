# Database Architecture

## Overview

The database layer uses SQLite for persistent storage with a simplified architecture:

- **Singleton Connection**: A single server-side connection is maintained in `index.ts`
- **Manual Migration**: Migrations are run manually via `pnpm migrate` (not automatic)
- **Repository Pattern**: Data access through repository classes in `repository-factory.ts`
- **Connection Pool**: Optional connection pooling for high-concurrency operations

## Key Files

- `index.ts` - Core database connection singleton and basic functions
- `setup.ts` - Database initialization and migration handling
- `repository-factory.ts` - Repository classes for entity operations
- `connection-pool.ts` - Optional connection pooling for advanced use cases

## Database Connection

Server-side database connection is managed through the core functions in `index.ts`:

```typescript
import { db, ensureConnection, closeDatabase } from '@/lib/db';

// Get a reference to the database
const database = ensureConnection();

// Execute queries directly if needed
database.run('INSERT INTO table VALUES (?)', [value]);

// Close database when done (rarely needed except in scripts)
closeDatabase();
```

## Best Practices

1. **Use Server Actions**: Access the database through server actions, not directly from components
2. **Run Migrations Manually**: Always run `pnpm migrate` after updates
3. **Use Repository Pattern**: Use repository methods rather than direct SQL when possible
4. **Handle Errors**: Always handle database errors with proper error boundaries

## Troubleshooting

If you encounter database issues:

1. Run `pnpm check-db` to diagnose problems
2. Run `pnpm check-db:repair` to attempt automatic repair
3. Run `pnpm reset-db` as a last resort (deletes all data but makes backup)

## Schema Overview

The database contains these primary tables:

- `sessions` - Stores user sessions by project (task description, regex settings, model settings)
- `included_files` - Tracks files selected for inclusion in a session
- `excluded_files` - Tracks files explicitly excluded from a session
- `background_jobs` - Tracks API requests and their states with metadata and output files
- `cached_state` - Stores UI state and preferences by project
- `key_value_store` - General purpose storage for application state
- `migrations` - Tracks applied database migrations

### background_jobs Table

The `background_jobs` table has these primary columns:
- `id` - Unique job identifier
- `session_id` - Foreign key to sessions
- `prompt` - The input prompt sent to the API
- `status` - Current job status ('idle', 'running', 'completed', 'failed', 'canceled', etc)
- `response` - The text response from the API (for small outputs)
- `output_file_path` - Path to file storing larger outputs (like implementation plans)
- `metadata` - JSON-encoded metadata that varies by task type
- `task_type` - The type of task ('implementation_plan', 'pathfinder', etc)
- `api_type` - The API provider ('gemini', 'claude', etc)
- `model_used` - The specific model used for the request

# Database Migrations

This folder contains the database migration logic for the application.

## Migration Standards

When adding new migrations:
1. SQLite has limited ALTER TABLE support - use table recreation for complex changes
2. Always check if tables/columns exist before modifying them
3. Use transactions to ensure migration integrity
4. Add descriptive comments for future maintainers

The database schema is consolidated in `migrations/consolidated_migrations.sql`, which
provides the complete current schema in a single file.

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