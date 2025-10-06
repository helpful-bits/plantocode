use crate::error::AppError;
use crate::models::{
    AcceptConsentRequest, AuthenticatedUser, ConsentDocumentType, ConsentRegion, ConsentSource,
};
use crate::services::consent_service::ConsentService;
use actix_web::{HttpRequest, HttpResponse, web};
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use uuid::Uuid;

// Query structs
#[derive(Debug, Deserialize)]
pub struct RegionQuery {
    pub region: String,
}

#[derive(Debug, Deserialize)]
pub struct ReportQuery {
    pub region: Option<String>,
    pub doc_type: Option<String>,
    pub from: Option<String>,
    pub to: Option<String>,
    pub format: Option<String>,
}

/// Get current legal documents for the region
pub async fn get_current_legal_documents(
    query: web::Query<RegionQuery>,
    consent_service: web::Data<Arc<ConsentService>>,
) -> Result<HttpResponse, AppError> {
    let region = query
        .region
        .parse::<ConsentRegion>()
        .map_err(|_| AppError::BadRequest(format!("Invalid region: {}", query.region)))?;

    let documents = consent_service.get_current_legal_documents(&region).await?;

    Ok(HttpResponse::Ok().json(documents))
}

/// Get user's consent status
pub async fn get_consent_status(
    auth: web::ReqData<AuthenticatedUser>,
    query: web::Query<RegionQuery>,
    consent_service: web::Data<Arc<ConsentService>>,
) -> Result<HttpResponse, AppError> {
    let region = query
        .region
        .parse::<ConsentRegion>()
        .map_err(|_| AppError::BadRequest(format!("Invalid region: {}", query.region)))?;

    let status = consent_service
        .get_consent_status(&auth.user_id, &region)
        .await?;

    Ok(HttpResponse::Ok().json(status))
}

/// Quick verification check
pub async fn verify_consent(
    auth: web::ReqData<AuthenticatedUser>,
    query: web::Query<RegionQuery>,
    consent_service: web::Data<Arc<ConsentService>>,
) -> Result<HttpResponse, AppError> {
    let region = query
        .region
        .parse::<ConsentRegion>()
        .map_err(|_| AppError::BadRequest(format!("Invalid region: {}", query.region)))?;

    let verification = consent_service
        .verify_consent(&auth.user_id, &region)
        .await?;

    Ok(HttpResponse::Ok().json(verification))
}

/// Accept consent
pub async fn accept_consent(
    auth: web::ReqData<AuthenticatedUser>,
    req: HttpRequest,
    json: web::Json<AcceptConsentRequest>,
    consent_service: web::Data<Arc<ConsentService>>,
) -> Result<HttpResponse, AppError> {
    let request = json.into_inner();

    // Extract IP from connection info
    let ip_address = req
        .connection_info()
        .realip_remote_addr()
        .and_then(|ip_str| ip_str.parse().ok());

    // Extract User-Agent from headers
    let user_agent = req
        .headers()
        .get("user-agent")
        .and_then(|h| h.to_str().ok())
        .map(|s| s.to_string());

    // Parse document type and region
    let doc_type = request
        .doc_type
        .parse::<ConsentDocumentType>()
        .map_err(|_| {
            AppError::BadRequest(format!("Invalid document type: {}", request.doc_type))
        })?;

    let region = request
        .region
        .parse::<ConsentRegion>()
        .map_err(|_| AppError::BadRequest(format!("Invalid region: {}", request.region)))?;

    // Call service to accept current consent
    consent_service
        .accept_current(
            &auth.user_id,
            &doc_type,
            &region,
            ConsentSource::Api, // Since this is coming through the API
            ip_address,
            user_agent,
            request.metadata,
        )
        .await?;

    Ok(HttpResponse::NoContent().finish())
}

/// Get consent report (admin only)
pub async fn get_consent_report(
    auth: web::ReqData<AuthenticatedUser>,
    query: web::Query<ReportQuery>,
    consent_service: web::Data<Arc<ConsentService>>,
) -> Result<HttpResponse, AppError> {
    // Check admin role
    if auth.role != "admin" {
        return Err(AppError::Forbidden("Admin access required".to_string()));
    }

    // Parse optional parameters
    let region = if let Some(region_str) = &query.region {
        Some(
            region_str
                .parse::<ConsentRegion>()
                .map_err(|_| AppError::BadRequest(format!("Invalid region: {}", region_str)))?,
        )
    } else {
        None
    };

    let doc_type = if let Some(doc_type_str) = &query.doc_type {
        Some(doc_type_str.parse::<ConsentDocumentType>().map_err(|_| {
            AppError::BadRequest(format!("Invalid document type: {}", doc_type_str))
        })?)
    } else {
        None
    };

    // Parse date filters if provided
    let from = if let Some(from_str) = &query.from {
        Some(
            chrono::DateTime::parse_from_rfc3339(from_str)
                .map_err(|_| {
                    AppError::BadRequest("Invalid 'from' date format. Use RFC3339".to_string())
                })?
                .with_timezone(&chrono::Utc),
        )
    } else {
        None
    };

    let to = if let Some(to_str) = &query.to {
        Some(
            chrono::DateTime::parse_from_rfc3339(to_str)
                .map_err(|_| {
                    AppError::BadRequest("Invalid 'to' date format. Use RFC3339".to_string())
                })?
                .with_timezone(&chrono::Utc),
        )
    } else {
        None
    };

    // Get the report data
    let report_data = consent_service
        .generate_consent_report(query.region.as_deref(), query.doc_type.as_deref(), from, to)
        .await?;

    // Check if CSV format is requested
    if let Some(format) = &query.format {
        if format == "csv" {
            let csv_data = consent_service.format_report_as_csv(&report_data);
            return Ok(HttpResponse::Ok()
                .content_type("text/csv")
                .append_header((
                    "Content-Disposition",
                    "attachment; filename=\"consent_report.csv\"",
                ))
                .body(csv_data));
        }
    }

    // Default to JSON format
    Ok(HttpResponse::Ok().json(report_data))
}
