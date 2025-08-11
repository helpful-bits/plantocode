# Database Migrations

This directory contains database migrations for Vibe Manager Desktop.

## Structure

- `consolidated_schema.sql` - Complete schema for fresh installations
- `migration_rules.json` - Migration rules with version matching patterns
- `features/` - Feature-specific migrations (new tables, columns)
- `optimizations/` - Performance improvements (indexes, query optimizations)
- `security/` - Security patches and fixes
- `cleanup/` - Removal of deprecated tables/columns

## Migration System

The migration system supports flexible version matching patterns:

### Version Patterns

- `*` or `any` - Matches any version
- `1.0.0` - Exact version match
- `1.*` or `1.x` - Matches any 1.x version
- `>=1.0.0` - Version 1.0.0 or higher
- `<2.0.0` - Any version below 2.0.0
- `1.0.0..2.0.0` - Range from 1.0.0 (inclusive) to 2.0.0 (exclusive)
- `>=1.0.0, <2.0.0` - Semantic version requirement

### Migration Rules

Each migration rule contains:
- `id` - Unique identifier
- `from_version` - Version pattern for source version
- `to_version` - Version pattern for target version
- `migration_file` - Path to SQL file
- `description` - Human-readable description
- `required` - Whether failure should block startup
- `priority` - Execution order (lower = earlier)

### How It Works

1. On startup, the system checks the stored version vs current version
2. Finds all applicable migrations based on version patterns
3. Sorts by priority and removes duplicates
4. Executes migrations in order
5. Records successful migrations to prevent re-running
6. Updates stored version

### Adding New Migrations

1. Create SQL file in appropriate subdirectory
2. Add rule to `migration_rules.json`
3. Set appropriate version patterns
4. Choose priority based on importance
5. Mark as `required: true` only for critical migrations

### Examples

#### Add feature for all future versions:
```json
{
  "id": "new_feature",
  "from_version": "*",
  "to_version": ">=1.5.0",
  "migration_file": "migrations/features/new_feature.sql",
  "required": false,
  "priority": 50
}
```

#### Critical security fix for version range:
```json
{
  "id": "security_fix",
  "from_version": "1.0.0..1.5.0",
  "to_version": ">=1.5.0",
  "migration_file": "migrations/security/fix.sql",
  "required": true,
  "priority": 1
}
```

#### Major version upgrade:
```json
{
  "id": "v2_upgrade",
  "from_version": "1.*",
  "to_version": "2.*",
  "migration_file": "migrations/features/v2.sql",
  "required": true,
  "priority": 10
}
```

## Testing Migrations

1. Back up your database before testing
2. Change version in `Cargo.toml` to test version transitions
3. Check logs for migration execution
4. Verify changes in database

## Rollback

Currently, automatic rollback is not supported. To rollback:
1. Restore database from backup
2. Downgrade application version
3. Remove migration records from `key_value_store` table