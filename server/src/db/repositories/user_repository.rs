use uuid::Uuid;
use sqlx::{PgPool, query, query_as};
use chrono::{DateTime, Utc};
use crate::error::AppError;

#[derive(Debug, Clone)]
pub struct User {
    pub id: Uuid,
    pub email: String,
    pub password_hash: Option<String>,
    pub full_name: Option<String>,
    pub auth0_user_id: Option<String>,
    pub role: String,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
    pub auth0_refresh_token: Option<String>,
}

pub struct UserRepository {
    db_pool: PgPool,
}

impl UserRepository {
    pub fn new(db_pool: PgPool) -> Self {
        Self { db_pool }
    }

    // Get user by ID
    pub async fn get_by_id(&self, id: &Uuid) -> Result<User, AppError> {
        let user = query_as!(
            User,
            r#"
            SELECT id, email, password_hash, full_name, auth0_user_id, role, created_at, updated_at, auth0_refresh_token
            FROM users
            WHERE id = $1
            "#,
            id
        )
        .fetch_one(&self.db_pool)
        .await
        .map_err(|e| match e {
            sqlx::Error::RowNotFound => AppError::NotFound(format!("User not found: {}", id)),
            _ => AppError::Database(format!("Failed to fetch user: {}", e)),
        })?;

        Ok(user)
    }

    // Get user by email
    pub async fn get_by_email(&self, email: &str) -> Result<User, AppError> {
        let user = query_as!(
            User,
            r#"
            SELECT id, email, password_hash, full_name, auth0_user_id, role, created_at, updated_at, auth0_refresh_token
            FROM users
            WHERE email = $1
            "#,
            email
        )
        .fetch_one(&self.db_pool)
        .await
        .map_err(|e| match e {
            sqlx::Error::RowNotFound => AppError::NotFound(format!("User with email not found: {}", email)),
            _ => AppError::Database(format!("Failed to fetch user by email: {}", e)),
        })?;

        Ok(user)
    }

    // Get user by Auth0 user ID
    pub async fn get_by_auth0_user_id(&self, auth0_user_id: &str) -> Result<User, AppError> {
        let user = query_as!(
            User,
            r#"
            SELECT id, email, password_hash, full_name, auth0_user_id, role, created_at, updated_at, auth0_refresh_token
            FROM users
            WHERE auth0_user_id = $1
            "#,
            auth0_user_id
        )
        .fetch_one(&self.db_pool)
        .await
        .map_err(|e| match e {
            sqlx::Error::RowNotFound => {
                AppError::NotFound(format!("User with Auth0 user ID not found: {}", auth0_user_id))
            }
            _ => AppError::Database(format!("Failed to fetch user by Auth0 user ID: {}", e)),
        })?;

        Ok(user)
    }

    // Create a new user
    pub async fn create(
        &self,
        email: &str,
        password_hash: Option<&str>,
        full_name: Option<&str>,
        auth0_user_id: Option<&str>,
        role: Option<&str>,
    ) -> Result<Uuid, AppError> {
        let id = Uuid::new_v4();
        let role = role.unwrap_or("user");

        query!(
            r#"
            INSERT INTO users (id, email, password_hash, full_name, auth0_user_id, role, created_at, updated_at)
            VALUES ($1, $2, $3, $4, $5, $6, now(), now())
            "#,
            id,
            email,
            password_hash,
            full_name,
            auth0_user_id,
            role
        )
        .execute(&self.db_pool)
        .await
        .map_err(|e| AppError::Database(format!("Failed to create user: {}", e)))?;

        Ok(id)
    }

    // Update user
    pub async fn update(
        &self,
        id: &Uuid,
        email: Option<&str>,
        password_hash: Option<&str>,
        full_name: Option<&str>,
        auth0_user_id: Option<&str>,
        role: Option<&str>,
    ) -> Result<(), AppError> {
        // Get current user to preserve fields that are not being updated
        let current_user = self.get_by_id(id).await?;

        query!(
            r#"
            UPDATE users
            SET email = $1,
                password_hash = $2,
                full_name = $3,
                auth0_user_id = $4,
                role = $5,
                updated_at = now()
            WHERE id = $6
            "#,
            email.unwrap_or(&current_user.email),
            password_hash.or(current_user.password_hash.as_deref()),
            full_name.or(current_user.full_name.as_deref()),
            auth0_user_id.or(current_user.auth0_user_id.as_deref()),
            role.unwrap_or(&current_user.role),
            id
        )
        .execute(&self.db_pool)
        .await
        .map_err(|e| AppError::Database(format!("Failed to update user: {}", e)))?;

        Ok(())
    }

    // Delete user
    pub async fn delete(&self, id: &Uuid) -> Result<(), AppError> {
        query!(
            r#"
            DELETE FROM users
            WHERE id = $1
            "#,
            id
        )
        .execute(&self.db_pool)
        .await
        .map_err(|e| AppError::Database(format!("Failed to delete user: {}", e)))?;

        Ok(())
    }
    
    // Find users by Stripe customer ID
    pub async fn find_by_stripe_customer_id(&self, stripe_customer_id: &str) -> Result<Vec<User>, AppError> {
        let users = query_as!(
            User,
            r#"
            SELECT u.id, u.email, u.password_hash, u.full_name, u.auth0_user_id, u.role, u.created_at, u.updated_at, u.auth0_refresh_token
            FROM users u
            JOIN subscriptions s ON u.id = s.user_id
            WHERE s.stripe_customer_id = $1
            "#,
            stripe_customer_id
        )
        .fetch_all(&self.db_pool)
        .await
        .map_err(|e| AppError::Database(format!("Failed to find users by Stripe customer ID: {}", e)))?;

        Ok(users)
    }
    
    // Find or create a user based on Auth0 details (Auth0 user ID and email)
    pub async fn find_or_create_by_auth0_details(
        &self,
        auth0_user_id: &str,
        email: &str,
        full_name: Option<&str>,
    ) -> Result<User, AppError> {
        // First, try to find by Auth0 user ID
        match self.get_by_auth0_user_id(auth0_user_id).await {
            Ok(user) => {
                // User exists with this Auth0 user ID
                let mut update_needed = false;
                let mut updated_email = None;
                let mut updated_full_name = None;
                
                // Check if any details need to be updated
                if user.email != email {
                    updated_email = Some(email);
                    update_needed = true;
                }
                
                if let Some(name) = full_name {
                    if user.full_name.as_deref() != Some(name) {
                        updated_full_name = Some(name);
                        update_needed = true;
                    }
                }
                
                if update_needed {
                    // Update user details
                    self.update(
                        &user.id,
                        updated_email,
                        None, // Don't change password
                        updated_full_name,
                        None, // Don't change Auth0 user ID
                        None, // Don't change role
                    ).await?;
                    
                    // Return updated user
                    return self.get_by_id(&user.id).await;
                }
                
                return Ok(user);
            },
            Err(AppError::NotFound(_)) => {
                // User doesn't exist with this Auth0 user ID
                // Now try to find by email
                match self.get_by_email(email).await {
                    Ok(user) => {
                        // User exists with this email but not with this Auth0 user ID
                        // Update the Auth0 user ID
                        self.update(
                            &user.id,
                            None, // Don't change email
                            None, // Don't change password
                            full_name, // Update name if provided
                            Some(auth0_user_id), // Add Auth0 user ID
                            None, // Don't change role
                        ).await?;
                        
                        // Return updated user
                        return self.get_by_id(&user.id).await;
                    },
                    Err(AppError::NotFound(_)) => {
                        // User doesn't exist with this email either
                        // Create a new user
                        let user_id = self.create(
                            email,
                            None, // No password for Auth0 auth
                            full_name,
                            Some(auth0_user_id),
                            None, // Default role
                        ).await?;
                        
                        return self.get_by_id(&user_id).await;
                    },
                    Err(e) => return Err(e), // Other database errors
                }
            },
            Err(e) => return Err(e), // Other database errors
        }
    }
    
    // Store Auth0 refresh token
    pub async fn store_auth0_refresh_token(&self, user_id: &Uuid, refresh_token: &str) -> Result<(), AppError> {
        query!(
            r#"
            UPDATE users
            SET auth0_refresh_token = $1,
                updated_at = now()
            WHERE id = $2
            "#,
            refresh_token,
            user_id
        )
        .execute(&self.db_pool)
        .await
        .map_err(|e| AppError::Database(format!("Failed to store Auth0 refresh token: {}", e)))?;
        
        Ok(())
    }
    
    // Get Auth0 refresh token
    pub async fn get_auth0_refresh_token(&self, user_id: &Uuid) -> Result<Option<String>, AppError> {
        let result = query!(
            r#"
            SELECT auth0_refresh_token
            FROM users
            WHERE id = $1
            "#,
            user_id
        )
        .fetch_one(&self.db_pool)
        .await
        .map_err(|e| match e {
            sqlx::Error::RowNotFound => AppError::NotFound(format!("User not found: {}", user_id)),
            _ => AppError::Database(format!("Failed to fetch Auth0 refresh token: {}", e)),
        })?;
        
        Ok(result.auth0_refresh_token)
    }
}