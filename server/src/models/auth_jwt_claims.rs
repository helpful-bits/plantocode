use serde::{Deserialize, Serialize};

/// JWT claims structure that will be encoded/decoded for authentication
#[derive(Debug, Serialize, Deserialize)]
pub struct Claims {
    /// Subject (user ID)
    pub sub: String,
    /// Expiration time (as UTC timestamp)
    pub exp: usize,
    /// Issued at (as UTC timestamp)
    pub iat: usize,
    /// Issuer (optional)
    pub iss: Option<String>,
    /// User email
    pub email: String,
    /// User role (e.g., "user", "admin")
    pub role: String,
    /// Auth0 subject identifier (for cross-region user recovery)
    pub auth0_sub: Option<String>,
    /// Token binding hash (optional)
    pub tbh: Option<String>,
    /// JWT ID (unique identifier for the token)
    pub jti: String,
    /// Audience claim (intended recipient)
    pub aud: Option<String>,
    /// Client ID
    pub client_id: Option<String>,
    /// Device ID for device binding
    pub device_id: Option<String>,
    /// Scopes granted to the token
    pub scope: Option<String>,
    /// Session ID for session binding
    pub session_id: Option<String>,
    /// IP address binding
    pub ip_binding: Option<String>,
}