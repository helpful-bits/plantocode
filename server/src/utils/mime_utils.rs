use crate::error::AppError;

/// Get MIME type from file extension
pub fn get_mime_type_from_filename(filename: &str) -> Result<&'static str, AppError> {
    let extension = std::path::Path::new(filename)
        .extension()
        .and_then(std::ffi::OsStr::to_str)
        .unwrap_or("").to_lowercase();
        
    match extension.as_str() {
        "mp3" => Ok("audio/mpeg"),
        "wav" => Ok("audio/wav"),
        "m4a" => Ok("audio/x-m4a"),
        "ogg" => Ok("audio/ogg"),
        "webm" => Ok("audio/webm"),
        "flac" => Ok("audio/flac"),
        "aac" => Ok("audio/aac"),
        "mp4" => Ok("audio/mp4"),
        "" => Err(AppError::Validation("Audio file has no extension".to_string())),
        _ => Err(AppError::Validation(format!("Unsupported audio file extension for transcription: .{}", extension))),
    }
}