/// Embedded database schema as a fallback when the external file is not available
/// This ensures the database can always be initialized even if resource files are missing
pub const CONSOLIDATED_SCHEMA: &str = include_str!("../../migrations/consolidated_schema.sql");

/// Get the consolidated schema SQL for first-run fallback
pub fn get_consolidated_schema_sql() -> &'static str {
    CONSOLIDATED_SCHEMA
}