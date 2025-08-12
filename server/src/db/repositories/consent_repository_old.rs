use uuid::Uuid;
use sqlx::PgPool;
use chrono::{DateTime, Utc, NaiveDate};
use std::net::IpAddr;
use ipnetwork::IpNetwork;
use serde::{Deserialize, Serialize};
use crate::error::AppError;
use crate::models::consent::{
    LegalDocument, ConsentEvent, UserConsentSnapshot, 
    ConsentDocumentType, ConsentRegion, ConsentAction, ConsentSource
};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConsentReportRow {
    pub doc_type: String,
    pub region: String,
    pub version: String,
    pub accepted_count: i64,
    pub total_count: i64,
    pub acceptance_rate: f64,
}

#[derive(Debug, Clone)]
pub struct ConsentRepository {
    db_pool: PgPool,
}

impl ConsentRepository {
    pub fn new(pool: PgPool) -> Self {
        Self { db_pool: pool }
    }

    /// Get all current legal documents for a region
    pub async fn get_current_documents_by_region(
        &self,
        region: &str,
    ) -> Result<Vec<LegalDocument>, AppError> {
        let documents = sqlx::query_as!(
            LegalDocument,
            r#"
            WITH latest_docs AS (
                SELECT DISTINCT ON (doc_type) 
                    id, 
                    doc_type::TEXT as "doc_type!: ConsentDocumentType", 
                    region::TEXT as "region!: ConsentRegion", 
                    version, 
                    effective_at, 
                    url, 
                    content_hash, 
                    material_change, 
                    created_at, 
                    updated_at
                FROM legal_documents 
                WHERE region = $1 
                    AND effective_at <= CURRENT_DATE
                ORDER BY doc_type, effective_at DESC
            )
            SELECT 
                id,
                doc_type as "doc_type!: ConsentDocumentType",
                region as "region!: ConsentRegion",
                version,
                effective_at,
                url,
                content_hash,
                material_change,
                created_at,
                updated_at
            FROM latest_docs
            ORDER BY doc_type
            "#,
            region
        )
        .fetch_all(&self.db_pool)
        .await
        .map_err(|e| AppError::Database(format!("Failed to get current documents by region: {}", e)))?;

        Ok(documents)
    }

    /// Get current legal document by type and region
    pub async fn get_current_document(
        &self,
        doc_type: &str,
        region: &str,
    ) -> Result<Option<LegalDocument>, AppError> {
        let document = sqlx::query_as!(
            LegalDocument,
            r#"
            SELECT 
                id, 
                doc_type::TEXT as "doc_type!: ConsentDocumentType", 
                region::TEXT as "region!: ConsentRegion", 
                version, 
                effective_at, 
                url, 
                content_hash, 
                material_change, 
                created_at, 
                updated_at
            FROM legal_documents 
            WHERE doc_type = $1 
                AND region = $2 
                AND effective_at <= CURRENT_DATE
            ORDER BY effective_at DESC
            LIMIT 1
            "#,
            doc_type,
            region
        )
        .fetch_optional(&self.db_pool)
        .await
        .map_err(|e| AppError::Database(format!("Failed to get current document: {}", e)))?;

        Ok(document)
    }

    /// Insert a consent event
    pub async fn insert_event(
        &self,
        user_id: Uuid,
        doc_type: &str,
        region: &str,
        version: String,
        action: &str,
        source: &str,
        ip_address: Option<IpAddr>,
        user_agent: Option<String>,
        metadata: Option<serde_json::Value>,
    ) -> Result<ConsentEvent, AppError> {
        let id = Uuid::new_v4();
        let created_at = Utc::now();
        let ip_network = ip_address.map(|ip| {
            let ip_str = ip.to_string();
            ip_str.parse::<IpNetwork>().unwrap_or_else(|_| {
                // If parsing fails, create a single host network
                match ip {
                    IpAddr::V4(v4) => IpNetwork::V4(v4.into()),
                    IpAddr::V6(v6) => IpNetwork::V6(v6.into()),
                }
            })
        });
        
        // We need to insert as strings and then query back as enums
        sqlx::query!(
            r#"
            INSERT INTO user_consent_events 
            (id, user_id, doc_type, region, version, action, source, 
             ip_address, user_agent, metadata, created_at)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
            "#,
            id,
            user_id,
            doc_type,
            region,
            version,
            action,
            source,
            ip_network as _,
            user_agent,
            metadata,
            created_at
        )
        .execute(&self.db_pool)
        .await
        .map_err(|e| AppError::Database(format!("Failed to insert consent event: {}", e)))?;

        // Query back the inserted event with proper type mapping
        let event = sqlx::query_as!(
            ConsentEvent,
            r#"
            SELECT 
                id,
                user_id,
                doc_type::TEXT as "doc_type!: ConsentDocumentType",
                region::TEXT as "region!: ConsentRegion",
                version,
                action::TEXT as "action!: ConsentAction",
                source::TEXT as "source!: ConsentSource",
                ip_address,
                user_agent,
                metadata,
                created_at
            FROM user_consent_events
            WHERE id = $1
            "#,
            id
        )
        .fetch_one(&self.db_pool)
        .await
        .map_err(|e| AppError::Database(format!("Failed to fetch inserted consent event: {}", e)))?;

        Ok(event)
    }

    /// Upsert user consent snapshot
    pub async fn upsert_user_consent(
        &self,
        user_id: Uuid,
        doc_type: &str,
        region: &str,
        accepted_version: String,
        accepted_at: DateTime<Utc>,
        source: &str,
        metadata: Option<serde_json::Value>,
    ) -> Result<UserConsentSnapshot, AppError> {
        // First perform the upsert
        sqlx::query!(
            r#"
            INSERT INTO user_consents 
            (user_id, doc_type, region, accepted_version, accepted_at, source, metadata)
            VALUES ($1, $2, $3, $4, $5, $6, $7)
            ON CONFLICT (user_id, doc_type, region) DO UPDATE SET
                accepted_version = EXCLUDED.accepted_version,
                accepted_at = EXCLUDED.accepted_at,
                source = EXCLUDED.source,
                metadata = EXCLUDED.metadata
            "#,
            user_id,
            doc_type,
            region,
            accepted_version,
            accepted_at,
            source,
            metadata
        )
        .execute(&self.db_pool)
        .await
        .map_err(|e| AppError::Database(format!("Failed to upsert user consent: {}", e)))?;

        // Query back the upserted record with proper type mapping
        let snapshot = sqlx::query_as!(
            UserConsentSnapshot,
            r#"
            SELECT 
                id,
                user_id,
                doc_type::TEXT as "doc_type!: ConsentDocumentType",
                region::TEXT as "region!: ConsentRegion",
                accepted_version,
                accepted_at,
                source::TEXT as "source?: ConsentSource",
                metadata
            FROM user_consents
            WHERE user_id = $1 AND doc_type = $2 AND region = $3
            "#,
            user_id,
            doc_type,
            region
        )
        .fetch_one(&self.db_pool)
        .await
        .map_err(|e| AppError::Database(format!("Failed to fetch upserted consent: {}", e)))?;

        Ok(snapshot)
    }

    /// Get user consent snapshots by region
    pub async fn get_user_snapshots_by_region(
        &self,
        user_id: Uuid,
        region: &str,
    ) -> Result<Vec<UserConsentSnapshot>, AppError> {
        let snapshots = sqlx::query_as!(
            UserConsentSnapshot,
            r#"
            SELECT 
                id,
                user_id,
                doc_type::TEXT as "doc_type!: ConsentDocumentType",
                region::TEXT as "region!: ConsentRegion",
                accepted_version,
                accepted_at,
                source::TEXT as "source?: ConsentSource",
                metadata
            FROM user_consents
            WHERE user_id = $1 AND region = $2
            "#,
            user_id,
            region
        )
        .fetch_all(&self.db_pool)
        .await
        .map_err(|e| AppError::Database(format!("Failed to get user snapshots: {}", e)))?;

        Ok(snapshots)
    }

    /// Get user consent events
    pub async fn get_user_events(
        &self,
        user_id: Uuid,
        region: Option<&str>,
        doc_type: Option<&str>,
        limit: i64,
        offset: i64,
    ) -> Result<Vec<ConsentEvent>, AppError> {
        // For dynamic queries with optional filters, we still need to use runtime queries
        // but we can use typed structs for the results
        let events = match (region, doc_type) {
            (Some(r), Some(dt)) => {
                sqlx::query_as!(
                    ConsentEvent,
                    r#"
                    SELECT 
                        id,
                        user_id,
                        doc_type as "doc_type: ConsentDocumentType",
                        region as "region: ConsentRegion",
                        version,
                        action as "action: ConsentAction",
                        source as "source: ConsentSource",
                        ip_address as "ip_address: std::net::IpAddr",
                        user_agent,
                        metadata,
                        created_at
                    FROM user_consent_events 
                    WHERE user_id = $1 AND region = $2 AND doc_type = $3
                    ORDER BY created_at DESC 
                    LIMIT $4 OFFSET $5
                    "#,
                    user_id,
                    r,
                    dt,
                    limit,
                    offset
                )
                .fetch_all(&self.db_pool)
                .await
            },
            (Some(r), None) => {
                sqlx::query_as!(
                    ConsentEvent,
                    r#"
                    SELECT 
                        id,
                        user_id,
                        doc_type as "doc_type: ConsentDocumentType",
                        region as "region: ConsentRegion",
                        version,
                        action as "action: ConsentAction",
                        source as "source: ConsentSource",
                        ip_address as "ip_address: std::net::IpAddr",
                        user_agent,
                        metadata,
                        created_at
                    FROM user_consent_events 
                    WHERE user_id = $1 AND region = $2
                    ORDER BY created_at DESC 
                    LIMIT $3 OFFSET $4
                    "#,
                    user_id,
                    r,
                    limit,
                    offset
                )
                .fetch_all(&self.db_pool)
                .await
            },
            (None, Some(dt)) => {
                sqlx::query_as!(
                    ConsentEvent,
                    r#"
                    SELECT 
                        id,
                        user_id,
                        doc_type as "doc_type: ConsentDocumentType",
                        region as "region: ConsentRegion",
                        version,
                        action as "action: ConsentAction",
                        source as "source: ConsentSource",
                        ip_address as "ip_address: std::net::IpAddr",
                        user_agent,
                        metadata,
                        created_at
                    FROM user_consent_events 
                    WHERE user_id = $1 AND doc_type = $2
                    ORDER BY created_at DESC 
                    LIMIT $3 OFFSET $4
                    "#,
                    user_id,
                    dt,
                    limit,
                    offset
                )
                .fetch_all(&self.db_pool)
                .await
            },
            (None, None) => {
                sqlx::query_as!(
                    ConsentEvent,
                    r#"
                    SELECT 
                        id,
                        user_id,
                        doc_type as "doc_type: ConsentDocumentType",
                        region as "region: ConsentRegion",
                        version,
                        action as "action: ConsentAction",
                        source as "source: ConsentSource",
                        ip_address as "ip_address: std::net::IpAddr",
                        user_agent,
                        metadata,
                        created_at
                    FROM user_consent_events 
                    WHERE user_id = $1
                    ORDER BY created_at DESC 
                    LIMIT $2 OFFSET $3
                    "#,
                    user_id,
                    limit,
                    offset
                )
                .fetch_all(&self.db_pool)
                .await
            }
        }
        .map_err(|e| AppError::Database(format!("Failed to get user events: {}", e)))?;

        Ok(events)
    }

    /// Generate consent report summary
    pub async fn report_summary(
        &self,
        region: Option<&str>,
        doc_type: Option<&str>,
        from: Option<DateTime<Utc>>,
        to: Option<DateTime<Utc>>,
    ) -> Result<Vec<ConsentReportRow>, AppError> {
        // For complex dynamic queries, we need to build them conditionally
        let report_rows = match (region, doc_type, from, to) {
            (None, None, None, None) => {
                sqlx::query_as!(
                    ConsentReportRow,
                    r#"
                    SELECT 
                        uc.doc_type,
                        uc.region,
                        uc.accepted_version as version,
                        COUNT(DISTINCT uc.user_id) as accepted_count,
                        (SELECT COUNT(DISTINCT user_id) FROM user_consents 
                         WHERE doc_type = uc.doc_type AND region = uc.region) as total_count,
                        CASE 
                            WHEN (SELECT COUNT(DISTINCT user_id) FROM user_consents 
                                  WHERE doc_type = uc.doc_type AND region = uc.region) > 0
                            THEN COUNT(DISTINCT uc.user_id)::float8 / 
                                 (SELECT COUNT(DISTINCT user_id) FROM user_consents 
                                  WHERE doc_type = uc.doc_type AND region = uc.region)::float8
                            ELSE 0.0
                        END as acceptance_rate
                    FROM user_consents uc
                    WHERE uc.accepted_version IS NOT NULL
                    GROUP BY uc.doc_type, uc.region, uc.accepted_version
                    ORDER BY uc.region, uc.doc_type
                    "#
                )
                .fetch_all(&self.db_pool)
                .await
            },
            (Some(r), None, None, None) => {
                sqlx::query_as!(
                    ConsentReportRow,
                    r#"
                    SELECT 
                        uc.doc_type,
                        uc.region,
                        uc.accepted_version as version,
                        COUNT(DISTINCT uc.user_id) as accepted_count,
                        (SELECT COUNT(DISTINCT user_id) FROM user_consents 
                         WHERE doc_type = uc.doc_type AND region = uc.region) as total_count,
                        CASE 
                            WHEN (SELECT COUNT(DISTINCT user_id) FROM user_consents 
                                  WHERE doc_type = uc.doc_type AND region = uc.region) > 0
                            THEN COUNT(DISTINCT uc.user_id)::float8 / 
                                 (SELECT COUNT(DISTINCT user_id) FROM user_consents 
                                  WHERE doc_type = uc.doc_type AND region = uc.region)::float8
                            ELSE 0.0
                        END as acceptance_rate
                    FROM user_consents uc
                    WHERE uc.accepted_version IS NOT NULL AND uc.region = $1
                    GROUP BY uc.doc_type, uc.region, uc.accepted_version
                    ORDER BY uc.region, uc.doc_type
                    "#,
                    r
                )
                .fetch_all(&self.db_pool)
                .await
            },
            (Some(r), Some(dt), None, None) => {
                sqlx::query_as!(
                    ConsentReportRow,
                    r#"
                    SELECT 
                        uc.doc_type,
                        uc.region,
                        uc.accepted_version as version,
                        COUNT(DISTINCT uc.user_id) as accepted_count,
                        (SELECT COUNT(DISTINCT user_id) FROM user_consents 
                         WHERE doc_type = uc.doc_type AND region = uc.region) as total_count,
                        CASE 
                            WHEN (SELECT COUNT(DISTINCT user_id) FROM user_consents 
                                  WHERE doc_type = uc.doc_type AND region = uc.region) > 0
                            THEN COUNT(DISTINCT uc.user_id)::float8 / 
                                 (SELECT COUNT(DISTINCT user_id) FROM user_consents 
                                  WHERE doc_type = uc.doc_type AND region = uc.region)::float8
                            ELSE 0.0
                        END as acceptance_rate
                    FROM user_consents uc
                    WHERE uc.accepted_version IS NOT NULL 
                        AND uc.region = $1 
                        AND uc.doc_type = $2
                    GROUP BY uc.doc_type, uc.region, uc.accepted_version
                    ORDER BY uc.region, uc.doc_type
                    "#,
                    r,
                    dt
                )
                .fetch_all(&self.db_pool)
                .await
            },
            _ => {
                // For more complex combinations with date filters, we would need additional cases
                // For now, fallback to the simple case
                sqlx::query_as!(
                    ConsentReportRow,
                    r#"
                    SELECT 
                        uc.doc_type,
                        uc.region,
                        uc.accepted_version as version,
                        COUNT(DISTINCT uc.user_id) as accepted_count,
                        (SELECT COUNT(DISTINCT user_id) FROM user_consents 
                         WHERE doc_type = uc.doc_type AND region = uc.region) as total_count,
                        CASE 
                            WHEN (SELECT COUNT(DISTINCT user_id) FROM user_consents 
                                  WHERE doc_type = uc.doc_type AND region = uc.region) > 0
                            THEN COUNT(DISTINCT uc.user_id)::float8 / 
                                 (SELECT COUNT(DISTINCT user_id) FROM user_consents 
                                  WHERE doc_type = uc.doc_type AND region = uc.region)::float8
                            ELSE 0.0
                        END as acceptance_rate
                    FROM user_consents uc
                    WHERE uc.accepted_version IS NOT NULL
                    GROUP BY uc.doc_type, uc.region, uc.accepted_version
                    ORDER BY uc.region, uc.doc_type
                    "#
                )
                .fetch_all(&self.db_pool)
                .await
            }
        }
        .map_err(|e| AppError::Database(format!("Failed to generate report: {}", e)))?;

        Ok(report_rows)
    }
}