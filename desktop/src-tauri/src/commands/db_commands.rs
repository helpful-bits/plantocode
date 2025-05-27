use tauri::{command, State};
use std::sync::Arc;
use serde::{Serialize, Deserialize};
use log::{debug, error, info};
use sqlx::{SqlitePool, Row, FromRow, Column, TypeInfo};
use serde_json::Value as JsonValue;
use crate::error::{AppError, AppResult};

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
    pool: State<'_, Arc<SqlitePool>>,
    sql: String,
    params: Vec<JsonValue>,
) -> AppResult<ExecuteResult> {
    debug!("Execute SQL: {}", sql);
    
    // Convert serde_json::Value params to sqlx::query parameters
    let mut query = sqlx::query(&sql);
    for param in params {
        query = bind_json_value(query, param);
    }
    
    // Execute the query
    let result = query
        .execute(&**pool)
        .await
        .map_err(|e| {
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
    pool: State<'_, Arc<SqlitePool>>,
    sql: String,
    params: Vec<JsonValue>,
) -> AppResult<Vec<JsonValue>> {
    debug!("Select SQL: {}", sql);
    
    // Convert serde_json::Value params to sqlx::query parameters
    let mut query = sqlx::query(&sql);
    for param in params {
        query = bind_json_value(query, param);
    }
    
    // Execute the query
    let rows = query
        .fetch_all(&**pool)
        .await
        .map_err(|e| {
            error!("SQL select error: {}", e);
            AppError::DatabaseError(format!("Failed to execute select query: {}", e))
        })?;
    
    // Convert rows to JSON values
    let result = rows.iter().map(|row| {
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
                },
                "REAL" => {
                    if let Ok(v) = row.try_get::<f64, _>(column_name) {
                        let n = serde_json::Number::from_f64(v)
                            .unwrap_or(serde_json::Number::from(0));
                        JsonValue::Number(n)
                    } else {
                        JsonValue::Null
                    }
                },
                "TEXT" => {
                    if let Ok(v) = row.try_get::<String, _>(column_name) {
                        JsonValue::String(v)
                    } else {
                        JsonValue::Null
                    }
                },
                "BLOB" => {
                    if let Ok(v) = row.try_get::<Vec<u8>, _>(column_name) {
                        JsonValue::String(format!("BLOB[{} bytes]", v.len()))
                    } else {
                        JsonValue::Null
                    }
                },
                _ => JsonValue::Null,
            };
            
            map.insert(column_name.to_string(), value);
        }
        
        JsonValue::Object(map)
    }).collect();
    
    Ok(result)
}

/// Execute a transaction with multiple statements
#[command]
pub async fn db_execute_transaction(
    pool: State<'_, Arc<SqlitePool>>,
    operations: Vec<SqlOperation>,
) -> AppResult<()> {
    debug!("Execute transaction with {} operations", operations.len());
    
    // Start transaction
    let mut tx = pool.begin().await
        .map_err(|e| AppError::DatabaseError(format!("Failed to start transaction: {}", e)))?;
    
    // Execute each operation
    for op in operations {
        let mut query = sqlx::query(&op.sql);
        
        // Bind parameters if provided
        if let Some(params) = op.params {
            for param in params {
                query = bind_json_value(query, param);
            }
        }
        
        // Execute the query within the transaction
        query.execute(&mut *tx)
            .await
            .map_err(|e| {
                error!("SQL transaction operation error: {}", e);
                AppError::DatabaseError(format!("Failed to execute transaction operation: {}", e))
            })?;
    }
    
    // Commit transaction
    tx.commit().await
        .map_err(|e| AppError::DatabaseError(format!("Failed to commit transaction: {}", e)))?;
    
    Ok(())
}

/// Check if a table exists in the database
#[command]
pub async fn db_table_exists(
    pool: State<'_, Arc<SqlitePool>>,
    table_name: String,
) -> AppResult<bool> {
    debug!("Check if table exists: {}", table_name);
    
    let result = sqlx::query(
        "SELECT name FROM sqlite_master WHERE type='table' AND name=?"
    )
    .bind(table_name)
    .fetch_optional(&**pool)
    .await
    .map_err(|e| AppError::DatabaseError(format!("Failed to check table existence: {}", e)))?;
    
    Ok(result.is_some())
}

/// Helper function to bind JSON values to a query
fn bind_json_value<'a>(
    query: sqlx::query::Query<'a, sqlx::Sqlite, sqlx::sqlite::SqliteArguments<'a>>,
    value: JsonValue,
) -> sqlx::query::Query<'a, sqlx::Sqlite, sqlx::sqlite::SqliteArguments<'a>> {
    match value {
        JsonValue::Null => query.bind(None::<String>),
        JsonValue::Bool(v) => query.bind(v),
        JsonValue::Number(n) => {
            if n.is_i64() {
                query.bind(n.as_i64().unwrap())
            } else if n.is_u64() {
                query.bind(n.as_u64().unwrap() as i64)
            } else {
                query.bind(n.as_f64().unwrap())
            }
        },
        JsonValue::String(s) => query.bind(s),
        JsonValue::Array(a) => {
            // Convert array to string representation
            query.bind(serde_json::to_string(&a).unwrap_or_default())
        },
        JsonValue::Object(o) => {
            // Convert object to string representation
            query.bind(serde_json::to_string(&o).unwrap_or_default())
        },
    }
}