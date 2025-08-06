#!/bin/bash
# Script to run migrations while preserving data_xxx naming convention

set -e

DATABASE_URL="${DATABASE_URL:-postgresql://localhost:5432/vibe_manager}"

echo "Running migrations with custom order..."

# Create database if it doesn't exist
sqlx database create || echo "Database already exists"

# Run consolidated schema first
if [ -f "migrations/consolidated_schema.sql" ]; then
    echo "Running consolidated schema..."
    psql "$DATABASE_URL" < migrations/consolidated_schema.sql
fi

# Define the order of data files if needed
# Modify this array to control the execution order
DATA_FILES=(
    "data_providers.sql"
    "data_models.sql"
    "data_model_mappings.sql"
    "data_system_prompts.sql"
    "data_app_configs.sql"
    "data_estimation_coefficients.sql"
)

# Run data files in specified order
for file in "${DATA_FILES[@]}"; do
    if [ -f "migrations/$file" ]; then
        echo "Running $file..."
        psql "$DATABASE_URL" < "migrations/$file"
    else
        echo "Warning: $file not found, skipping..."
    fi
done

echo "All migrations completed successfully!"