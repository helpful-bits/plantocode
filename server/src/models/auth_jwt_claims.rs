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
    /// Token binding hash (optional)
    pub tbh: Option<String>,
    /// JWT ID (unique identifier for the token)
    pub jti: String,
}