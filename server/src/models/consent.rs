use chrono::{DateTime, NaiveDate, Utc};
use serde::{Deserialize, Serialize};
use sqlx::Type;
use sqlx::types::ipnetwork::IpNetwork; // Use sqlx's IpNetwork type
use std::net::IpAddr;
use std::str::FromStr;
use uuid::Uuid;

// Custom serialization for IpNetwork
mod ip_serde {
    use super::*;
    use serde::{Deserializer, Serializer};

    pub fn serialize<S>(value: &Option<IpNetwork>, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        match value {
            Some(ip) => serializer.serialize_str(&ip.to_string()),
            None => serializer.serialize_none(),
        }
    }

    pub fn deserialize<'de, D>(deserializer: D) -> Result<Option<IpNetwork>, D::Error>
    where
        D: Deserializer<'de>,
    {
        let s: Option<String> = Option::deserialize(deserializer)?;
        match s {
            Some(s) => s
                .parse::<IpNetwork>()
                .map(Some)
                .map_err(serde::de::Error::custom),
            None => Ok(None),
        }
    }
}

// Enums with sqlx support
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Hash, Type)]
#[serde(rename_all = "lowercase")]
#[sqlx(type_name = "text")]
pub enum ConsentDocumentType {
    #[sqlx(rename = "terms")]
    Terms,
    #[sqlx(rename = "privacy")]
    Privacy,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Hash, Type)]
#[serde(rename_all = "lowercase")]
#[sqlx(type_name = "text")]
pub enum ConsentRegion {
    #[sqlx(rename = "eu")]
    Eu,
    #[sqlx(rename = "us")]
    Us,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Type)]
#[serde(rename_all = "lowercase")]
#[sqlx(type_name = "text")]
pub enum ConsentAction {
    #[sqlx(rename = "accepted")]
    Accepted,
    #[sqlx(rename = "withdrawn")]
    Withdrawn,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Type)]
#[serde(rename_all = "lowercase")]
#[sqlx(type_name = "text")]
pub enum ConsentSource {
    #[sqlx(rename = "desktop")]
    Desktop,
    #[sqlx(rename = "website")]
    Website,
    #[sqlx(rename = "api")]
    Api,
}

// Core Models
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LegalDocument {
    pub id: Uuid,
    pub doc_type: ConsentDocumentType,
    pub region: ConsentRegion,
    pub version: String,
    pub effective_at: NaiveDate, // Changed from DateTime<Utc> to match DB DATE type
    pub url: String,
    pub content_hash: Option<String>,
    pub material_change: bool,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConsentEvent {
    pub id: Uuid,
    pub user_id: Uuid,
    pub doc_type: ConsentDocumentType,
    pub region: ConsentRegion,
    pub version: String,
    pub action: ConsentAction,
    pub source: ConsentSource,
    #[serde(with = "ip_serde")]
    pub ip_address: Option<IpNetwork>, // Changed to IpNetwork for PostgreSQL inet type
    pub user_agent: Option<String>,
    pub metadata: Option<serde_json::Value>,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UserConsentSnapshot {
    pub id: Uuid,
    pub user_id: Uuid,
    pub doc_type: ConsentDocumentType,
    pub region: ConsentRegion,
    pub accepted_version: Option<String>,   // Nullable in DB
    pub accepted_at: Option<DateTime<Utc>>, // Nullable in DB
    pub source: Option<ConsentSource>,      // Nullable in DB
    pub metadata: Option<serde_json::Value>,
}

// DTOs
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConsentStatusItem {
    pub doc_type: ConsentDocumentType,
    pub region: ConsentRegion,
    pub current_version: String,
    pub accepted_version: Option<String>,
    pub accepted_at: Option<DateTime<Utc>>,
    pub requires_reconsent: bool,
    pub effective_at: NaiveDate, // Changed to match DB DATE type
    pub url: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConsentStatusResponse {
    pub user_id: Uuid,
    pub region: ConsentRegion,
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

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AcceptConsentRequest {
    pub doc_type: String,
    pub region: String,
    pub metadata: Option<serde_json::Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WithdrawConsentRequest {
    pub doc_type: String,
    pub region: String,
    pub metadata: Option<serde_json::Value>,
}

// FromStr implementations for parsing strings
impl FromStr for ConsentDocumentType {
    type Err = String;

    fn from_str(s: &str) -> Result<Self, Self::Err> {
        match s.to_lowercase().as_str() {
            "terms" => Ok(ConsentDocumentType::Terms),
            "privacy" => Ok(ConsentDocumentType::Privacy),
            _ => Err(format!("Invalid document type: {}", s)),
        }
    }
}

impl FromStr for ConsentRegion {
    type Err = String;

    fn from_str(s: &str) -> Result<Self, Self::Err> {
        match s.to_lowercase().as_str() {
            "eu" => Ok(ConsentRegion::Eu),
            "us" => Ok(ConsentRegion::Us),
            _ => Err(format!("Invalid region: {}", s)),
        }
    }
}
