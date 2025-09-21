use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize)]
pub struct GeoDetectionResponse {
    pub country: String,
    pub region: String, // "us" or "eu"
}

#[tauri::command]
pub async fn detect_user_region_command() -> Result<GeoDetectionResponse, String> {
    // Try to detect via website's geo API
    let client = reqwest::Client::new();

    let response = client
        .head("https://vibemanager.app/api/geo")
        .header("User-Agent", "VibeManager-Desktop/1.0")
        .send()
        .await
        .map_err(|e| format!("Failed to call geo API: {}", e))?;

    let country = response
        .headers()
        .get("X-User-Country")
        .and_then(|v| v.to_str().ok())
        .unwrap_or("XX")
        .to_string();

    // Map country to region
    let region = match country.as_str() {
        "US" => "us",
        // EU countries
        "AT" | "BE" | "BG" | "HR" | "CY" | "CZ" | "DK" | "EE" | "FI" | "FR" | "DE" | "GR"
        | "HU" | "IE" | "IT" | "LV" | "LT" | "LU" | "MT" | "NL" | "PL" | "PT" | "RO" | "SK"
        | "SI" | "ES" | "SE" | "IS" | "LI" | "NO" | "GB" => "eu",
        _ => "eu", // Default to EU for unknown (more restrictive)
    };

    Ok(GeoDetectionResponse {
        country,
        region: region.to_string(),
    })
}
