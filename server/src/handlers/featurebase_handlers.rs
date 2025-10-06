use crate::config::settings::AppSettings;
use crate::db::repositories::user_repository::UserRepository;
use crate::models::AuthenticatedUser;
use crate::services::auth::jwt::create_featurebase_sso_token;
use actix_web::{HttpResponse, Result, web};
use serde_json::json;
use std::sync::Arc;

pub async fn get_sso_token(
    user: web::ReqData<AuthenticatedUser>,
    user_repo: web::Data<Arc<UserRepository>>,
    app_settings: web::Data<AppSettings>,
) -> Result<HttpResponse> {
    let user_data = user.into_inner();

    // if user_data.role == "admin" {
    //     return Ok(HttpResponse::Forbidden().json(json!({
    //         "error": "Admin users must use native login to Featurebase"
    //     })));
    // }

    let user_details = match user_repo.get_by_id(&user_data.user_id).await {
        Ok(user) => user,
        Err(_) => {
            return Ok(HttpResponse::NotFound().json(json!({
                "error": "User not found"
            })));
        }
    };

    let token = match create_featurebase_sso_token(
        user_data.user_id,
        &user_data.email,
        user_details.full_name.as_deref(),
        &user_data.role,
        &app_settings.auth.featurebase_sso_secret,
    ) {
        Ok(token) => token,
        Err(_) => {
            return Ok(HttpResponse::InternalServerError().json(json!({
                "error": "Failed to generate SSO token"
            })));
        }
    };

    Ok(HttpResponse::Ok().json(json!({
        "token": token
    })))
}
