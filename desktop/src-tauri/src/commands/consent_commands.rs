use crate::api_clients::consent_client::ConsentClient;
use crate::error::AppError;
use log::{debug, info, warn};
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tauri::{AppHandle, Manager};
use tokio::sync::RwLock;

// Response structures matching server-side consent models
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LegalDocument {
    pub id: String,
    pub doc_type: String, // 'terms' or 'privacy'
    pub region: String,   // 'eu' or 'us'
    pub version: String,
    pub effective_at: String,
    pub url: String,
    pub content_hash: Option<String>,
    pub material_change: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConsentStatusItem {
    pub doc_type: String, // 'terms' or 'privacy'
    pub region: String,   // 'eu' or 'us'
    pub current_version: String,
    pub accepted_version: Option<String>,
    pub accepted_at: Option<String>,
    pub requires_reconsent: bool,
    pub effective_at: String,
    pub url: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConsentStatusResponse {
    pub user_id: String,
    pub region: String, // 'eu' or 'us'
    pub items: Vec<ConsentStatusItem>,
    pub all_consented: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConsentVerificationResponse {
    pub requires_reconsent: bool,
    pub missing: Vec<String>,
    pub details: Vec<ConsentStatusItem>,
}

/// Get current legal documents for a specific region
#[tauri::command]
pub async fn get_current_legal_documents_command(
    region: String,
    app_handle: tauri::AppHandle,
) -> Result<Vec<LegalDocument>, AppError> {
    debug!("Getting current legal documents for region: {}", region);

    // Validate region parameter
    if region != "eu" && region != "us" {
        return Err(AppError::ValidationError(
            "Region must be 'eu' or 'us'".to_string(),
        ));
    }

    let consent_client_lock = app_handle
        .state::<Arc<RwLock<Option<Arc<ConsentClient>>>>>()
        .inner()
        .clone();
    let consent_client_guard = consent_client_lock.read().await;
    let consent_client = consent_client_guard
        .as_ref()
        .ok_or_else(|| {
            warn!("ConsentClient not available");
            AppError::InitializationError("Consent client not available".to_string())
        })?
        .clone();
    drop(consent_client_guard);

    let response = consent_client
        .get_current_documents(&region)
        .await
        .map_err(|e| {
            warn!("Failed to get legal documents: {}", e);
            e
        })?;

    info!(
        "Successfully retrieved {} legal documents for region {}",
        response.len(),
        region
    );
    Ok(response)
}

/// Get user's consent status for a specific region
#[tauri::command]
pub async fn get_consent_status_command(
    region: String,
    app_handle: tauri::AppHandle,
) -> Result<ConsentStatusResponse, AppError> {
    debug!("Getting consent status for region: {}", region);

    // Validate region parameter
    if region != "eu" && region != "us" {
        return Err(AppError::ValidationError(
            "Region must be 'eu' or 'us'".to_string(),
        ));
    }

    let consent_client_lock = app_handle
        .state::<Arc<RwLock<Option<Arc<ConsentClient>>>>>()
        .inner()
        .clone();
    let consent_client_guard = consent_client_lock.read().await;
    let consent_client = consent_client_guard
        .as_ref()
        .ok_or_else(|| {
            warn!("ConsentClient not available");
            AppError::InitializationError("Consent client not available".to_string())
        })?
        .clone();
    drop(consent_client_guard);

    let response = consent_client.get_status(&region).await.map_err(|e| {
        warn!("Failed to get consent status: {}", e);
        e
    })?;

    info!(
        "Successfully retrieved consent status for region {}",
        region
    );
    Ok(response)
}

/// Verify consent requirements for a specific region
#[tauri::command]
pub async fn verify_consent_command(
    region: String,
    app_handle: tauri::AppHandle,
) -> Result<ConsentVerificationResponse, AppError> {
    debug!("Verifying consent for region: {}", region);

    // Validate region parameter
    if region != "eu" && region != "us" {
        return Err(AppError::ValidationError(
            "Region must be 'eu' or 'us'".to_string(),
        ));
    }

    let consent_client_lock = app_handle
        .state::<Arc<RwLock<Option<Arc<ConsentClient>>>>>()
        .inner()
        .clone();
    let consent_client_guard = consent_client_lock.read().await;
    let consent_client = consent_client_guard
        .as_ref()
        .ok_or_else(|| {
            warn!("ConsentClient not available");
            AppError::InitializationError("Consent client not available".to_string())
        })?
        .clone();
    drop(consent_client_guard);

    let response = consent_client.verify(&region).await.map_err(|e| {
        warn!("Failed to verify consent: {}", e);
        e
    })?;

    info!("Successfully verified consent for region {}", region);
    Ok(response)
}

/// Accept consent for a specific document
#[tauri::command]
pub async fn accept_consent_command(
    doc_type: String,
    region: String,
    metadata: Option<serde_json::Value>,
    app_handle: tauri::AppHandle,
) -> Result<(), AppError> {
    debug!(
        "Accepting consent for doc_type: {}, region: {}",
        doc_type, region
    );

    // Validate parameters
    if doc_type != "terms" && doc_type != "privacy" {
        return Err(AppError::ValidationError(
            "Document type must be 'terms' or 'privacy'".to_string(),
        ));
    }

    if region != "eu" && region != "us" {
        return Err(AppError::ValidationError(
            "Region must be 'eu' or 'us'".to_string(),
        ));
    }

    let consent_client_lock = app_handle
        .state::<Arc<RwLock<Option<Arc<ConsentClient>>>>>()
        .inner()
        .clone();
    let consent_client_guard = consent_client_lock.read().await;
    let consent_client = consent_client_guard
        .as_ref()
        .ok_or_else(|| {
            warn!("ConsentClient not available");
            AppError::InitializationError("Consent client not available".to_string())
        })?
        .clone();
    drop(consent_client_guard);

    consent_client
        .accept(&doc_type, &region, metadata)
        .await
        .map_err(|e| {
            warn!("Failed to accept consent: {}", e);
            e
        })?;

    info!("Successfully accepted consent for region {}", region);
    Ok(())
}
