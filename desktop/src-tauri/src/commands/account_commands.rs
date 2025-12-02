use crate::error::AppResult;
use crate::services::AccountDeletionService;
use tauri::{command, AppHandle};

/// Delete the current user's account
///
/// This command performs a comprehensive account deletion:
/// - Calls the server to delete the account
/// - Shuts down DeviceLinkClient if present
/// - Clears the authentication token
/// - Clears the config cache
/// - Emits an "account-deleted" event
#[command]
pub async fn delete_account_command(app_handle: AppHandle) -> AppResult<()> {
    AccountDeletionService::delete_current_account(&app_handle).await
}
