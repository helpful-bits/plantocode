//! Vibe Manager Server Library
//!
//! This library exports the core modules used by both the server binary
//! and utility binaries like the migration runner.

pub mod auth_stores;
pub mod clients;
pub mod config;
pub mod db;
pub mod error;
pub mod handlers;
pub mod middleware;
pub mod models;
pub mod routes;
pub mod security;
pub mod services;
pub mod streaming;
pub mod stripe_types;
pub mod utils;

// Re-export commonly used types for convenience
pub use config::AppSettings;
pub use error::AppError;
pub use models::runtime_config::AppState;
