// Module for service-layer functionality
pub mod command_handler_service;
pub mod api_handlers;
pub mod file_service;
pub mod task_services;
pub mod text_improvement_service;

// Re-export service modules
pub use command_handler_service::handle_command;
pub use file_service::*;
pub use task_services::*;
pub use text_improvement_service::*;
pub use api_handlers::*;