use crate::auth::{header_utils, token_manager::TokenManager};
use crate::error::AppError;
use log::{debug, error, info};
use reqwest::Client;
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tauri;

// Import types from commands to ensure consistency
use crate::commands::consent_commands::{
    ConsentStatusResponse, ConsentVerificationResponse, LegalDocument,
};

/// Dedicated client for handling consent-related API calls
pub struct ConsentClient {
    http: Client,
    base_url: String,
    token_manager: Arc<TokenManager>,
    app_handle: tauri::AppHandle,
}

impl ConsentClient {
    /// Create a new ConsentClient instance
    pub fn new(
        base_url: String,
        token_manager: Arc<TokenManager>,
        app_handle: tauri::AppHandle,
    ) -> Self {
        let http = crate::api_clients::client_factory::create_http_client();
        Self {
            http,
            base_url,
            token_manager,
            app_handle,
        }
    }

    /// Internal helper method for making authenticated requests
    async fn make_authenticated_request<T: for<'de> Deserialize<'de>>(
        &self,
        method: &str,
        endpoint: &str,
        body: Option<serde_json::Value>,
    ) -> Result<T, AppError> {
        let token =
            self.token_manager.get().await.ok_or_else(|| {
                AppError::AuthError("No authentication token available".to_string())
            })?;

        let mut request_builder = match method.to_uppercase().as_str() {
            "GET" => self.http.get(&format!("{}{}", self.base_url, endpoint)),
            "POST" => self.http.post(&format!("{}{}", self.base_url, endpoint)),
            "PUT" => self.http.put(&format!("{}{}", self.base_url, endpoint)),
            "DELETE" => self.http.delete(&format!("{}{}", self.base_url, endpoint)),
            _ => {
                return Err(AppError::InvalidArgument(
                    "Unsupported HTTP method".to_string(),
                ));
            }
        };

        request_builder =
            header_utils::apply_auth_headers(request_builder, &token, &self.app_handle)?;

        if let Some(body_data) = body {
            request_builder = request_builder
                .header("Content-Type", "application/json")
                .json(&body_data);
        }

        let response = request_builder
            .send()
            .await
            .map_err(|e| AppError::NetworkError(format!("Request failed: {}", e)))?;

        if !response.status().is_success() {
            return Err(AppError::ExternalServiceError(format!(
                "Server error: {}",
                response.status()
            )));
        }

        let result: T = response
            .json()
            .await
            .map_err(|e| AppError::InvalidResponse(format!("Failed to parse response: {}", e)))?;

        Ok(result)
    }

    /// Make an authenticated request that expects no response body (204 No Content)
    async fn make_authenticated_request_no_response(
        &self,
        method: &str,
        endpoint: &str,
        body: Option<serde_json::Value>,
    ) -> Result<(), AppError> {
        let token =
            self.token_manager.get().await.ok_or_else(|| {
                AppError::AuthError("No authentication token available".to_string())
            })?;

        let mut request_builder = match method.to_uppercase().as_str() {
            "GET" => self.http.get(&format!("{}{}", self.base_url, endpoint)),
            "POST" => self.http.post(&format!("{}{}", self.base_url, endpoint)),
            "PUT" => self.http.put(&format!("{}{}", self.base_url, endpoint)),
            "DELETE" => self.http.delete(&format!("{}{}", self.base_url, endpoint)),
            _ => {
                return Err(AppError::InvalidArgument(
                    "Unsupported HTTP method".to_string(),
                ));
            }
        };

        request_builder =
            header_utils::apply_auth_headers(request_builder, &token, &self.app_handle)?;

        if let Some(body_data) = body {
            request_builder = request_builder
                .header("Content-Type", "application/json")
                .json(&body_data);
        }

        let response = request_builder
            .send()
            .await
            .map_err(|e| AppError::NetworkError(format!("Request failed: {}", e)))?;

        if !response.status().is_success() {
            return Err(AppError::ExternalServiceError(format!(
                "Server error: {}",
                response.status()
            )));
        }

        // Don't try to parse the response body for 204 No Content
        Ok(())
    }

    /// Get current legal documents for a region
    pub async fn get_current_documents(
        &self,
        region: &str,
    ) -> Result<Vec<LegalDocument>, AppError> {
        debug!("Getting current legal documents for region: {}", region);

        let endpoint = format!("/api/consent/documents/current?region={}", region);
        let documents = self
            .make_authenticated_request("GET", &endpoint, None)
            .await?;

        info!(
            "Successfully retrieved current legal documents for region: {}",
            region
        );
        Ok(documents)
    }

    /// Get consent status for a region
    pub async fn get_status(&self, region: &str) -> Result<ConsentStatusResponse, AppError> {
        debug!("Getting consent status for region: {}", region);

        let endpoint = format!("/api/consent/status?region={}", region);
        let status = self
            .make_authenticated_request("GET", &endpoint, None)
            .await?;

        info!(
            "Successfully retrieved consent status for region: {}",
            region
        );
        Ok(status)
    }

    /// Verify consent for a region
    pub async fn verify(&self, region: &str) -> Result<ConsentVerificationResponse, AppError> {
        debug!("Verifying consent for region: {}", region);

        let endpoint = format!("/api/consent/verify?region={}", region);
        let verification = self
            .make_authenticated_request("GET", &endpoint, None)
            .await?;

        info!("Successfully verified consent for region: {}", region);
        Ok(verification)
    }

    /// Accept a consent document
    pub async fn accept(
        &self,
        doc_type: &str,
        region: &str,
        metadata: Option<serde_json::Value>,
    ) -> Result<(), AppError> {
        debug!(
            "Accepting consent document type: {} for region: {}",
            doc_type, region
        );

        let mut request_body = serde_json::json!({
            "doc_type": doc_type,
            "region": region
        });

        if let Some(metadata) = metadata {
            request_body["metadata"] = metadata;
        }

        // The server returns 204 No Content, so we need a special handling
        self.make_authenticated_request_no_response(
            "POST",
            "/api/consent/accept",
            Some(request_body),
        )
        .await?;

        info!(
            "Successfully accepted consent document type: {} for region: {}",
            doc_type, region
        );
        Ok(())
    }

    /// Get admin report for consent data
    pub async fn admin_report(
        &self,
        region: Option<&str>,
        doc_type: Option<&str>,
        from: Option<&str>,
        to: Option<&str>,
    ) -> Result<serde_json::Value, AppError> {
        debug!("Getting admin consent report");

        let mut query_params = Vec::new();

        if let Some(region) = region {
            query_params.push(format!("region={}", region));
        }
        if let Some(doc_type) = doc_type {
            query_params.push(format!("doc_type={}", doc_type));
        }
        if let Some(from) = from {
            query_params.push(format!("from={}", from));
        }
        if let Some(to) = to {
            query_params.push(format!("to={}", to));
        }

        let query_string = if query_params.is_empty() {
            String::new()
        } else {
            format!("?{}", query_params.join("&"))
        };

        let endpoint = format!("/api/consent/admin/report{}", query_string);
        let report = self
            .make_authenticated_request("GET", &endpoint, None)
            .await?;

        info!("Successfully retrieved admin consent report");
        Ok(report)
    }
}
