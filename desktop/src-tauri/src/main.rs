#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use app::run;

#[cfg(not(any(target_os = "android", target_os = "ios")))]
fn main() {
    let _ = fix_path_env::fix();
    run();
}

#[cfg(any(target_os = "android", target_os = "ios"))]
fn main() {
    run();
}
