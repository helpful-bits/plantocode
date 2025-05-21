use log::{debug, error, info};
use reqwest::Client;
use serde::{Deserialize, Serialize};
use crate::error::AppError;

/// Firebase token claims structure
#[derive(Debug, Deserialize, Serialize, Clone)]
pub struct FirebaseTokenClaims {
    pub sub: String,           // Subject (Firebase UID)
    pub email: String,
    pub email_verified: bool,
    pub name: Option<String>,
    pub auth_time: u64,        // Authentication time
    pub iat: u64,              // Issued at
    pub exp: u64,              // Expiration time
    pub firebase: FirebaseData,
}

#[derive(Debug, Deserialize, Serialize, Clone)]
pub struct FirebaseData {
    pub identities: Option<serde_json::Value>,
    pub sign_in_provider: String,
}

/// Firebase token verifier with HTTP client
pub struct FirebaseTokenVerifier {
    client: Client,
    project_id: String,
    api_key: String,
}

// Verification response from Firebase API
#[derive(Debug, Deserialize)]
struct VerifyTokenResponse {
    users: Vec<FirebaseUserInfo>,
}

#[derive(Debug, Deserialize)]
struct FirebaseUserInfo {
    localId: String,
    email: String,
    emailVerified: bool,
    displayName: Option<String>,
    providerUserInfo: Vec<ProviderInfo>,
}

#[derive(Debug, Deserialize)]
struct ProviderInfo {
    providerId: String,
}

impl FirebaseTokenVerifier {
    /// Create a new Firebase token verifier
    pub fn new(project_id: &str) -> Self {
        info!("Initialized Firebase token verifier with project ID: {}", project_id);
        
        // Get API key from environment variable
        let api_key = std::env::var("FIREBASE_API_KEY")
            .unwrap_or_else(|_| String::from(""));
        
        Self {
            client: Client::new(),
            project_id: project_id.to_string(),
            api_key,
        }
    }
    
    /// Verify a Firebase ID token and return the claims
    pub async fn verify(&self, id_token: &str) -> Result<FirebaseTokenClaims, AppError> {
        debug!("Verifying Firebase ID token");
        
        let url = format!(
            "https://identitytoolkit.googleapis.com/v1/accounts:lookup?key={}",
            self.api_key
        );
        
        let response = self.client.post(&url)
            .json(&serde_json::json!({
                "idToken": id_token
            }))
            .send()
            .await
            .map_err(|e| AppError::Auth(format!("Failed to verify token: {}", e)))?;
        
        if !response.status().is_success() {
            let status = response.status();
            let text = response.text().await.unwrap_or_default();
            error!("Firebase API error: {} - {}", status, text);
            return Err(AppError::Auth(format!("Invalid token: HTTP {}", status)));
        }
        
        let verify_response: VerifyTokenResponse = response.json()
            .await
            .map_err(|e| AppError::Auth(format!("Failed to parse verification response: {}", e)))?;
        
        if verify_response.users.is_empty() {
            return Err(AppError::Auth("User not found for token".to_string()));
        }
        
        let user = &verify_response.users[0];
        let provider_id = user.providerUserInfo
            .first()
            .map(|p| p.providerId.clone())
            .unwrap_or_else(|| "password".to_string());
        
        // Extract JWT claims from token (we'll use basic info, not decoded claims)
        let claims = FirebaseTokenClaims {
            sub: user.localId.clone(),
            email: user.email.clone(),
            email_verified: user.emailVerified,
            name: user.displayName.clone(),
            auth_time: 0, // Not available from this API
            iat: 0,       // Not available from this API
            exp: 0,       // Not available from this API
            firebase: FirebaseData {
                identities: None,
                sign_in_provider: provider_id,
            },
        };
        
        Ok(claims)
    }
}