//! Build script for the Vibe Manager desktop application.
//! This script uses the tauri build system to compile the application.

/// Main build function that initializes the Tauri build process.
fn main() {
    // Load .env file if it exists (for local builds)
    if let Ok(_) = dotenvy::dotenv() {
        println!("cargo:warning=Loaded .env file for build");
    }
    
    // Set environment variables as compile-time constants
    // These will be embedded in the binary
    if let Ok(domain) = std::env::var("AUTH0_DOMAIN") {
        println!("cargo:rustc-env=AUTH0_DOMAIN={}", domain);
    }
    if let Ok(client_id) = std::env::var("AUTH0_NATIVE_CLIENT_ID") {
        println!("cargo:rustc-env=AUTH0_NATIVE_CLIENT_ID={}", client_id);
    }
    if let Ok(audience) = std::env::var("AUTH0_API_AUDIENCE") {
        println!("cargo:rustc-env=AUTH0_API_AUDIENCE={}", audience);
    }
    
    #[cfg(target_os = "macos")]
    println!("cargo:rustc-link-lib=framework=ScreenCaptureKit");
    
    tauri_build::build();
}
