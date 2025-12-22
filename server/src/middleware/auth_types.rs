use uuid::Uuid;

/// Identity information for API key-authenticated requests
/// Used for rate limiting and audit logging
#[derive(Clone, Debug)]
pub struct ApiKeyIdentity {
    pub api_key_id: Uuid,
    pub label: Option<String>,
}
