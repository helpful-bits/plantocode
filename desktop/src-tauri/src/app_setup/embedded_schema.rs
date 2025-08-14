/// Embedded database schema as a fallback when the external file is not available
/// This ensures the database can always be initialized even if resource files are missing
pub const CONSOLIDATED_SCHEMA: &str = include_str!("../../migrations/consolidated_schema.sql");