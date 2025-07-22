use log::debug;
use std::env;

/// Read an environment variable with fallback to a default value
///
/// This function centralizes the environment variable fallback logic,
/// including handling of VITE_ prefixed variables from the frontend build.
///
/// Arguments:
/// * `key` - The environment variable name without any prefix
/// * `default` - The default value to use if the variable is not found
/// * `prefer_unprefixed` - Whether to prefer the unprefixed version over VITE_ prefixed
///
/// Returns:
/// The environment variable value or the default
pub fn read_env(key: &str, default: &str, prefer_unprefixed: bool) -> String {
    // Try the standard variable first if preferred
    let env_var = if prefer_unprefixed {
        env::var(key).or_else(|_| env::var(format!("VITE_{}", key)))
    } else {
        // Try VITE_ prefixed first, then fall back to unprefixed
        env::var(format!("VITE_{}", key)).or_else(|_| env::var(key))
    };

    // Fall back to default
    let value = env_var.unwrap_or_else(|_| default.to_string());

    debug!("Environment variable {} resolved to: {}", key, value);
    value
}

/// Read an environment variable with boolean conversion
///
/// Arguments:
/// * `key` - The environment variable name without any prefix
/// * `default` - The default value to use if the variable is not found
/// * `prefer_unprefixed` - Whether to prefer the unprefixed version over VITE_ prefixed
///
/// Returns:
/// The environment variable value as a boolean
pub fn read_env_bool(key: &str, default: bool, prefer_unprefixed: bool) -> bool {
    let value = read_env(
        key,
        if default { "true" } else { "false" },
        prefer_unprefixed,
    );

    // Convert to boolean - "true", "1", "yes", "y" are considered true
    let lower_value = value.to_lowercase();
    lower_value == "true" || lower_value == "1" || lower_value == "yes" || lower_value == "y"
}

/// Read an environment variable with numeric conversion
///
/// Arguments:
/// * `key` - The environment variable name without any prefix
/// * `default` - The default value to use if the variable is not found
/// * `prefer_unprefixed` - Whether to prefer the unprefixed version over VITE_ prefixed
///
/// Returns:
/// The environment variable value as a 64-bit integer
pub fn read_env_i64(key: &str, default: i64, prefer_unprefixed: bool) -> i64 {
    let value = read_env(key, &default.to_string(), prefer_unprefixed);

    // Convert to i64
    value.parse::<i64>().unwrap_or(default)
}

/// Read an environment variable with floating-point conversion
///
/// Arguments:
/// * `key` - The environment variable name without any prefix
/// * `default` - The default value to use if the variable is not found
/// * `prefer_unprefixed` - Whether to prefer the unprefixed version over VITE_ prefixed
///
/// Returns:
/// The environment variable value as a 64-bit float
pub fn read_env_f64(key: &str, default: f64, prefer_unprefixed: bool) -> f64 {
    let value = read_env(key, &default.to_string(), prefer_unprefixed);

    // Convert to f64
    value.parse::<f64>().unwrap_or(default)
}
