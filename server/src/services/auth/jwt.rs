use crate::error::AppError;
use crate::models::auth_jwt_claims::Claims;
use crate::security::token_binding::hash_token_binding_value;
use chrono::{Duration, Utc};
use jsonwebtoken::{Algorithm, DecodingKey, EncodingKey, Header, Validation, decode, encode};
use log::{debug, error, info, trace};
use uuid::Uuid;
use std::sync::OnceLock;
use serde::{Deserialize, Serialize};

// Default JWT duration in days
pub const DEFAULT_JWT_DURATION_DAYS: i64 = 30;

// Issuer name for JWT tokens
pub const JWT_ISSUER: &str = "vibe-manager";

#[derive(Debug, Serialize, Deserialize)]
pub struct FeaturebaseClaims {
    #[serde(rename = "userId")]
    pub user_id: String,
    pub email: Option<String>,
    pub name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub role: Option<String>,
    pub exp: i64,
}

// Global static holders for JWT keys
static JWT_ENCODING_KEY: OnceLock<EncodingKey> = OnceLock::new();
static JWT_DECODING_KEY: OnceLock<DecodingKey> = OnceLock::new();

/// Initialize the JWT keys from the secret
/// This should be called once at application startup
pub fn init_jwt_keys(jwt_secret_str: &str) -> Result<(), AppError> {
    info!("Initializing JWT keys from configuration");
    
    // Use the provided JWT secret
    let jwt_secret = jwt_secret_str.as_bytes();
    
    // Set the encoding key
    let encoding_key = EncodingKey::from_secret(jwt_secret);
    JWT_ENCODING_KEY.set(encoding_key)
        .map_err(|_| AppError::Internal("JWT_ENCODING_KEY was already initialized".to_string()))?;

    // Set the decoding key
    let decoding_key = DecodingKey::from_secret(jwt_secret);
    JWT_DECODING_KEY.set(decoding_key)
        .map_err(|_| AppError::Internal("JWT_DECODING_KEY was already initialized".to_string()))?;
    
    info!("JWT keys initialized successfully");
    Ok(())
}

/// Get the JWT encoding key
fn get_encoding_key() -> Result<EncodingKey, AppError> {
    JWT_ENCODING_KEY.get()
        .cloned() // EncodingKey is Clone
        .ok_or_else(|| AppError::Configuration("JWT encoding key not initialized.".to_string()))
}

/// Get the JWT decoding key
fn get_decoding_key() -> Result<DecodingKey, AppError> {
    JWT_DECODING_KEY.get()
        .cloned() // DecodingKey is Clone
        .ok_or_else(|| AppError::Configuration("JWT decoding key not initialized.".to_string()))
}

/// Generate a JWT token for a user
pub fn generate_token(user_id: Uuid, email: &str, token_duration_days: i64) -> Result<String, AppError> {
    let duration_days = token_duration_days;

    // Calculate timestamps
    let iat = Utc::now();
    let exp = iat
        .checked_add_signed(Duration::try_days(duration_days).unwrap_or_else(|| Duration::days(DEFAULT_JWT_DURATION_DAYS)))
        .ok_or_else(|| AppError::Internal("Failed to calculate JWT expiration time".to_string()))?;

    // Create claims
    let claims = Claims {
        sub: user_id.to_string(),
        exp: exp.timestamp() as usize,
        iat: iat.timestamp() as usize,
        iss: Some(JWT_ISSUER.to_string()),
        email: email.to_string(),
        role: "user".to_string(), // Default role
        tbh: None, // No token binding by default
    };

    // Get the JWT signing key
    let encoding_key = get_encoding_key()?;

    // Use HS256 algorithm for symmetric key
    let header = Header::new(Algorithm::HS256);

    // Encode the token
    debug!("Generating JWT token for user {} (exp: {})", user_id, exp);
    encode(&header, &claims, &encoding_key)
        .map_err(|e| {
            error!("Failed to generate JWT token: {}", e);
            AppError::Internal(format!("Token generation failed: {}", e))
        })
}

/// Verify a JWT token and extract the claims
pub fn verify_token(token: &str) -> Result<Claims, AppError> {
    trace!("Verifying JWT token");
    
    // Get the JWT verification key
    let decoding_key = get_decoding_key()?;
    
    // Use HS256 algorithm for symmetric key
    let mut validation = Validation::new(Algorithm::HS256);
    validation.set_issuer(&[JWT_ISSUER]); // Trust only our issuer

    // Decode and validate the token
    let token_data = decode::<Claims>(token, &decoding_key, &validation)
        .map_err(|err| {
            error!("JWT validation failed: {}", err);
            match err.kind() {
                jsonwebtoken::errors::ErrorKind::ExpiredSignature => {
                    AppError::Auth("Token has expired".to_string())
                },
                jsonwebtoken::errors::ErrorKind::InvalidToken => AppError::Auth("Invalid token format".to_string()),
                jsonwebtoken::errors::ErrorKind::InvalidSignature => AppError::Auth("Invalid token signature".to_string()),
                jsonwebtoken::errors::ErrorKind::InvalidIssuer => AppError::Auth("Invalid token issuer".to_string()),
                jsonwebtoken::errors::ErrorKind::InvalidAudience => AppError::Auth("Invalid token audience".to_string()),
                jsonwebtoken::errors::ErrorKind::InvalidSubject => AppError::Auth("Invalid token subject".to_string()),
                jsonwebtoken::errors::ErrorKind::ImmatureSignature => AppError::Auth("Token not yet valid (immature)".to_string()),
                jsonwebtoken::errors::ErrorKind::MissingRequiredClaim(claim) => AppError::Auth(format!("Token missing required claim: {}", claim)),
                _ => AppError::Auth(format!("Token validation failed: {:?}", err.kind())), // Generic auth error for other cases
            }
        })?;
    
    // Return the claims
    debug!("JWT token verified successfully for user {}", token_data.claims.sub);
    Ok(token_data.claims)
}

/// Creates a JWT token with customizable role and optional token binding.
pub fn create_token(
    user_id: Uuid,
    role: &str,
    email: &str,
    token_binding_value: Option<&str>,
    token_duration_days: i64,
) -> Result<String, AppError> {
    let duration_days = token_duration_days;

    // Calculate timestamps
    let iat_dt = Utc::now();
    let exp_dt = iat_dt + Duration::try_days(duration_days).unwrap_or_else(|| Duration::days(DEFAULT_JWT_DURATION_DAYS));

    let iat = iat_dt.timestamp() as usize;
    let exp = exp_dt.timestamp() as usize;

    // Create claims
    let claims = Claims {
        sub: user_id.to_string(),
        exp,
        iat,
        email: email.to_string(),
        role: role.to_string(),
        iss: Some(JWT_ISSUER.to_string()),
        // Add token binding hash if value is provided
        tbh: token_binding_value.map(hash_token_binding_value),
    };

    // Get the JWT signing key
    let encoding_key = get_encoding_key()?;

    // Use HS256 algorithm for symmetric key
    let header = Header::new(Algorithm::HS256);
    
    // Encode the token
    encode(&header, &claims, &encoding_key)
        .map_err(|e| {
            error!("Failed to create JWT token: {}", e);
            AppError::Internal(format!("Token creation failed: {}", e))
        })
}

pub fn create_featurebase_sso_token(
    user_id: Uuid,
    email: &str,
    name: Option<&str>,
    role: &str,
    secret: &str,
) -> Result<String, AppError> {
    let iat = Utc::now();
    let exp = iat
        .checked_add_signed(Duration::try_minutes(5).unwrap())
        .ok_or_else(|| AppError::Internal("Failed to calculate JWT expiration time".to_string()))?;

    let claims = FeaturebaseClaims {
        user_id: user_id.to_string(),
        email: Some(email.to_string()),
        name: name.map(|s| s.to_string()),
        role: Some(role.to_string()),
        exp: exp.timestamp(),
    };

    let encoding_key = EncodingKey::from_secret(secret.as_bytes());
    let header = Header::new(Algorithm::HS256);

    encode(&header, &claims, &encoding_key)
        .map_err(|e| {
            error!("Failed to create Featurebase SSO token: {}", e);
            AppError::Internal(format!("Featurebase SSO token creation failed: {}", e))
        })
}