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
    pub firebase_uid: Option<String>,
    pub role: String,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
    pub firebase_refresh_token: Option<String>,
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
            SELECT id, email, password_hash, full_name, firebase_uid, role, created_at, updated_at, firebase_refresh_token
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
            SELECT id, email, password_hash, full_name, firebase_uid, role, created_at, updated_at, firebase_refresh_token
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

    // Get user by Firebase UID
    pub async fn get_by_firebase_uid(&self, firebase_uid: &str) -> Result<User, AppError> {
        let user = query_as!(
            User,
            r#"
            SELECT id, email, password_hash, full_name, firebase_uid, role, created_at, updated_at, firebase_refresh_token
            FROM users
            WHERE firebase_uid = $1
            "#,
            firebase_uid
        )
        .fetch_one(&self.db_pool)
        .await
        .map_err(|e| match e {
            sqlx::Error::RowNotFound => {
                AppError::NotFound(format!("User with Firebase UID not found: {}", firebase_uid))
            }
            _ => AppError::Database(format!("Failed to fetch user by Firebase UID: {}", e)),
        })?;

        Ok(user)
    }

    // Create a new user
    pub async fn create(
        &self,
        email: &str,
        password_hash: Option<&str>,
        full_name: Option<&str>,
        firebase_uid: Option<&str>,
        role: Option<&str>,
    ) -> Result<Uuid, AppError> {
        let id = Uuid::new_v4();
        let role = role.unwrap_or("user");

        query!(
            r#"
            INSERT INTO users (id, email, password_hash, full_name, firebase_uid, role, created_at, updated_at)
            VALUES ($1, $2, $3, $4, $5, $6, now(), now())
            "#,
            id,
            email,
            password_hash,
            full_name,
            firebase_uid,
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
        firebase_uid: Option<&str>,
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
                firebase_uid = $4,
                role = $5,
                updated_at = now()
            WHERE id = $6
            "#,
            email.unwrap_or(&current_user.email),
            password_hash.or(current_user.password_hash.as_deref()),
            full_name.or(current_user.full_name.as_deref()),
            firebase_uid.or(current_user.firebase_uid.as_deref()),
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
            SELECT u.id, u.email, u.password_hash, u.full_name, u.firebase_uid, u.role, u.created_at, u.updated_at, u.firebase_refresh_token
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
    
    // Find or create a user based on Firebase details (email and UID)
    pub async fn find_or_create_by_firebase_details(
        &self,
        firebase_uid: &str,
        email: &str,
        full_name: Option<&str>,
    ) -> Result<User, AppError> {
        // First, try to find by Firebase UID
        match self.get_by_firebase_uid(firebase_uid).await {
            Ok(user) => {
                // User exists with this Firebase UID
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
                        None, // Don't change Firebase UID
                        None, // Don't change role
                    ).await?;
                    
                    // Return updated user
                    return self.get_by_id(&user.id).await;
                }
                
                return Ok(user);
            },
            Err(AppError::NotFound(_)) => {
                // User doesn't exist with this Firebase UID
                // Now try to find by email
                match self.get_by_email(email).await {
                    Ok(user) => {
                        // User exists with this email but not with this Firebase UID
                        // Update the Firebase UID
                        self.update(
                            &user.id,
                            None, // Don't change email
                            None, // Don't change password
                            full_name, // Update name if provided
                            Some(firebase_uid), // Add Firebase UID
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
                            None, // No password for Firebase auth
                            full_name,
                            Some(firebase_uid),
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
    
    // Store Firebase refresh token
    pub async fn store_firebase_refresh_token(&self, user_id: &Uuid, refresh_token: &str) -> Result<(), AppError> {
        // Check if storing Firebase refresh tokens is enabled
        let store_enabled = std::env::var("FIREBASE_STORE_REFRESH_TOKENS")
            .unwrap_or_else(|_| "true".to_string())
            .to_lowercase() == "true";
            
        if !store_enabled {
            return Ok(());
        }
        
        query!(
            r#"
            UPDATE users
            SET firebase_refresh_token = $1,
                updated_at = now()
            WHERE id = $2
            "#,
            refresh_token,
            user_id
        )
        .execute(&self.db_pool)
        .await
        .map_err(|e| AppError::Database(format!("Failed to store Firebase refresh token: {}", e)))?;
        
        Ok(())
    }
    
    // Get Firebase refresh token
    pub async fn get_firebase_refresh_token(&self, user_id: &Uuid) -> Result<Option<String>, AppError> {
        let result = query!(
            r#"
            SELECT firebase_refresh_token
            FROM users
            WHERE id = $1
            "#,
            user_id
        )
        .fetch_one(&self.db_pool)
        .await
        .map_err(|e| match e {
            sqlx::Error::RowNotFound => AppError::NotFound(format!("User not found: {}", user_id)),
            _ => AppError::Database(format!("Failed to fetch Firebase refresh token: {}", e)),
        })?;
        
        Ok(result.firebase_refresh_token)
    }
}