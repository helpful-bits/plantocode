use crate::config::settings::AppSettings;
use crate::db::repositories::user_repository::UserRepository;
use crate::error::AppError;
use crate::models::auth_jwt_claims::Claims;
use crate::services::auth::jwt;
use crate::services::auth::firebase_token_verifier::{FirebaseTokenVerifier, FirebaseTokenClaims};
use reqwest::Client;
use serde::{Deserialize, Serialize};
use sqlx::PgPool;
use uuid::Uuid;
use std::sync::Arc;
use log::{debug, error, info};

// Firebase Auth response structure
#[derive(Debug, Deserialize)]
pub struct FirebaseAuthResponse {
    pub kind: String,
    pub local_id: String,
    pub email: String,
    pub display_name: Option<String>,
    pub id_token: String,
    pub refresh_token: String,
    pub expires_in: String,
    pub provider_id: Option<String>,
}

// OAuth Token verification response
#[derive(Debug, Deserialize)]
pub struct TokenVerificationResponse {
    pub iss: String,
    pub aud: String,
    pub auth_time: u64,
    pub user_id: String,
    pub sub: String,
    pub iat: u64,
    pub exp: u64,
    pub email: String,
    pub email_verified: bool,
    pub firebase: FirebaseData,
    pub name: Option<String>,
    pub picture: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct FirebaseData {
    pub identities: FirebaseIdentities,
    pub sign_in_provider: String,
}

#[derive(Debug, Deserialize)]
pub struct FirebaseIdentities {
    #[serde(default)]
    pub email: Vec<String>,
    #[serde(default)]
    pub google: Option<Vec<String>>,
    #[serde(default)]
    pub github: Option<Vec<String>>,
    #[serde(default)]
    pub apple: Option<Vec<String>>,
    #[serde(default)]
    pub microsoft: Option<Vec<String>>,
}

// Request structure for verifying Firebase ID token
#[derive(Debug, Serialize)]
pub struct VerifyTokenRequest {
    pub id_token: String,
}

// Response for token exchange
#[derive(Debug, Serialize)]
pub struct TokenExchangeResponse {
    pub access_token: String,
    pub token_type: String,
    pub expires_in: i64,
}

// Full auth details response including user information
#[derive(Debug, Serialize)]
pub struct FullAuthDetailsResponse {
    pub access_token: String,
    pub token_type: String,
    pub expires_in: i64,
    pub user_id: String,
    pub email: String,
    pub name: Option<String>,
    pub role: String,
}

pub struct FirebaseOAuthService {
    client: Client,
    api_key: String,
    project_id: String,
    db_pool: PgPool,
    token_verifier: Arc<FirebaseTokenVerifier>,
}

impl FirebaseOAuthService {
    pub fn new(settings: &AppSettings, db_pool: PgPool) -> Self {
        // Create the token verifier with the project ID
        let token_verifier = Arc::new(
            FirebaseTokenVerifier::new(&settings.api_keys.firebase_project_id)
        );
        
        Self {
            client: Client::new(),
            api_key: settings.api_keys.firebase_api_key.clone(),
            project_id: settings.api_keys.firebase_project_id.clone(),
            db_pool,
            token_verifier,
        }
    }
    
    // Verify Firebase ID token and return user information - uses offline verification
    pub async fn verify_id_token(&self, id_token: &str) -> Result<TokenVerificationResponse, AppError> {
        info!("Verifying Firebase ID token using offline verification");
        
        // Verify the token using the FirebaseTokenVerifier
        let claims = self.token_verifier.verify(id_token).await?;
        
        // Convert to TokenVerificationResponse format
        let response = TokenVerificationResponse {
            iss: format!("https://securetoken.google.com/{}", self.project_id),
            aud: self.project_id.clone(),
            auth_time: claims.auth_time,
            user_id: claims.sub.clone(),
            sub: claims.sub,
            iat: claims.iat,
            exp: claims.exp,
            email: claims.email,
            email_verified: claims.email_verified,
            firebase: self::FirebaseData {
                identities: FirebaseIdentities { 
                    email: Vec::new(),
                    google: None,
                    github: None,
                    apple: None,
                    microsoft: None,
                },
                sign_in_provider: claims.firebase.sign_in_provider,
            },
            name: claims.name,
            picture: None,
        };
        
        debug!("Successfully verified Firebase ID token");
        Ok(response)
    }
    
    // Generate a JWT token based on Firebase user info
    pub async fn generate_token_from_firebase(&self, firebase_token: &str) -> Result<FullAuthDetailsResponse, AppError> {
        // Verify the Firebase token
        let user_info = self.verify_id_token(firebase_token).await?;
        
        // Extract user details
        let firebase_uid = user_info.user_id.clone();
        let provider = user_info.firebase.sign_in_provider.clone();
        let email = user_info.email.clone();
        let name = user_info.name.clone();
        
        // Create user repository
        let user_repo = UserRepository::new(self.db_pool.clone());
        
        // Check if user already exists by Firebase UID
        let user = match user_repo.get_by_firebase_uid(&firebase_uid).await {
            Ok(existing_user) => {
                info!("Found existing user with Firebase UID: {}", firebase_uid);
                existing_user
            },
            Err(AppError::NotFound(_)) => {
                // User not found, create a new one
                info!("Creating new user with Firebase UID: {}", firebase_uid);
                
                let user_id = user_repo.create(
                    &email,
                    None, // No password for OAuth users
                    name.as_deref(),
                    Some(&firebase_uid),
                    Some("user"), // Default role
                ).await?;
                
                // Get the newly created user
                user_repo.get_by_id(&user_id).await?
            },
            Err(e) => {
                error!("Error checking for existing user: {}", e);
                return Err(e);
            }
        };
        
        info!("Authenticated user {} (ID: {}) via {} provider", email, user.id, provider);
        
        // Extract client ID from request headers if available
        // This is for token binding security
        let client_id_header = match reqwest::header::HeaderMap::new().get("X-Client-ID") {
            Some(header) => header.to_str().ok().map(|s| s.to_string()),
            None => None,
        };
        
        // Generate JWT token with client binding if available
        let token = if let Some(client_id) = &client_id_header {
            debug!("Creating token with client binding");
            jwt::create_token(user.id, &user.role, &email, Some(client_id))?
        } else {
            debug!("Creating token without client binding");
            jwt::generate_token(user.id, &email)?
        };
        
        // Calculate token duration from app settings
        let duration_days = std::env::var("JWT_ACCESS_TOKEN_DURATION_DAYS")
            .ok()
            .and_then(|days| days.parse::<i64>().ok())
            .unwrap_or(jwt::DEFAULT_JWT_DURATION_DAYS);
        
        // Convert days to seconds for expires_in
        let expires_in = duration_days * 24 * 60 * 60;
        
        // Create full auth details response
        Ok(FullAuthDetailsResponse {
            access_token: token,
            token_type: "Bearer".to_string(),
            expires_in,
            user_id: user.id.to_string(),
            email: user.email,
            name: user.full_name,
            role: user.role,
        })
    }
}

impl Clone for FirebaseOAuthService {
    fn clone(&self) -> Self {
        Self {
            client: Client::new(),
            api_key: self.api_key.clone(),
            project_id: self.project_id.clone(),
            db_pool: self.db_pool.clone(),
            token_verifier: self.token_verifier.clone(),
        }
    }
}