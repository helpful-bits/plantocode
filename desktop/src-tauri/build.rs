//! Build script for the Vibe Manager desktop application.
//! This script uses the tauri build system to compile the application.

/// Main build function that initializes the Tauri build process.
fn main() {
    #[cfg(target_os = "macos")]
    println!("cargo:rustc-link-lib=framework=ScreenCaptureKit");
    
    tauri_build::build();
}
