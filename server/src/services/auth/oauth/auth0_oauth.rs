use crate::config::settings::AppSettings;
use crate::db::repositories::user_repository::UserRepository;
use crate::error::AppError;
use crate::models::auth_jwt_claims::Claims;
use crate::services::auth::jwt;
use reqwest::Client;
use serde::{Deserialize, Serialize};
use sqlx::PgPool;
use uuid::Uuid;
use std::sync::Arc;
use log::{debug, error, info};
use jsonwebtoken::{decode, decode_header, Algorithm, DecodingKey, Validation};

#[derive(Debug, Deserialize, Serialize, Clone)]
pub struct Auth0AccessTokenClaims {
    pub sub: String,
    pub exp: u64,
    pub iat: u64,
    pub iss: String,
    pub aud: serde_json::Value,
    pub scope: Option<String>,
    pub azp: Option<String>, // Authorized party (client_id)
}

#[derive(Debug, Deserialize, Serialize, Clone)]
pub struct Auth0IdTokenClaims {
    pub sub: String,
    pub name: Option<String>,
    pub email: Option<String>,
    pub email_verified: Option<bool>,
    pub picture: Option<String>,
    pub exp: u64,
    pub iat: u64,
    pub iss: String,
    pub aud: serde_json::Value,
}

#[derive(Debug, Deserialize, Serialize, Clone)]
pub struct Auth0UserInfo {
    pub sub: String,
    pub name: Option<String>,
    pub email: Option<String>,
    pub email_verified: Option<bool>,
    pub picture: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct Auth0TokenResponse {
    pub access_token: String,
    pub id_token: String,
    pub token_type: String,
    pub expires_in: i64,
    pub refresh_token: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct FrontendUser {
    pub id: String,
    pub email: String,
    pub name: Option<String>,
    pub role: String,
}

#[derive(Debug, Serialize)]
pub struct AuthDataResponse {
    pub user: FrontendUser,
    pub token: String,
    pub token_type: String,
    pub expires_in: i64,
}

#[derive(Debug, Deserialize, Clone)]
pub struct Auth0Jwks {
    pub keys: Vec<Auth0JwkKey>,
}

#[derive(Debug, Deserialize, Clone)]
pub struct Auth0JwkKey {
    pub kty: String,
    pub r#use: Option<String>,
    pub kid: String,
    pub x5t: Option<String>,
    pub n: String,
    pub e: String,
    pub x5c: Option<Vec<String>>,
    pub alg: Option<String>,
}

pub struct Auth0OAuthService {
    client: Client,
    auth0_domain: String,
    auth0_api_audience: String,
    auth0_server_client_id: Option<String>,
    auth0_server_client_secret: Option<String>,
    db_pool: PgPool,
    jwks_cache: Arc<std::sync::Mutex<Option<(Auth0Jwks, std::time::Instant)>>>,
}

impl Auth0OAuthService {
    pub fn new(settings: &AppSettings, db_pool: PgPool) -> Self {
        Self {
            client: Client::new(),
            auth0_domain: settings.api_keys.auth0_domain.clone(),
            auth0_api_audience: settings.api_keys.auth0_api_audience.clone(),
            auth0_server_client_id: settings.api_keys.auth0_server_client_id.clone(),
            auth0_server_client_secret: settings.api_keys.auth0_server_client_secret.clone(),
            db_pool,
            jwks_cache: Arc::new(std::sync::Mutex::new(None)),
        }
    }

    async fn get_jwks(&self) -> Result<Auth0Jwks, AppError> {
        let cache_ttl = std::time::Duration::from_secs(300); // 5 minutes

        {
            let cache = self.jwks_cache.lock().unwrap();
            if let Some((jwks, cached_at)) = &*cache {
                if cached_at.elapsed() < cache_ttl {
                    return Ok(jwks.clone());
                }
            }
        }

        let jwks_url = format!("https://{}/.well-known/jwks.json", self.auth0_domain);
        let response = self.client
            .get(&jwks_url)
            .send()
            .await
            .map_err(|e| AppError::Auth(format!("Failed to fetch JWKS: {}", e)))?;

        let jwks: Auth0Jwks = response
            .json()
            .await
            .map_err(|e| AppError::Auth(format!("Failed to parse JWKS: {}", e)))?;

        {
            let mut cache = self.jwks_cache.lock().unwrap();
            *cache = Some((jwks.clone(), std::time::Instant::now()));
        }

        Ok(jwks)
    }

    pub async fn validate_auth0_access_token(&self, access_token_str: &str) -> Result<Auth0AccessTokenClaims, AppError> {
        let header = decode_header(access_token_str)
            .map_err(|e| AppError::Auth(format!("Invalid token header: {}", e)))?;

        let kid = header.kid.ok_or_else(|| AppError::Auth("Token missing kid".to_string()))?;

        let jwks = self.get_jwks().await?;
        let key = jwks.keys.iter()
            .find(|k| k.kid == kid)
            .ok_or_else(|| AppError::Auth("Key not found in JWKS".to_string()))?;

        let decoding_key = DecodingKey::from_rsa_components(&key.n, &key.e)
            .map_err(|e| AppError::Auth(format!("Failed to create decoding key: {}", e)))?;

        let mut validation = Validation::new(Algorithm::RS256);
        // Don't validate audience in JWT library since Auth0 can return either string or array
        validation.validate_aud = false;
        validation.set_issuer(&[&format!("https://{}/", self.auth0_domain)]);

        let token_data = decode::<Auth0AccessTokenClaims>(access_token_str, &decoding_key, &validation)
            .map_err(|e| AppError::Auth(format!("Token validation failed: {}", e)))?;

        // Manually validate audience after token parsing
        let claims = &token_data.claims;
        let audience_valid = match &claims.aud {
            serde_json::Value::String(aud_str) => {
                aud_str == &self.auth0_api_audience
            },
            serde_json::Value::Array(aud_array) => {
                aud_array.iter().any(|aud| {
                    if let serde_json::Value::String(aud_str) = aud {
                        aud_str == &self.auth0_api_audience
                    } else {
                        false
                    }
                })
            },
            _ => false,
        };
        
        if !audience_valid {
            return Err(AppError::Auth(format!("Invalid audience: expected {}, got {:?}", self.auth0_api_audience, claims.aud)));
        }

        Ok(token_data.claims)
    }

    pub async fn get_user_info_from_access_token(&self, access_token: &str) -> Result<Auth0UserInfo, AppError> {
        let userinfo_url = format!("https://{}/userinfo", self.auth0_domain);
        
        let response = self.client
            .get(&userinfo_url)
            .bearer_auth(access_token)
            .send()
            .await
            .map_err(|e| AppError::Auth(format!("Failed to fetch user info: {}", e)))?;

        if !response.status().is_success() {
            let status = response.status();
            let text = response.text().await.unwrap_or_default();
            error!("Auth0 userinfo error: {} - {}", status, text);
            return Err(AppError::Auth(format!("Failed to get user info: HTTP {}", status)));
        }

        let user_info: Auth0UserInfo = response
            .json()
            .await
            .map_err(|e| AppError::Auth(format!("Failed to parse user info: {}", e)))?;

        Ok(user_info)
    }

    pub async fn exchange_auth0_refresh_token(&self, refresh_token: &str) -> Result<Auth0TokenResponse, AppError> {
        let client_id = self.auth0_server_client_id.as_ref()
            .ok_or_else(|| AppError::Configuration("Auth0 server client ID not configured".to_string()))?;
        let client_secret = self.auth0_server_client_secret.as_ref()
            .ok_or_else(|| AppError::Configuration("Auth0 server client secret not configured".to_string()))?;

        let token_url = format!("https://{}/oauth/token", self.auth0_domain);
        
        let response = self.client
            .post(&token_url)
            .form(&[
                ("grant_type", "refresh_token"),
                ("client_id", client_id),
                ("client_secret", client_secret),
                ("refresh_token", refresh_token),
            ])
            .send()
            .await
            .map_err(|e| AppError::Auth(format!("Failed to exchange refresh token: {}", e)))?;

        if !response.status().is_success() {
            let status = response.status();
            let text = response.text().await.unwrap_or_default();
            error!("Auth0 token refresh error: {} - {}", status, text);
            return Err(AppError::Auth(format!("Failed to refresh token: HTTP {}", status)));
        }

        let token_response: Auth0TokenResponse = response
            .json()
            .await
            .map_err(|e| AppError::Auth(format!("Failed to parse token response: {}", e)))?;

        Ok(token_response)
    }

    pub async fn process_auth0_login(
        &self,
        user_info: Auth0UserInfo,
        auth0_refresh_token: Option<String>,
        client_id_from_header: Option<&str>,
    ) -> Result<AuthDataResponse, AppError> {
        let auth0_sub = user_info.sub.clone();
        let email = user_info.email.clone().unwrap_or_else(|| format!("user-{}", auth0_sub));
        let name = user_info.name.clone();

        let user_repo = UserRepository::new(self.db_pool.clone());
        
        let user = user_repo.find_or_create_by_auth0_details(&auth0_sub, &email, name.as_deref()).await?;

        if let Some(refresh_token) = auth0_refresh_token {
            user_repo.store_auth0_refresh_token(&user.id, &refresh_token).await?;
        }

        info!("Authenticated user {} (ID: {}) via Auth0", email, user.id);

        let token = if let Some(client_id) = client_id_from_header {
            debug!("Creating token with client binding for client_id: {}", client_id);
            jwt::create_token(user.id, &user.role, &email, Some(client_id))?
        } else {
            debug!("Creating token without client binding");
            jwt::create_token(user.id, &user.role, &email, None)?
        };

        let duration_days = std::env::var("JWT_ACCESS_TOKEN_DURATION_DAYS")
            .ok()
            .and_then(|days| days.parse::<i64>().ok())
            .unwrap_or(jwt::DEFAULT_JWT_DURATION_DAYS);

        let expires_in = duration_days * 24 * 60 * 60;

        Ok(AuthDataResponse {
            user: FrontendUser {
                id: user.id.to_string(),
                email: user.email,
                name: user.full_name,
                role: user.role,
            },
            token,
            token_type: "Bearer".to_string(),
            expires_in,
        })
    }
}

impl Clone for Auth0OAuthService {
    fn clone(&self) -> Self {
        Self {
            client: Client::new(),
            auth0_domain: self.auth0_domain.clone(),
            auth0_api_audience: self.auth0_api_audience.clone(),
            auth0_server_client_id: self.auth0_server_client_id.clone(),
            auth0_server_client_secret: self.auth0_server_client_secret.clone(),
            db_pool: self.db_pool.clone(),
            jwks_cache: self.jwks_cache.clone(),
        }
    }
}