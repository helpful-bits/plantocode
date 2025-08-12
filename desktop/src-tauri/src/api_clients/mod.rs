// Root module for API clients
pub mod billing_client;
pub mod client_factory;
pub mod client_trait;
pub mod consent_client;
pub mod error_handling;
pub mod server_proxy_client;

// Re-export API client components
pub use billing_client::*;
pub use client_factory::*;
pub use client_trait::*;
pub use consent_client::*;
pub use error_handling::*;
pub use server_proxy_client::*;
