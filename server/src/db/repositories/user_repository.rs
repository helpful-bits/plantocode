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
    pub auth0_refresh_token: Option<Vec<u8>>,
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
            SELECT id, email, password_hash, full_name, auth0_user_id, role, created_at, updated_at, auth0_refresh_token as "auth0_refresh_token: Vec<u8>"
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

    // Get user by ID with custom executor
    pub async fn get_by_id_with_executor(&self, id: &Uuid, executor: &mut sqlx::Transaction<'_, sqlx::Postgres>) -> Result<User, AppError>
    {
        let user = query_as!(
            User,
            r#"
            SELECT id, email, password_hash, full_name, auth0_user_id, role, created_at, updated_at, auth0_refresh_token as "auth0_refresh_token: Vec<u8>"
            FROM users
            WHERE id = $1
            "#,
            id
        )
        .fetch_one(&mut **executor)
        .await
        .map_err(|e| match e {
            sqlx::Error::RowNotFound => AppError::NotFound(format!("User not found: {}", id)),
            _ => AppError::Database(format!("Failed to fetch user: {}", e)),
        })?;

        Ok(user)
    }

    // Get user by email
    // SECURITY WARNING: This method bypasses RLS - only use with system pool (vibe_manager_app role)
    // Never call from user-facing handlers that use user pool (authenticated role)
    pub async fn get_by_email(&self, email: &str) -> Result<User, AppError> {
        let user = query_as!(
            User,
            r#"
            SELECT id, email, password_hash, full_name, auth0_user_id, role, created_at, updated_at, auth0_refresh_token as "auth0_refresh_token: Vec<u8>"
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

    // Get user by email with custom executor
    pub async fn get_by_email_with_executor(&self, email: &str, executor: &mut sqlx::Transaction<'_, sqlx::Postgres>) -> Result<User, AppError>
    {
        let user = query_as!(
            User,
            r#"
            SELECT id, email, password_hash, full_name, auth0_user_id, role, created_at, updated_at, auth0_refresh_token as "auth0_refresh_token: Vec<u8>"
            FROM users
            WHERE email = $1
            "#,
            email
        )
        .fetch_one(&mut **executor)
        .await
        .map_err(|e| match e {
            sqlx::Error::RowNotFound => AppError::NotFound(format!("User with email not found: {}", email)),
            _ => AppError::Database(format!("Failed to fetch user by email: {}", e)),
        })?;

        Ok(user)
    }

    // Get user by Auth0 user ID  
    // SECURITY WARNING: This method bypasses RLS - only use with system pool (vibe_manager_app role)
    // Never call from user-facing handlers that use user pool (authenticated role)
    pub async fn get_by_auth0_user_id(&self, auth0_user_id: &str) -> Result<User, AppError> {
        let user = query_as!(
            User,
            r#"
            SELECT id, email, password_hash, full_name, auth0_user_id, role, created_at, updated_at, auth0_refresh_token as "auth0_refresh_token: Vec<u8>"
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

    // Get user by Auth0 user ID with custom executor
    pub async fn get_by_auth0_user_id_with_executor(&self, auth0_user_id: &str, executor: &mut sqlx::Transaction<'_, sqlx::Postgres>) -> Result<User, AppError>
    {
        let user = query_as!(
            User,
            r#"
            SELECT id, email, password_hash, full_name, auth0_user_id, role, created_at, updated_at, auth0_refresh_token as "auth0_refresh_token: Vec<u8>"
            FROM users
            WHERE auth0_user_id = $1
            "#,
            auth0_user_id
        )
        .fetch_one(&mut **executor)
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

    // Create a new user with custom executor
    pub async fn create_with_executor(
        &self,
        email: &str,
        password_hash: Option<&str>,
        full_name: Option<&str>,
        auth0_user_id: Option<&str>,
        role: Option<&str>,
        executor: &mut sqlx::Transaction<'_, sqlx::Postgres>,
    ) -> Result<Uuid, AppError>
    {
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
        .execute(&mut **executor)
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

    // Update user with custom executor
    pub async fn update_with_executor(
        &self,
        id: &Uuid,
        email: Option<&str>,
        password_hash: Option<&str>,
        full_name: Option<&str>,
        auth0_user_id: Option<&str>,
        role: Option<&str>,
        current_user: &User,
        executor: &mut sqlx::Transaction<'_, sqlx::Postgres>,
    ) -> Result<(), AppError>
    {
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
        .execute(&mut **executor)
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
    
    // Get user by Stripe customer ID
    pub async fn get_by_stripe_customer_id(&self, stripe_customer_id: &str) -> Result<User, AppError> {
        let user = query_as!(
            User,
            r#"
            SELECT u.id, u.email, u.password_hash, u.full_name, u.auth0_user_id, u.role, u.created_at, u.updated_at, u.auth0_refresh_token as "auth0_refresh_token: Vec<u8>"
            FROM users u
            JOIN customer_billing cb ON u.id = cb.user_id
            WHERE cb.stripe_customer_id = $1
            "#,
            stripe_customer_id
        )
        .fetch_one(&self.db_pool)
        .await
        .map_err(|e| match e {
            sqlx::Error::RowNotFound => AppError::NotFound(format!("User with Stripe customer ID not found: {}", stripe_customer_id)),
            _ => AppError::Database(format!("Failed to get user by Stripe customer ID: {}", e)),
        })?;

        Ok(user)
    }

    // Get user by Stripe customer ID with custom executor
    pub async fn get_by_stripe_customer_id_with_executor(&self, stripe_customer_id: &str, executor: &mut sqlx::Transaction<'_, sqlx::Postgres>) -> Result<User, AppError>
    {
        let user = query_as!(
            User,
            r#"
            SELECT u.id, u.email, u.password_hash, u.full_name, u.auth0_user_id, u.role, u.created_at, u.updated_at, u.auth0_refresh_token as "auth0_refresh_token: Vec<u8>"
            FROM users u
            JOIN customer_billing cb ON u.id = cb.user_id
            WHERE cb.stripe_customer_id = $1
            "#,
            stripe_customer_id
        )
        .fetch_one(&mut **executor)
        .await
        .map_err(|e| match e {
            sqlx::Error::RowNotFound => AppError::NotFound(format!("User with Stripe customer ID not found: {}", stripe_customer_id)),
            _ => AppError::Database(format!("Failed to get user by Stripe customer ID: {}", e)),
        })?;

        Ok(user)
    }
    
    // Find or create a user based on Auth0 details (Auth0 user ID and email)
    pub async fn find_or_create_by_auth0_details(
        &self,
        auth0_user_id: &str,
        email: &str,
        full_name: Option<&str>,
    ) -> Result<User, AppError> {
        let mut tx = self.db_pool.begin().await.map_err(AppError::from)?;
        let result = self._find_or_create_by_auth0_details_in_tx(auth0_user_id, email, full_name, &mut tx).await;
        match result {
            Ok(user) => {
                tx.commit().await.map_err(AppError::from)?;
                Ok(user)
            }
            Err(e) => {
                // tx will be rolled back automatically on drop
                Err(e)
            }
        }
    }

    // Private transactional implementation
    async fn _find_or_create_by_auth0_details_in_tx<'a>(
        &self,
        auth0_user_id: &str,
        email: &str,
        full_name: Option<&str>,
        tx: &mut sqlx::Transaction<'a, sqlx::Postgres>,
    ) -> Result<User, AppError> {
        // First, try to find by Auth0 user ID
        match self.get_by_auth0_user_id_with_executor(auth0_user_id, tx).await {
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
                    self.update_with_executor(
                        &user.id,
                        updated_email,
                        None, // Don't change password
                        updated_full_name,
                        None, // Don't change Auth0 user ID
                        None, // Don't change role
                        &user,
                        tx,
                    ).await?;
                    
                    // Return updated user
                    return self.get_by_id_with_executor(&user.id, tx).await;
                }
                
                return Ok(user);
            },
            Err(AppError::NotFound(_)) => {
                // User doesn't exist with this Auth0 user ID
                // Now try to find by email
                match self.get_by_email_with_executor(email, tx).await {
                    Ok(user) => {
                        // User exists with this email but not with this Auth0 user ID
                        // Update the Auth0 user ID
                        self.update_with_executor(
                            &user.id,
                            None, // Don't change email
                            None, // Don't change password
                            full_name, // Update name if provided
                            Some(auth0_user_id), // Add Auth0 user ID
                            None, // Don't change role
                            &user,
                            tx,
                        ).await?;
                        
                        // Return updated user
                        return self.get_by_id_with_executor(&user.id, tx).await;
                    },
                    Err(AppError::NotFound(_)) => {
                        // User doesn't exist with this email either
                        // Create a new user
                        let user_id = self.create_with_executor(
                            email,
                            None, // No password for Auth0 auth
                            full_name,
                            Some(auth0_user_id),
                            None, // Default role
                            tx,
                        ).await?;
                        
                        return self.get_by_id_with_executor(&user_id, tx).await;
                    },
                    Err(e) => return Err(e), // Other database errors
                }
            },
            Err(e) => return Err(e), // Other database errors
        }
    }
    
    // Store Auth0 refresh token
    pub async fn store_auth0_refresh_token(&self, user_id: &Uuid, refresh_token: &Vec<u8>) -> Result<(), AppError> {
        query!(
            r#"
            UPDATE users
            SET auth0_refresh_token = $1,
                updated_at = now()
            WHERE id = $2
            "#,
            refresh_token as &[u8],
            user_id
        )
        .execute(&self.db_pool)
        .await
        .map_err(|e| AppError::Database(format!("Failed to store Auth0 refresh token: {}", e)))?;
        
        Ok(())
    }
    
    // Get Auth0 refresh token
    pub async fn get_auth0_refresh_token(&self, user_id: &Uuid) -> Result<Option<Vec<u8>>, AppError> {
        let result = query!(
            r#"
            SELECT auth0_refresh_token as "auth0_refresh_token: Vec<u8>"
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