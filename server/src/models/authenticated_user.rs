use actix_web::{dev::Payload, Error, FromRequest, HttpRequest, HttpMessage};
use serde::{Deserialize, Serialize};
use std::future::{ready, Ready};
use uuid::Uuid;

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct AuthenticatedUser {
    pub user_id: Uuid,
    pub email: String,
    pub role: String,
    pub device_id: Option<String>,
}

impl FromRequest for AuthenticatedUser {
    type Error = Error;
    type Future = Ready<Result<Self, Self::Error>>;

    fn from_request(req: &HttpRequest, _: &mut Payload) -> Self::Future {
        if let Some(user) = req.extensions().get::<AuthenticatedUser>() {
            ready(Ok(user.clone()))
        } else {
            ready(Err(actix_web::error::ErrorUnauthorized("Not authenticated")))
        }
    }
}