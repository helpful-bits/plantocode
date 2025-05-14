pub mod connection;
pub mod repositories;

// Re-export the connection module's functions for ease of use
pub use connection::{create_pool, verify_connection};
pub use repositories::*;