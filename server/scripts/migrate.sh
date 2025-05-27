#!/bin/bash

# Database Migration Script
# Simple bash script to execute SQL migrations using psql
#
# Usage:
#   ./scripts/migrate.sh <sql_file>
#   ./scripts/migrate.sh migrations/001_firebase_to_auth0_migration.sql
#
# Prerequisites:
#   - psql command available
#   - DATABASE_URL environment variable set (or .env file)
#   - Database server running and accessible

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
Database Migration Script

DESCRIPTION:
    Simple bash script to execute SQL migration files using psql.
    Uses the same DATABASE_URL as the main application.

USAGE:
    $0 <sql_file> [options]

OPTIONS:
    -h, --help      Show this help message
    -v, --verbose   Enable verbose output
    --dry-run       Show what would be executed without running

EXAMPLES:
    # Run the Auth0 migration
    $0 migrations/001_firebase_to_auth0_migration.sql

    # Dry run to see what would be executed
    $0 migrations/001_firebase_to_auth0_migration.sql --dry-run

    # Verbose output
    $0 migrations/001_firebase_to_auth0_migration.sql --verbose

PREREQUISITES:
    - psql command must be available
    - DATABASE_URL environment variable must be set (or in .env file)
    - Database server must be running and accessible

EXAMPLES OF DATABASE_URL:
    DATABASE_URL="postgresql://user:password@localhost:5432/database_name"
    DATABASE_URL="postgresql://user:password@localhost:5432/vibe_manager"
EOF
}

# Parse command line arguments
SQL_FILE=""
DRY_RUN=false
VERBOSE=false

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

# Load .env file if it exists
if [[ -f .env ]]; then
    log_info "Loading environment variables from .env file"
    if [[ "$VERBOSE" == true ]]; then
        log_info "Found .env file, sourcing variables"
    fi
    # Load .env file properly, ignoring comments and empty lines
    set -a  # Automatically export variables
    source .env
    set +a  # Stop automatically exporting
fi

# Check if DATABASE_URL is set
if [[ -z "$DATABASE_URL" ]]; then
    log_error "DATABASE_URL environment variable is not set"
    log_error "Please set DATABASE_URL or add it to your .env file"
    log_error "Example: DATABASE_URL=\"postgresql://user:password@localhost:5432/database\""
    exit 1
fi

# Check if psql is available
if ! command -v psql &> /dev/null; then
    log_error "psql command not found"
    log_error "Please install PostgreSQL client tools"
    exit 1
fi

# Check if SQL file exists
if [[ ! -f "$SQL_FILE" ]]; then
    log_error "SQL file not found: $SQL_FILE"
    exit 1
fi

# Extract filename for logging
FILENAME=$(basename "$SQL_FILE")

log_info "🚀 Starting database migration"
log_info "📁 SQL file: $SQL_FILE"

if [[ "$VERBOSE" == true ]]; then
    log_info "Database URL: ${DATABASE_URL:0:30}..."
fi

# Test database connection
log_info "🔍 Testing database connection"
if ! psql "$DATABASE_URL" -c "SELECT 1;" &> /dev/null; then
    log_error "❌ Failed to connect to database"
    log_error "Please check your DATABASE_URL and ensure the database server is running"
    exit 1
fi
log_success "✅ Database connection successful"

# Create migrations tracking table if it doesn't exist
log_info "📋 Ensuring migrations tracking table exists"
TRACKING_SQL="
CREATE TABLE IF NOT EXISTS schema_migrations (
    id SERIAL PRIMARY KEY,
    filename VARCHAR(255) UNIQUE NOT NULL,
    checksum VARCHAR(64) NOT NULL,
    executed_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    execution_time_ms BIGINT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_schema_migrations_filename 
ON schema_migrations(filename);
"

if [[ "$DRY_RUN" == true ]]; then
    log_info "🔍 DRY RUN - Would create migrations tracking table"
else
    if ! echo "$TRACKING_SQL" | psql "$DATABASE_URL" &> /dev/null; then
        log_error "❌ Failed to create migrations tracking table"
        exit 1
    fi
    log_success "✅ Migrations tracking table ready"
fi

# Calculate checksum of the SQL file
CHECKSUM=$(sha256sum "$SQL_FILE" | cut -d' ' -f1)
if [[ "$VERBOSE" == true ]]; then
    log_info "📄 File checksum: $CHECKSUM"
fi

# Check if migration has already been executed
EXISTING_CHECKSUM=$(psql "$DATABASE_URL" -t -c "SELECT checksum FROM schema_migrations WHERE filename = '$FILENAME';" 2>/dev/null | xargs || echo "")

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
START_TIME=$(date +%s)  # Get time in seconds, we'll convert to ms later

if [[ "$VERBOSE" == true ]]; then
    log_info "📋 Executing SQL statements..."
    # Execute with verbose output
    if psql "$DATABASE_URL" -f "$SQL_FILE" -v ON_ERROR_STOP=1; then
        EXECUTION_SUCCESS=true
    else
        EXECUTION_SUCCESS=false
    fi
else
    # Execute without verbose output
    if psql "$DATABASE_URL" -f "$SQL_FILE" -v ON_ERROR_STOP=1 &> /dev/null; then
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
    INSERT INTO schema_migrations (filename, checksum, execution_time_ms)
    VALUES ('$FILENAME', '$CHECKSUM', $EXECUTION_TIME)
    ON CONFLICT (filename) 
    DO UPDATE SET 
        checksum = EXCLUDED.checksum,
        executed_at = NOW(),
        execution_time_ms = EXCLUDED.execution_time_ms;
    "
    
    if echo "$RECORD_SQL" | psql "$DATABASE_URL" &> /dev/null; then
        log_success "✅ Migration recorded in tracking table"
    else
        log_warning "⚠️  Migration succeeded but failed to record in tracking table"
    fi
    
    log_success "🎉 Migration '$FILENAME' completed in ${EXECUTION_TIME}ms"
else
    log_error "❌ Migration failed"
    log_error "Please check the SQL file and database logs for details"
    exit 1
fi