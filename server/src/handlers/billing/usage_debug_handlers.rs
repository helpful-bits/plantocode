use crate::db::repositories::api_usage_repository::ApiUsageRepository;
use crate::error::AppError;
use crate::models::AuthenticatedUser;
use actix_web::{HttpResponse, web};
use bigdecimal::BigDecimal;
use chrono::{DateTime, Utc};
use log::{error, info};
use serde::{Deserialize, Serialize};
use sqlx::Row;
use uuid::Uuid;

// ========================================
// USAGE DEBUG HANDLERS (ADMIN ONLY)
// ========================================

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UsageDebugRecord {
    pub id: String,
    pub user_id: String,
    pub service_name: String,
    pub tokens_input: i64,
    pub tokens_output: i64,
    pub cached_input_tokens: i64,
    pub cache_write_tokens: i64,
    pub cache_read_tokens: i64,
    pub cost: String,
    pub timestamp: DateTime<Utc>,
    pub request_id: Option<String>,
    pub metadata: Option<serde_json::Value>,
    pub cost_resolution_method: String,
    pub effective_model_id: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UsageDebugResponse {
    pub records: Vec<UsageDebugRecord>,
    pub total_records: i64,
    pub query_limit: i64,
    pub debug_info: DebugInfo,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DebugInfo {
    pub cost_resolution_methods: Vec<String>,
    pub service_names_found: Vec<String>,
    pub users_found: Vec<String>,
    pub date_range: DateRange,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DateRange {
    pub earliest_record: Option<DateTime<Utc>>,
    pub latest_record: Option<DateTime<Utc>>,
}

#[derive(Debug, Deserialize)]
pub struct UsageDebugQuery {
    pub limit: Option<i64>,
    pub user_id: Option<String>,
    pub service_name: Option<String>,
}

/// Admin-only endpoint to get raw usage data for debugging
pub async fn get_usage_debug_data(
    user: web::ReqData<AuthenticatedUser>,
    query: web::Query<UsageDebugQuery>,
    api_usage_repo: web::Data<ApiUsageRepository>,
) -> Result<HttpResponse, AppError> {
    if user.role != "admin" {
        error!(
            "User {} attempted to access admin-only usage debug endpoint",
            user.user_id
        );
        return Err(AppError::Forbidden("Admin access required".to_string()));
    }

    let limit = query.limit.unwrap_or(200).min(1000); // Cap at 1000 records
    let user_filter = query.user_id.as_ref().and_then(|s| Uuid::parse_str(s).ok());
    let service_filter = query.service_name.as_deref();

    // Get raw usage records with debugging information
    let debug_data =
        get_raw_usage_records(&api_usage_repo, limit, user_filter, service_filter).await?;

    info!(
        "Admin user {} retrieved {} usage debug records",
        user.user_id,
        debug_data.records.len()
    );

    Ok(HttpResponse::Ok().json(debug_data))
}

/// Internal function to fetch raw usage records with debugging metadata
async fn get_raw_usage_records(
    api_usage_repo: &ApiUsageRepository,
    limit: i64,
    user_filter: Option<Uuid>,
    service_filter: Option<&str>,
) -> Result<UsageDebugResponse, AppError> {
    let rows = api_usage_repo
        .get_raw_usage_records_for_debug(limit, user_filter, service_filter)
        .await?;

    if rows.is_empty() {
        return Ok(UsageDebugResponse {
            records: vec![],
            total_records: 0,
            query_limit: limit,
            debug_info: DebugInfo {
                cost_resolution_methods: vec![],
                service_names_found: vec![],
                users_found: vec![],
                date_range: DateRange {
                    earliest_record: None,
                    latest_record: None,
                },
            },
        });
    }

    let first_row = &rows[0];
    let total_records: i64 = first_row.try_get("total_records")?;
    let cost_methods: Vec<String> = first_row.try_get("cost_methods")?;
    let service_names: Vec<String> = first_row.try_get("service_names")?;
    let user_ids: Vec<String> = first_row.try_get("user_ids")?;
    let earliest_record: Option<DateTime<Utc>> = first_row.try_get("earliest_record")?;
    let latest_record: Option<DateTime<Utc>> = first_row.try_get("latest_record")?;

    let mut records = Vec::new();
    for row in rows {
        let id: Uuid = row.try_get("id")?;
        let user_id: Uuid = row.try_get("user_id")?;
        let service_name: String = row.try_get("service_name")?;
        let tokens_input: i32 = row.try_get("tokens_input")?;
        let tokens_output: i32 = row.try_get("tokens_output")?;
        let cached_input_tokens: Option<i32> = row.try_get("cached_input_tokens")?;
        let cache_write_tokens: Option<i32> = row.try_get("cache_write_tokens")?;
        let cache_read_tokens: Option<i32> = row.try_get("cache_read_tokens")?;
        let cost: BigDecimal = row.try_get("cost")?;
        let timestamp: DateTime<Utc> = row.try_get("timestamp")?;
        let request_id: Option<String> = row.try_get("request_id")?;
        let metadata: Option<serde_json::Value> = row.try_get("metadata")?;
        let cost_resolution_method: String = row.try_get("cost_resolution_method")?;
        let effective_model_id: String = row.try_get("effective_model_id")?;

        records.push(UsageDebugRecord {
            id: id.to_string(),
            user_id: user_id.to_string(),
            service_name,
            tokens_input: tokens_input as i64,
            tokens_output: tokens_output as i64,
            cached_input_tokens: cached_input_tokens.unwrap_or(0) as i64,
            cache_write_tokens: cache_write_tokens.unwrap_or(0) as i64,
            cache_read_tokens: cache_read_tokens.unwrap_or(0) as i64,
            cost: cost.to_string(),
            timestamp,
            request_id,
            metadata,
            cost_resolution_method,
            effective_model_id,
        });
    }

    Ok(UsageDebugResponse {
        records,
        total_records,
        query_limit: limit,
        debug_info: DebugInfo {
            cost_resolution_methods: cost_methods,
            service_names_found: service_names,
            users_found: user_ids,
            date_range: DateRange {
                earliest_record,
                latest_record,
            },
        },
    })
}
