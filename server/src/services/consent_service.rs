use crate::error::AppError;
use crate::models::{
    ConsentRegion, ConsentDocumentType, ConsentAction, ConsentSource,
    LegalDocument, ConsentEvent, ConsentStatusResponse, ConsentStatusItem,
    ConsentVerificationResponse, UserConsentSnapshot, AcceptConsentRequest
};
use crate::db::repositories::consent_repository::{ConsentRepository, ConsentReportRow};
use crate::services::audit_service::{AuditService, AuditContext, AuditEvent};
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use serde_json::json;
use std::collections::HashMap;
use std::net::IpAddr;
use std::sync::Arc;
use uuid::Uuid;
use log::{info, warn, error, debug};
use sqlx::types::ipnetwork::IpNetwork;
use std::str::FromStr;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConsentReportEntry {
    pub user_id: Uuid,
    pub email: Option<String>,
    pub doc_type: ConsentDocumentType,
    pub region: ConsentRegion,
    pub version: String,
    pub action: ConsentAction,
    pub source: ConsentSource,
    pub ip_address: Option<IpAddr>,
    pub user_agent: Option<String>,
    pub created_at: DateTime<Utc>,
    pub metadata: Option<serde_json::Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConsentReport {
    pub entries: Vec<ConsentReportEntry>,
    pub total_count: i64,
    pub filters_applied: HashMap<String, String>,
}

#[derive(Debug, Clone)]
pub struct ConsentService {
    consent_repository: Arc<ConsentRepository>,
    audit_service: Arc<AuditService>,
}

impl ConsentService {
    pub fn new(consent_repository: Arc<ConsentRepository>, audit_service: Arc<AuditService>) -> Self {
        Self { 
            consent_repository,
            audit_service,
        }
    }

    /// Get current legal documents for a region
    pub async fn get_current_legal_documents(
        &self,
        region: &ConsentRegion,
    ) -> Result<Vec<LegalDocument>, AppError> {
        let region_str = match region {
            ConsentRegion::Eu => "eu",
            ConsentRegion::Us => "us",
        };
        
        debug!("Getting current legal documents for region: {}", region_str);
        let documents = self.consent_repository.get_current_documents_by_region(region_str).await?;
        info!("Retrieved {} current legal documents for region: {}", documents.len(), region_str);
        
        Ok(documents)
    }

    /// Get user's consent status for a region
    pub async fn get_consent_status(
        &self,
        user_id: &Uuid,
        region: &ConsentRegion,
    ) -> Result<ConsentStatusResponse, AppError> {
        debug!("Getting consent status for user {} in region {:?}", user_id, region);
        
        let current_docs = self.get_current_legal_documents(region).await?;
        
        let region_str = match region {
            ConsentRegion::Eu => "eu",
            ConsentRegion::Us => "us",
        };
        
        // Get user's accepted versions
        let user_snapshots = self.consent_repository
            .get_user_snapshots_by_region(*user_id, region_str)
            .await?;
        
        // Map user consents by doc_type
        let mut consent_map = HashMap::new();
        for snapshot in user_snapshots {
            consent_map.insert(
                snapshot.doc_type.clone(),
                (snapshot.accepted_version, snapshot.accepted_at, snapshot.source)
            );
        }
        
        // Build status items
        let mut items = Vec::new();
        let mut all_consented = true;
        
        for doc in current_docs {
            let (accepted_version, accepted_at, _source) = consent_map
                .get(&doc.doc_type)
                .cloned()
                .unwrap_or((None, None, None));
            
            let requires_reconsent = accepted_version.as_ref() != Some(&doc.version);
            if requires_reconsent {
                all_consented = false;
            }
            
            items.push(ConsentStatusItem {
                doc_type: doc.doc_type,
                region: doc.region,
                current_version: doc.version,
                accepted_version,
                accepted_at,
                requires_reconsent,
                effective_at: doc.effective_at,
                url: doc.url,
            });
        }
        
        Ok(ConsentStatusResponse {
            user_id: *user_id,
            region: region.clone(),
            items,
            all_consented,
        })
    }

    /// Verify if user needs to provide consent
    pub async fn verify_consent(
        &self,
        user_id: &Uuid,
        region: &ConsentRegion,
    ) -> Result<ConsentVerificationResponse, AppError> {
        debug!("Verifying consent for user {} in region {:?}", user_id, region);
        
        let status = self.get_consent_status(user_id, region).await?;
        
        let mut missing = Vec::new();
        for item in &status.items {
            if item.requires_reconsent {
                let doc_type_str = match item.doc_type {
                    ConsentDocumentType::Terms => "terms",
                    ConsentDocumentType::Privacy => "privacy",
                };
                missing.push(doc_type_str.to_string());
            }
        }
        
        Ok(ConsentVerificationResponse {
            requires_reconsent: !status.all_consented,
            missing,
            details: status.items,
        })
    }

    /// Accept current version of a legal document
    pub async fn accept_current(
        &self,
        user_id: &Uuid,
        doc_type: &ConsentDocumentType,
        region: &ConsentRegion,
        source: ConsentSource,
        ip_address: Option<IpAddr>,
        user_agent: Option<String>,
        metadata: Option<serde_json::Value>,
    ) -> Result<(), AppError> {
        info!("User {} accepting current {:?} for region {:?}", user_id, doc_type, region);
        
        let doc_type_str = match doc_type {
            ConsentDocumentType::Terms => "terms",
            ConsentDocumentType::Privacy => "privacy",
        };
        
        let region_str = match region {
            ConsentRegion::Eu => "eu",
            ConsentRegion::Us => "us",
        };
        
        let source_str = match source {
            ConsentSource::Desktop => "desktop",
            ConsentSource::Website => "website",
            ConsentSource::Api => "api",
        };
        
        // Get the current document to get its version
        let current_doc = self.consent_repository
            .get_current_document(doc_type_str, region_str)
            .await?
            .ok_or_else(|| AppError::NotFound(format!(
                "No current legal document found for {} in {}", doc_type_str, region_str
            )))?;
        
        // Insert consent event
        let event = self.consent_repository.insert_event(
            *user_id,
            doc_type_str,
            region_str,
            current_doc.version.clone(),
            "accepted",
            source_str,
            ip_address,
            user_agent.clone(),
            metadata.clone(),
        ).await?;
        
        // Update user consent snapshot
        self.consent_repository.upsert_user_consent(
            *user_id,
            doc_type_str,
            region_str,
            Some(current_doc.version.clone()),
            Some(Utc::now()),
            Some(source_str),
            metadata.clone(),
        ).await?;
        
        // Create audit context
        let mut audit_context = AuditContext::new(*user_id);
        
        // Convert IP address if provided
        if let Some(ip) = ip_address {
            if let Ok(ip_network) = IpNetwork::from_str(&ip.to_string()) {
                audit_context = audit_context.with_ip_address(ip_network);
            }
        }
        
        if let Some(ua) = user_agent {
            audit_context = audit_context.with_user_agent(ua);
        }
        
        // Log audit event
        let audit_metadata = json!({
            "doc_type": doc_type_str,
            "region": region_str,
            "version": current_doc.version,
            "url": current_doc.url,
            "content_hash": current_doc.content_hash,
            "event_id": event.id,
        });
        
        let audit_event = AuditEvent {
            action_type: "consent_accepted".to_string(),
            entity_type: "legal_document".to_string(),
            entity_id: Some(format!("{}:{}", doc_type_str, region_str)),
            old_values: None,
            new_values: Some(audit_metadata.clone()),
            metadata: Some(audit_metadata),
            performed_by: user_id.to_string(),
            status: Some("success".to_string()),
            error_message: None,
        };
        
        self.audit_service.log_event(&audit_context, audit_event).await?;
        
        info!("Successfully recorded consent acceptance for user {} - {:?} in {:?}", 
              user_id, doc_type, region);
        
        Ok(())
    }

    /// Generate consent report for admin users
    pub async fn generate_consent_report(
        &self,
        region: Option<&str>,
        doc_type: Option<&str>,
        _from: Option<DateTime<Utc>>,
        _to: Option<DateTime<Utc>>,
    ) -> Result<Vec<ConsentReportRow>, AppError> {
        debug!("Generating consent report with filters - region: {:?}, doc_type: {:?}",
               region, doc_type);
        
        // Determine report type based on filters
        let report_type = match (region, doc_type) {
            (Some(_), None) => "by_region",
            (None, Some(_)) => "by_type",
            _ => "by_document",
        };
        
        self.consent_repository.get_consent_report(report_type, region, doc_type).await
    }

    /// Format report as CSV
    pub fn format_report_as_csv(&self, report: &[ConsentReportRow]) -> String {
        let mut csv = String::from("Region,Document Type,Version,Accepted Count,Total Count,Acceptance Rate\n");
        
        for row in report {
            // Convert BigDecimal to f64 for display
            let rate = row.acceptance_rate
                .as_ref()
                .and_then(|bd| bd.to_string().parse::<f64>().ok())
                .unwrap_or(0.0);
            
            csv.push_str(&format!(
                "{},{},{},{},{},{:.2}%\n",
                row.region.as_deref().unwrap_or(""),
                row.doc_type.as_deref().unwrap_or(""),
                row.version.as_deref().unwrap_or(""),
                row.accepted_count.unwrap_or(0),
                row.total_count.unwrap_or(0),
                rate * 100.0
            ));
        }
        
        csv
    }
}