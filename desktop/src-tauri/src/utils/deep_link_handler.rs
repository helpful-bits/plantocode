use log::{info, warn};
use tauri::{AppHandle, Listener, Emitter};

/// Register deep links for the application and set up event listeners
/// 
/// This function handles cross-platform deep link registration and forwarding
/// of deep link events to the frontend.
pub fn register_deep_links(app_handle: &AppHandle) {
    // Register deep links for auth callbacks
    const SCHEME: &str = "vibe-manager";
    
    // Register the custom protocol - Tauri handles this in tauri.conf.json on macOS
    #[cfg(any(target_os = "windows", target_os = "linux"))]
    {
        // On Windows and Linux, register deep links at runtime
        if let Err(e) = tauri_plugin_deep_link::register(SCHEME) {
            warn!("Failed to register deep link handler: {}", e);
        }
    }
    
    // Listen for deep link events and forward to the frontend
    let app_handle_clone = app_handle.clone();
    // Using Tauri 2's updated event API 
    app_handle.listen("tauri://deep-link", move |event| {
        // Get the payload as a string directly or as an Option if needed
        let payload = event.payload().to_string();
        info!("Deep link received: {}", payload);
        // Forward to frontend using updated API
        app_handle_clone.emit("deep-link", payload).ok();
    });
    
    info!("Deep link handler registered for scheme: {}", SCHEME);
}