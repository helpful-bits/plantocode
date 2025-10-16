use crate::error::{AppError, AppResult};
use log::{debug, error, info};
use serde::{Deserialize, Serialize};
use serde_json::{Number, Value as JsonValue};
use sqlx::{Column, FromRow, Row, SqlitePool, TypeInfo};
use tauri::{State, command};

/// Structure for operations in a transaction
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SqlOperation {
    sql: String,
    params: Option<Vec<JsonValue>>,
}

/// Structure for query results
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExecuteResult {
    pub last_insert_id: i64,
    pub rows_affected: u64,
}

/// Execute a SQL query that modifies data
#[command]
pub async fn db_execute_query(
    pool: State<'_, std::sync::Arc<SqlitePool>>,
    sql: String,
    params: Vec<JsonValue>,
) -> AppResult<ExecuteResult> {
    debug!("Execute SQL: {}", sql);
    let pool = pool.inner().as_ref().clone();

    // Convert serde_json::Value params to sqlx::query parameters
    let mut query = sqlx::query(&sql);
    for param in params {
        query = bind_json_value(query, param).map_err(|e| {
            error!("Parameter binding error: {}", e);
            e
        })?;
    }

    // Execute the query
    let result = query.execute(&pool).await.map_err(|e| {
        error!("SQL execution error: {}", e);
        AppError::DatabaseError(format!("Failed to execute query: {}", e))
    })?;

    Ok(ExecuteResult {
        last_insert_id: result.last_insert_rowid(),
        rows_affected: result.rows_affected(),
    })
}

/// Execute a SQL query that fetches data
#[command]
pub async fn db_select_query(
    pool: State<'_, std::sync::Arc<SqlitePool>>,
    sql: String,
    params: Vec<JsonValue>,
) -> AppResult<Vec<JsonValue>> {
    debug!("Select SQL: {}", sql);
    let pool = pool.inner().as_ref().clone();

    // Convert serde_json::Value params to sqlx::query parameters
    let mut query = sqlx::query(&sql);
    for param in params {
        query = bind_json_value(query, param).map_err(|e| {
            error!("Parameter binding error: {}", e);
            e
        })?;
    }

    // Execute the query
    let rows = query.fetch_all(&pool).await.map_err(|e| {
        error!("SQL select error: {}", e);
        AppError::DatabaseError(format!("Failed to execute select query: {}", e))
    })?;

    // Convert rows to JSON values
    let result = rows
        .iter()
        .map(|row| {
            let mut map = serde_json::Map::new();

            // Get column names
            let columns = row.columns();

            for column in columns {
                let column_name = column.name();
                let column_type = column.type_info().name();

                // Extract value based on type
                let value: JsonValue = match column_type {
                    "NULL" => JsonValue::Null,
                    "INTEGER" => {
                        if let Ok(v) = row.try_get::<i64, _>(column_name) {
                            JsonValue::Number(serde_json::Number::from(v))
                        } else {
                            JsonValue::Null
                        }
                    }
                    "REAL" => {
                        if let Ok(v) = row.try_get::<f64, _>(column_name) {
                            match serde_json::Number::from_f64(v) {
                                Some(n) => JsonValue::Number(n),
                                None => {
                                    error!("Invalid f64 value for column '{}': {}", column_name, v);
                                    JsonValue::Null
                                }
                            }
                        } else {
                            JsonValue::Null
                        }
                    }
                    "TEXT" => {
                        if let Ok(v) = row.try_get::<String, _>(column_name) {
                            JsonValue::String(v)
                        } else {
                            JsonValue::Null
                        }
                    }
                    "BLOB" => {
                        if let Ok(v) = row.try_get::<Vec<u8>, _>(column_name) {
                            JsonValue::String(format!("BLOB[{} bytes]", v.len()))
                        } else {
                            JsonValue::Null
                        }
                    }
                    _ => JsonValue::Null,
                };

                map.insert(column_name.to_string(), value);
            }

            JsonValue::Object(map)
        })
        .collect();

    Ok(result)
}

/// Execute a transaction with multiple statements
#[command]
pub async fn db_execute_transaction(
    pool: State<'_, std::sync::Arc<SqlitePool>>,
    operations: Vec<SqlOperation>,
) -> AppResult<()> {
    debug!("Execute transaction with {} operations", operations.len());
    let pool = pool.inner().as_ref().clone();

    // Start transaction
    let mut tx = pool
        .begin()
        .await
        .map_err(|e| AppError::DatabaseError(format!("Failed to start transaction: {}", e)))?;

    // Execute each operation
    for op in operations {
        let mut query = sqlx::query(&op.sql);

        // Bind parameters if provided
        if let Some(params) = op.params {
            for param in params {
                query = bind_json_value(query, param).map_err(|e| {
                    error!("Transaction parameter binding error: {}", e);
                    e
                })?;
            }
        }

        // Execute the query within the transaction
        query.execute(&mut *tx).await.map_err(|e| {
            error!("SQL transaction operation error: {}", e);
            AppError::DatabaseError(format!("Failed to execute transaction operation: {}", e))
        })?;
    }

    // Commit transaction
    tx.commit()
        .await
        .map_err(|e| AppError::DatabaseError(format!("Failed to commit transaction: {}", e)))?;

    Ok(())
}

/// Check if a table exists in the database
#[command]
pub async fn db_table_exists(
    pool: State<'_, std::sync::Arc<SqlitePool>>,
    table_name: String,
) -> AppResult<bool> {
    debug!("Check if table exists: {}", table_name);
    let pool = pool.inner().as_ref().clone();

    let result = sqlx::query("SELECT name FROM sqlite_master WHERE type='table' AND name=?")
        .bind(table_name)
        .fetch_optional(&pool)
        .await
        .map_err(|e| AppError::DatabaseError(format!("Failed to check table existence: {}", e)))?;

    Ok(result.is_some())
}

/// Safely convert a JSON number to i64
fn safe_json_number_to_i64(n: &Number) -> Result<i64, AppError> {
    n.as_i64()
        .ok_or_else(|| AppError::DatabaseError("Failed to convert JSON number to i64".to_string()))
}

/// Safely convert a JSON number to f64
fn safe_json_number_to_f64(n: &Number) -> Result<f64, AppError> {
    n.as_f64()
        .ok_or_else(|| AppError::DatabaseError("Failed to convert JSON number to f64".to_string()))
}

/// Safely serialize a value to JSON string
fn safe_json_serialize<T: Serialize>(value: &T) -> Result<String, AppError> {
    serde_json::to_string(value)
        .map_err(|e| AppError::DatabaseError(format!("Failed to serialize JSON: {}", e)))
}

/// Helper function to bind JSON values to a query with safe conversions
fn bind_json_value<'a>(
    query: sqlx::query::Query<'a, sqlx::Sqlite, sqlx::sqlite::SqliteArguments<'a>>,
    value: JsonValue,
) -> Result<sqlx::query::Query<'a, sqlx::Sqlite, sqlx::sqlite::SqliteArguments<'a>>, AppError> {
    let result = match value {
        JsonValue::Null => query.bind(None::<String>),
        JsonValue::Bool(v) => query.bind(v),
        JsonValue::Number(n) => {
            if n.is_i64() {
                query.bind(safe_json_number_to_i64(&n)?)
            } else if n.is_u64() {
                // Handle potential overflow for u64 to i64 conversion
                let u_val = n.as_u64().ok_or_else(|| {
                    AppError::DatabaseError("Failed to convert JSON number to u64".to_string())
                })?;
                if u_val > i64::MAX as u64 {
                    return Err(AppError::DatabaseError(
                        "Number too large for i64".to_string(),
                    ));
                }
                query.bind(u_val as i64)
            } else {
                query.bind(safe_json_number_to_f64(&n)?)
            }
        }
        JsonValue::String(s) => query.bind(s),
        JsonValue::Array(a) => {
            // Convert array to string representation with safe serialization
            let serialized = safe_json_serialize(&a)?;
            query.bind(serialized)
        }
        JsonValue::Object(o) => {
            // Convert object to string representation with safe serialization
            let serialized = safe_json_serialize(&o)?;
            query.bind(serialized)
        }
    };
    Ok(result)
}
