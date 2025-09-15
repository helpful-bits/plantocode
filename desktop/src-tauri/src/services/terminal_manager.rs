#[cfg(not(any(target_os = "android", target_os = "ios")))]
mod desktop;
#[cfg(not(any(target_os = "android", target_os = "ios")))]
pub use desktop::*;

#[cfg(any(target_os = "android", target_os = "ios"))]
mod mobile;
#[cfg(any(target_os = "android", target_os = "ios"))]
pub use mobile::*;