use crate::error::{AppError, AppResult};
use std::path::Path;
use tokio::process::Command;

/// Default threshold for long videos: 2 minutes in seconds
pub const DEFAULT_LONG_VIDEO_THRESHOLD_SECS: u64 = 120;

/// Resolve the long video threshold from environment or use default
pub fn resolve_long_threshold_secs() -> u64 {
    std::env::var("VIDEO_LONG_THRESHOLD_SECS")
        .ok()
        .and_then(|s| s.parse().ok())
        .unwrap_or(DEFAULT_LONG_VIDEO_THRESHOLD_SECS)
}

/// Verify that ffmpeg and ffprobe sidecars are available
pub async fn verify_sidecars_available() -> AppResult<()> {
    // Check ffmpeg
    let ffmpeg_result = Command::new("ffmpeg")
        .arg("-version")
        .output()
        .await;

    if ffmpeg_result.is_err() || !ffmpeg_result.as_ref().unwrap().status.success() {
        return Err(AppError::Processing(
            "FFmpeg is not available. Please ensure FFmpeg sidecar is installed to process long videos.".to_string()
        ));
    }

    // Check ffprobe
    let ffprobe_result = Command::new("ffprobe")
        .arg("-version")
        .output()
        .await;

    if ffprobe_result.is_err() || !ffprobe_result.as_ref().unwrap().status.success() {
        return Err(AppError::Processing(
            "FFprobe is not available. Please ensure FFmpeg sidecar is installed to process long videos.".to_string()
        ));
    }

    Ok(())
}

/// Probe video duration in milliseconds using ffprobe
pub async fn probe_duration_ms(path: &Path) -> AppResult<i64> {
    let output = Command::new("ffprobe")
        .args(&[
            "-v", "error",
            "-show_entries", "format=duration",
            "-of", "csv=p=0",
        ])
        .arg(path)
        .output()
        .await
        .map_err(|e| AppError::Processing(format!("Failed to run ffprobe: {}", e)))?;

    if !output.status.success() {
        return Err(AppError::Processing(
            format!("FFprobe failed: {}", String::from_utf8_lossy(&output.stderr))
        ));
    }

    let duration_str = String::from_utf8_lossy(&output.stdout).trim().to_string();

    // Try parsing as f64, if that fails (e.g., "N/A" for WebM), try stream duration
    if let Ok(duration_secs) = duration_str.parse::<f64>() {
        return Ok((duration_secs * 1000.0) as i64);
    }

    // Fallback: probe stream duration for files without container duration (like WebM)
    let stream_output = Command::new("ffprobe")
        .args(&[
            "-v", "error",
            "-select_streams", "v:0",
            "-show_entries", "stream=duration",
            "-of", "csv=p=0",
        ])
        .arg(path)
        .output()
        .await
        .map_err(|e| AppError::Processing(format!("Failed to run ffprobe for stream duration: {}", e)))?;

    if stream_output.status.success() {
        let stream_duration_str = String::from_utf8_lossy(&stream_output.stdout).trim().to_string();
        if let Ok(duration_secs) = stream_duration_str.parse::<f64>() {
            return Ok((duration_secs * 1000.0) as i64);
        }
    }

    // Final fallback: calculate from frame count and framerate (for WebM without duration metadata)
    let frame_output = Command::new("ffprobe")
        .args(&[
            "-v", "error",
            "-count_packets",
            "-select_streams", "v:0",
            "-show_entries", "stream=nb_read_packets,r_frame_rate",
            "-of", "csv=p=0",
        ])
        .arg(path)
        .output()
        .await
        .map_err(|e| AppError::Processing(format!("Failed to run ffprobe for frame count: {}", e)))?;

    if frame_output.status.success() {
        let frame_data = String::from_utf8_lossy(&frame_output.stdout).trim().to_string();
        // Expected format: "num/den,frame_count" e.g., "17/12,155"
        let parts: Vec<&str> = frame_data.split(',').collect();
        if parts.len() == 2 {
            if let (Ok(frame_count), Some((num, den))) = (
                parts[1].parse::<f64>(),
                parts[0].split_once('/').and_then(|(n, d)| {
                    Some((n.parse::<f64>().ok()?, d.parse::<f64>().ok()?))
                })
            ) {
                let fps = num / den;
                if fps > 0.0 {
                    let duration_secs = frame_count / fps;
                    return Ok((duration_secs * 1000.0) as i64);
                }
            }
        }
    }

    Err(AppError::Processing(
        format!("Could not determine video duration. Format duration: '{}', all fallback methods failed", duration_str)
    ))
}

/// Split video into chunks and return metadata for each chunk
/// Returns Vec<(index, path, start_ms, end_ms)>
pub async fn split_video_into_chunks(
    input: &Path,
    out_dir: &Path,
    chunk_secs: u32,
    target_fps: Option<f32>,
) -> AppResult<Vec<(usize, std::path::PathBuf, i64, i64)>> {
    // Ensure output directory exists
    tokio::fs::create_dir_all(out_dir)
        .await
        .map_err(|e| AppError::Processing(format!("Failed to create chunk directory: {}", e)))?;

    let pattern = out_dir.join("chunk_%05d.mp4");
    let pattern_str = pattern.to_str()
        .ok_or_else(|| AppError::Processing("Invalid chunk path".to_string()))?;

    // Build FFmpeg command based on target FPS
    let mut cmd = Command::new("ffmpeg");
    cmd.arg("-y")
        .arg("-i")
        .arg(input);

    if let Some(fps) = target_fps {
        if fps < 1.0 {
            // Re-encode with FPS filter for sub-1 FPS
            cmd.args(&[
                "-vf", &format!("fps={}", fps),
                "-c:v", "libx264",
                "-preset", "veryfast",
                "-crf", "28",
                "-g", "60",
                "-an",
            ]);
        } else {
            // Fast copy for fps >= 1
            cmd.args(&["-c", "copy", "-map", "0"]);
        }
    } else {
        // Fast copy by default
        cmd.args(&["-c", "copy", "-map", "0"]);
    }

    cmd.args(&[
        "-f", "segment",
        "-segment_time", &chunk_secs.to_string(),
        "-reset_timestamps", "1",
        pattern_str,
    ]);

    let output = cmd.output()
        .await
        .map_err(|e| AppError::Processing(format!("Failed to run ffmpeg: {}", e)))?;

    if !output.status.success() {
        return Err(AppError::Processing(
            format!("FFmpeg segmentation failed: {}", String::from_utf8_lossy(&output.stderr))
        ));
    }

    // Probe total duration for accurate last chunk end time
    let total_duration_ms = probe_duration_ms(input).await.unwrap_or(0);

    // Read directory and collect chunk files
    let mut entries = tokio::fs::read_dir(out_dir)
        .await
        .map_err(|e| AppError::Processing(format!("Failed to read chunk directory: {}", e)))?;

    let mut chunks = Vec::new();
    while let Some(entry) = entries.next_entry()
        .await
        .map_err(|e| AppError::Processing(format!("Failed to read directory entry: {}", e)))?
    {
        let path = entry.path();
        if let Some(name) = path.file_name().and_then(|n| n.to_str()) {
            if name.starts_with("chunk_") && name.ends_with(".mp4") {
                chunks.push(path);
            }
        }
    }

    // Sort chunks by filename (lexicographic order ensures temporal order due to zero-padding)
    chunks.sort();

    // Build result with index and time boundaries
    let result: Vec<_> = chunks.into_iter()
        .enumerate()
        .map(|(idx, path)| {
            let start_ms = (idx as i64) * (chunk_secs as i64) * 1000;
            let mut end_ms = ((idx + 1) as i64) * (chunk_secs as i64) * 1000;

            // Cap last chunk end time to actual video duration
            if total_duration_ms > 0 && end_ms > total_duration_ms {
                end_ms = total_duration_ms;
            }

            (idx, path, start_ms, end_ms)
        })
        .collect();

    Ok(result)
}
