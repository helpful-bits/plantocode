#!/bin/bash

# SQLite Database Migration Script for Tauri Desktop App
# Adapted from server PostgreSQL migration script for SQLite usage
#
# Usage:
#   ./scripts/migrate.sh <sql_file>
#   ./scripts/migrate.sh migrations/002_add_regex_description_columns.sql
#
# Prerequisites:
#   - sqlite3 command available
#   - Database file path accessible
#   - Tauri app must be stopped during migration

set -e  # Exit on any error

# Color codes for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Help function
show_help() {
    cat << EOF
SQLite Database Migration Script for Tauri Desktop App

DESCRIPTION:
    Simple bash script to execute SQL migration files using sqlite3.
    Designed for the Tauri desktop application's SQLite database.

USAGE:
    $0 <sql_file> [options]

OPTIONS:
    -h, --help      Show this help message
    -v, --verbose   Enable verbose output
    --dry-run       Show what would be executed without running
    --db-path       Specify custom database path

EXAMPLES:
    # Run the regex description columns migration
    $0 migrations/002_add_regex_description_columns.sql

    # Dry run to see what would be executed
    $0 migrations/002_add_regex_description_columns.sql --dry-run

    # Verbose output
    $0 migrations/002_add_regex_description_columns.sql --verbose

    # Custom database path
    $0 migrations/002_add_regex_description_columns.sql --db-path ~/custom/path/app.db

PREREQUISITES:
    - sqlite3 command must be available
    - Tauri desktop application must be stopped
    - Database file must be accessible

DEFAULT DATABASE LOCATIONS:
    macOS: ~/Library/Application Support/com.vibe-manager.app/appdata.db
    Linux: ~/.local/share/com.vibe-manager.app/appdata.db
    Windows: %APPDATA%/com.vibe-manager.app/appdata.db

NOTE: The database filename is 'appdata.db' and the app identifier is 'com.vibe-manager.app'.
EOF
}

# Parse command line arguments
SQL_FILE=""
DRY_RUN=false
VERBOSE=false
CUSTOM_DB_PATH=""

while [[ $# -gt 0 ]]; do
    case $1 in
        -h|--help)
            show_help
            exit 0
            ;;
        -v|--verbose)
            VERBOSE=true
            shift
            ;;
        --dry-run)
            DRY_RUN=true
            shift
            ;;
        --db-path)
            CUSTOM_DB_PATH="$2"
            shift 2
            ;;
        *)
            if [[ -z "$SQL_FILE" ]]; then
                SQL_FILE="$1"
            else
                log_error "Unknown argument: $1"
                show_help
                exit 1
            fi
            shift
            ;;
    esac
done

# Check if SQL file is provided
if [[ -z "$SQL_FILE" ]]; then
    log_error "SQL file is required"
    echo
    show_help
    exit 1
fi

# Determine database path
if [[ -n "$CUSTOM_DB_PATH" ]]; then
    DB_PATH="$CUSTOM_DB_PATH"
else
    # Detect OS and set default database path
    case "$(uname -s)" in
        Darwin)  # macOS
            DB_PATH="$HOME/Library/Application Support/com.vibe-manager.app/appdata.db"
            ;;
        Linux)
            DB_PATH="$HOME/.local/share/com.vibe-manager.app/appdata.db"
            ;;
        CYGWIN*|MINGW*|MSYS*)  # Windows
            DB_PATH="$APPDATA/com.vibe-manager.app/appdata.db"
            ;;
        *)
            log_error "Unsupported operating system"
            log_error "Please specify database path manually with --db-path"
            exit 1
            ;;
    esac
fi

# Check if sqlite3 is available
if ! command -v sqlite3 &> /dev/null; then
    log_error "sqlite3 command not found"
    log_error "Please install SQLite3"
    exit 1
fi

# Check if SQL file exists
if [[ ! -f "$SQL_FILE" ]]; then
    log_error "SQL file not found: $SQL_FILE"
    exit 1
fi

# Check if database file exists
if [[ ! -f "$DB_PATH" ]]; then
    log_error "Database file not found: $DB_PATH"
    log_error "Please ensure the Tauri app has been run at least once to create the database"
    exit 1
fi

# Extract filename for logging
FILENAME=$(basename "$SQL_FILE")

log_info "🚀 Starting SQLite database migration"
log_info "📁 SQL file: $SQL_FILE"
log_info "🗃️  Database: $DB_PATH"

if [[ "$VERBOSE" == true ]]; then
    log_info "Database path: $DB_PATH"
fi

# Test database connection
log_info "🔍 Testing database connection"
if ! sqlite3 "$DB_PATH" "SELECT 1;" &> /dev/null; then
    log_error "❌ Failed to connect to database"
    log_error "Please check the database path and ensure it's not locked by the application"
    exit 1
fi
log_success "✅ Database connection successful"

# Create migrations tracking table if it doesn't exist
log_info "📋 Ensuring migrations tracking table exists"
TRACKING_SQL="
CREATE TABLE IF NOT EXISTS schema_migrations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    filename TEXT UNIQUE NOT NULL,
    checksum TEXT NOT NULL,
    executed_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
    execution_time_ms INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_schema_migrations_filename 
ON schema_migrations(filename);
"

if [[ "$DRY_RUN" == true ]]; then
    log_info "🔍 DRY RUN - Would create migrations tracking table"
else
    if ! echo "$TRACKING_SQL" | sqlite3 "$DB_PATH" &> /dev/null; then
        log_error "❌ Failed to create migrations tracking table"
        exit 1
    fi
    log_success "✅ Migrations tracking table ready"
fi

# Calculate checksum of the SQL file
if command -v sha256sum &> /dev/null; then
    CHECKSUM=$(sha256sum "$SQL_FILE" | cut -d' ' -f1)
elif command -v shasum &> /dev/null; then
    CHECKSUM=$(shasum -a 256 "$SQL_FILE" | cut -d' ' -f1)
else
    log_error "❌ No checksum utility found (sha256sum or shasum required)"
    exit 1
fi

if [[ "$VERBOSE" == true ]]; then
    log_info "📄 File checksum: $CHECKSUM"
fi

# Check if migration has already been executed
EXISTING_CHECKSUM=$(sqlite3 "$DB_PATH" "SELECT checksum FROM schema_migrations WHERE filename = '$FILENAME';" 2>/dev/null || echo "")

if [[ -n "$EXISTING_CHECKSUM" ]]; then
    if [[ "$EXISTING_CHECKSUM" == "$CHECKSUM" ]]; then
        log_warning "⏭️  Migration '$FILENAME' already executed with same checksum, skipping"
        exit 0
    else
        log_warning "⚠️  Migration '$FILENAME' was executed before but with different content"
        log_warning "Previous checksum: $EXISTING_CHECKSUM"
        log_warning "Current checksum:  $CHECKSUM"
        read -p "Do you want to continue anyway? (y/N): " -n 1 -r
        echo
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            log_info "Migration cancelled by user"
            exit 0
        fi
    fi
fi

if [[ "$DRY_RUN" == true ]]; then
    log_info "🔍 DRY RUN - Would execute migration: $FILENAME"
    log_info "📄 File contents:"
    echo "----------------------------------------"
    cat "$SQL_FILE"
    echo "----------------------------------------"
    exit 0
fi

# Execute the migration
log_info "🔄 Executing migration: $FILENAME"
START_TIME=$(date +%s)  # Get time in seconds

if [[ "$VERBOSE" == true ]]; then
    log_info "📋 Executing SQL statements..."
    # Execute with verbose output
    if sqlite3 "$DB_PATH" < "$SQL_FILE"; then
        EXECUTION_SUCCESS=true
    else
        EXECUTION_SUCCESS=false
    fi
else
    # Execute without verbose output
    if sqlite3 "$DB_PATH" < "$SQL_FILE" &> /dev/null; then
        EXECUTION_SUCCESS=true
    else
        EXECUTION_SUCCESS=false
    fi
fi

END_TIME=$(date +%s)
EXECUTION_TIME=$(((END_TIME - START_TIME) * 1000))  # Convert to milliseconds

if [[ "$EXECUTION_SUCCESS" == true ]]; then
    log_success "✅ Migration executed successfully"
    
    # Record the migration execution
    RECORD_SQL="
    INSERT OR REPLACE INTO schema_migrations (filename, checksum, execution_time_ms)
    VALUES ('$FILENAME', '$CHECKSUM', $EXECUTION_TIME);
    "
    
    if echo "$RECORD_SQL" | sqlite3 "$DB_PATH" &> /dev/null; then
        log_success "✅ Migration recorded in tracking table"
    else
        log_warning "⚠️  Migration succeeded but failed to record in tracking table"
    fi
    
    log_success "🎉 Migration '$FILENAME' completed in ${EXECUTION_TIME}ms"
else
    log_error "❌ Migration failed"
    log_error "Please check the SQL file and database for details"
    exit 1
fi