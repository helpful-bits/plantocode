#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

#[cfg(not(any(target_os = "android", target_os = "ios")))]
fn main() {
    fix_path_env::fix();
    vibe_manager::run();
}

#[cfg(any(target_os = "android", target_os = "ios"))]
fn main() {
    vibe_manager::run();
}