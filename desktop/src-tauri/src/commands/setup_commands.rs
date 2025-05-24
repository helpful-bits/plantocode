use keyring::Entry;
use log::{info, warn, error};
use crate::auth::token_persistence; // To access SERVICE_NAME and ACCOUNT_NAME
use crate::constants::USE_SESSION_STORAGE;

#[tauri::command]
pub fn trigger_initial_keychain_access() -> Result<(), String> {
    // Skip keychain access if using session storage
    if USE_SESSION_STORAGE {
        info!("Using session storage mode - skipping keychain access trigger");
        return Ok(());
    }

    info!("Attempting to trigger initial keychain access for onboarding.");

    // Use the same service and account names that will be used for actual token storage.
    // This ensures the "Always Allow" permission applies to the correct item.
    let entry = Entry::new(token_persistence::SERVICE_NAME_FOR_KEYRING, token_persistence::ACCOUNT_NAME_FOR_KEYRING)
        .map_err(|e| {
            error!("Onboarding: Keychain entry creation failed: {}", e);
            format!("Keychain setup failed (entry creation): {}", e)
        })?;

    // Attempting to get a password for a non-existent item or setting a dummy one
    // will trigger the prompt if permissions aren't already granted.
    // Let's try to read first; if it's not there, OS might not prompt.
    // Setting a value is a more reliable way to trigger the prompt.
    match entry.set_password("initial_setup_check") {
        Ok(_) => {
            info!("Onboarding: Initial keychain interaction (set) successful.");
            // It's good practice to clean up this dummy entry if it's not the actual token.
            // However, if the user "Always Allows", this item is now accessible.
            // The actual token will just overwrite it. If they deny, then this set failed.
            // For simplicity in this step, we'll let it be overwritten by the real token later.
            // If you want to be cleaner, you can delete it:
            // if entry.delete_password().is_err() {
            //     warn!("Onboarding: Could not delete temporary keychain item. This is likely fine.");
            // }
            Ok(())
        }
        Err(keyring::Error::NoStorageAccess(_)) => {
            warn!("Onboarding: User denied keychain access during initial setup.");
            Err("Keychain access was denied. Vibe Manager needs this to securely store your session.".to_string())
        }
        Err(e) => {
            error!("Onboarding: Keychain interaction (set) failed: {}", e);
            Err(format!("An error occurred with Keychain: {}. Please ensure Keychain is accessible.", e))
        }
    }
}