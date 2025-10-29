use crate::error::AppError;
use sqlx::{Executor, Row, SqlitePool};

/// Split an SQLite script into individual statements, handling trigger blocks correctly.
///
/// This function splits SQL scripts on top-level semicolons while being aware of:
/// - String literals (both single and double quotes)
/// - Line comments (-- ...)
/// - Block comments (/* ... */)
/// - CREATE TRIGGER ... BEGIN ... END blocks (trigger depth tracking)
///
/// The trigger depth tracking is ESSENTIAL to avoid splitting statements inside trigger bodies.
/// When we encounter a CREATE TRIGGER statement, we track BEGIN/END tokens to know when
/// the trigger definition is complete.
///
/// # Arguments
/// * `script` - The SQL script to split
///
/// # Returns
/// A vector of trimmed, non-empty SQL statements
pub fn split_sqlite_script(script: &str) -> Vec<String> {
    let mut statements = Vec::new();
    let mut current_statement = String::new();
    let mut chars = script.chars().peekable();

    // State tracking
    let mut in_single_quote = false;
    let mut in_double_quote = false;
    let mut in_line_comment = false;
    let mut in_block_comment = false;
    let mut trigger_depth = 0; // Track BEGIN/END depth inside CREATE TRIGGER blocks
    let mut in_trigger_context = false; // Are we currently inside a CREATE TRIGGER statement?

    // Track the last few tokens to detect CREATE TRIGGER context
    let mut token_buffer = String::new();

    while let Some(ch) = chars.next() {
        // Handle escape sequences in strings
        if (in_single_quote || in_double_quote) && ch == '\\' {
            current_statement.push(ch);
            if let Some(next_ch) = chars.next() {
                current_statement.push(next_ch);
            }
            continue;
        }

        // Toggle string literal states
        if ch == '\'' && !in_double_quote && !in_line_comment && !in_block_comment {
            in_single_quote = !in_single_quote;
            current_statement.push(ch);
            continue;
        }

        if ch == '"' && !in_single_quote && !in_line_comment && !in_block_comment {
            in_double_quote = !in_double_quote;
            current_statement.push(ch);
            continue;
        }

        // Inside string literals, just accumulate characters
        if in_single_quote || in_double_quote {
            current_statement.push(ch);
            continue;
        }

        // Handle line comments
        if !in_block_comment && ch == '-' && chars.peek() == Some(&'-') {
            in_line_comment = true;
            current_statement.push(ch);
            continue;
        }

        if in_line_comment {
            current_statement.push(ch);
            if ch == '\n' {
                in_line_comment = false;
            }
            continue;
        }

        // Handle block comments
        if !in_block_comment && ch == '/' && chars.peek() == Some(&'*') {
            in_block_comment = true;
            current_statement.push(ch);
            current_statement.push(chars.next().unwrap());
            continue;
        }

        if in_block_comment {
            current_statement.push(ch);
            if ch == '*' && chars.peek() == Some(&'/') {
                current_statement.push(chars.next().unwrap());
                in_block_comment = false;
            }
            continue;
        }

        // At this point, we're in normal SQL code (not in strings or comments)

        // Build token buffer to detect CREATE TRIGGER
        if ch.is_alphanumeric() || ch == '_' {
            token_buffer.push(ch);
        } else if !token_buffer.is_empty() {
            // Token just ended - check if we're entering a trigger context
            let token_upper = token_buffer.to_uppercase();

            // Detect CREATE TRIGGER pattern
            if token_upper == "TRIGGER" {
                // Look back in current_statement to see if "CREATE" precedes this
                let stmt_upper = current_statement.to_uppercase();
                if stmt_upper.contains("CREATE") {
                    in_trigger_context = true;
                    trigger_depth = 0; // Reset depth when entering trigger
                }
            }

            // Track BEGIN/END depth inside trigger context
            if in_trigger_context {
                if token_upper == "BEGIN" {
                    trigger_depth += 1;
                } else if token_upper == "END" {
                    trigger_depth -= 1;
                    // If we've closed all BEGIN blocks, the trigger is complete
                    if trigger_depth == 0 {
                        in_trigger_context = false;
                    }
                }
            }

            token_buffer.clear();
        }

        current_statement.push(ch);

        // Check for statement terminator (semicolon at top level)
        if ch == ';' && !in_trigger_context {
            // Only split if we're not inside a trigger definition
            let trimmed = current_statement.trim();
            if !trimmed.is_empty() {
                statements.push(trimmed.to_string());
            }
            current_statement.clear();
            token_buffer.clear();
        }
    }

    // Add any remaining statement
    let trimmed = current_statement.trim();
    if !trimmed.is_empty() {
        statements.push(trimmed.to_string());
    }

    statements
}

/// Execute an SQL script in a single transaction with proper error handling.
///
/// This function:
/// 1. Acquires a database connection
/// 2. Begins an IMMEDIATE transaction for write lock
/// 3. Splits the script using trigger-aware splitting
/// 4. Executes each statement sequentially
/// 5. On error: rolls back and returns detailed error context
/// 6. On success: commits the transaction
///
/// # Arguments
/// * `pool` - The SQLite connection pool
/// * `script` - The SQL script to execute
///
/// # Returns
/// * `Ok(())` on success
/// * `Err(AppError::DatabaseError)` with detailed context on failure
pub async fn execute_script_in_transaction(
    pool: &SqlitePool,
    script: &str,
) -> Result<(), AppError> {
    // Acquire a connection from the pool
    let mut conn = pool.acquire().await.map_err(|e| {
        AppError::DatabaseError(format!("Failed to acquire database connection: {}", e))
    })?;

    // Begin an IMMEDIATE transaction to acquire write lock
    sqlx::query("BEGIN IMMEDIATE")
        .execute(&mut *conn)
        .await
        .map_err(|e| {
            AppError::DatabaseError(format!("Failed to begin transaction: {}", e))
        })?;

    // Split the script into individual statements
    let statements = split_sqlite_script(script);

    // Execute each statement
    for (idx, statement) in statements.iter().enumerate() {
        let result = sqlx::query(statement).execute(&mut *conn).await;

        if let Err(e) = result {
            // Rollback on error
            let _ = sqlx::query("ROLLBACK").execute(&mut *conn).await;

            // Create detailed error context
            let statement_excerpt = if statement.len() > 200 {
                format!("{}...", &statement[..200])
            } else {
                statement.clone()
            };

            return Err(AppError::DatabaseError(format!(
                "Failed to execute statement {} of {}: {}\nStatement: {}",
                idx + 1,
                statements.len(),
                e,
                statement_excerpt
            )));
        }
    }

    // Commit the transaction on success
    sqlx::query("COMMIT")
        .execute(&mut *conn)
        .await
        .map_err(|e| {
            // Try to rollback if commit fails
            let _ = sqlx::query("ROLLBACK").execute(&mut *conn);
            AppError::DatabaseError(format!("Failed to commit transaction: {}", e))
        })?;

    Ok(())
}

/// Check if a column exists in a table using PRAGMA table_info.
///
/// # Arguments
/// * `pool` - The SQLite connection pool
/// * `table` - The table name to check
/// * `column` - The column name to check
///
/// # Returns
/// * `Ok(true)` if the column exists
/// * `Ok(false)` if the column does not exist
/// * `Err(AppError::DatabaseError)` on database error
pub async fn has_column(
    pool: &SqlitePool,
    table: &str,
    column: &str,
) -> Result<bool, AppError> {
    // Use PRAGMA table_info to get column information
    let query = format!("PRAGMA table_info('{}')", table);
    let rows = sqlx::query(&query)
        .fetch_all(pool)
        .await
        .map_err(|e| {
            AppError::DatabaseError(format!(
                "Failed to query table info for '{}': {}",
                table, e
            ))
        })?;

    // Check if any row has the specified column name
    for row in rows {
        let col_name: String = row.try_get("name").map_err(|e| {
            AppError::DatabaseError(format!("Failed to read column name: {}", e))
        })?;

        if col_name.eq_ignore_ascii_case(column) {
            return Ok(true);
        }
    }

    Ok(false)
}

/// Check if a trigger exists in the database.
///
/// # Arguments
/// * `pool` - The SQLite connection pool
/// * `trigger_name` - The name of the trigger to check
///
/// # Returns
/// * `Ok(true)` if the trigger exists
/// * `Ok(false)` if the trigger does not exist
/// * `Err(AppError::DatabaseError)` on database error
pub async fn trigger_exists(
    pool: &SqlitePool,
    trigger_name: &str,
) -> Result<bool, AppError> {
    // Query sqlite_master for the trigger
    let query = "SELECT COUNT(*) as count FROM sqlite_master WHERE type='trigger' AND name=?";
    let row = sqlx::query(query)
        .bind(trigger_name)
        .fetch_one(pool)
        .await
        .map_err(|e| {
            AppError::DatabaseError(format!(
                "Failed to check if trigger '{}' exists: {}",
                trigger_name, e
            ))
        })?;

    let count: i64 = row.try_get("count").map_err(|e| {
        AppError::DatabaseError(format!("Failed to read trigger count: {}", e))
    })?;

    Ok(count > 0)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_split_simple_statements() {
        let script = "SELECT 1; SELECT 2; SELECT 3;";
        let statements = split_sqlite_script(script);
        assert_eq!(statements.len(), 3);
        assert_eq!(statements[0], "SELECT 1;");
        assert_eq!(statements[1], "SELECT 2;");
        assert_eq!(statements[2], "SELECT 3;");
    }

    #[test]
    fn test_split_with_string_literals() {
        let script = "SELECT 'hello; world'; SELECT \"test; data\";";
        let statements = split_sqlite_script(script);
        assert_eq!(statements.len(), 2);
        assert!(statements[0].contains("hello; world"));
        assert!(statements[1].contains("test; data"));
    }

    #[test]
    fn test_split_with_comments() {
        let script = "SELECT 1; -- comment; with semicolon\nSELECT 2; /* block; comment */ SELECT 3;";
        let statements = split_sqlite_script(script);
        assert_eq!(statements.len(), 3);
    }

    #[test]
    fn test_split_trigger_block() {
        let script = r#"
            CREATE TRIGGER my_trigger
            AFTER INSERT ON users
            BEGIN
                UPDATE stats SET count = count + 1;
                INSERT INTO logs VALUES (NEW.id);
            END;
            SELECT 1;
        "#;
        let statements = split_sqlite_script(script);
        assert_eq!(statements.len(), 2);
        assert!(statements[0].contains("CREATE TRIGGER"));
        assert!(statements[0].contains("END;"));
        assert_eq!(statements[1].trim(), "SELECT 1;");
    }

    #[test]
    fn test_split_nested_trigger_begins() {
        let script = r#"
            CREATE TRIGGER complex_trigger
            AFTER UPDATE ON orders
            BEGIN
                UPDATE inventory SET qty = qty - 1;
                BEGIN
                    INSERT INTO audit VALUES (NEW.id);
                END;
            END;
            SELECT 1;
        "#;
        let statements = split_sqlite_script(script);
        assert_eq!(statements.len(), 2);
        assert!(statements[0].contains("CREATE TRIGGER"));
        assert!(statements[1].contains("SELECT 1"));
    }

    #[test]
    fn test_empty_and_whitespace_statements() {
        let script = "  ; SELECT 1;  ; ;  SELECT 2;  ";
        let statements = split_sqlite_script(script);
        assert_eq!(statements.len(), 2);
        assert!(statements[0].contains("SELECT 1"));
        assert!(statements[1].contains("SELECT 2"));
    }
}
