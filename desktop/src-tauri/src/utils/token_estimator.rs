// This estimator is for non-critical, VISUAL UI updates ONLY and is NOT used for any billing calculations, which are handled authoritatively by the server.

/// Simple token estimation utilities for visual-only updates
/// 
/// This module provides heuristic-based token estimation for client-side UI updates.
/// This is used ONLY for visual feedback and is NOT used for billing calculations.
/// 
/// All billing and cost calculations are handled server-side with actual usage data.

use log::debug;

/// Estimate the number of tokens in a text string using a simple heuristic
/// 
/// This function uses a character-based approximation where roughly 4 characters
/// equal 1 token. This is a reasonable approximation for most languages and use cases.
/// 
/// # Arguments
/// 
/// * `text` - The text content to estimate tokens for
/// 
/// # Returns
/// 
/// Estimated token count as u32
pub fn estimate_tokens(text: &str) -> u32 {
    // Use 4 characters per token as a reasonable heuristic
    // This approximation works well for English and similar languages
    let char_count = text.chars().count() as u32;
    let estimated_tokens = (char_count + 3) / 4; // Round up division
    
    debug!("Estimated {} tokens from {} characters", estimated_tokens, char_count);
    
    // Ensure we return at least 1 token for non-empty text
    if text.is_empty() {
        0
    } else {
        estimated_tokens.max(1)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_estimate_tokens_empty() {
        assert_eq!(estimate_tokens(""), 0);
    }

    #[test]
    fn test_estimate_tokens_short() {
        assert_eq!(estimate_tokens("Hi"), 1);
        assert_eq!(estimate_tokens("Hello"), 2);
    }

    #[test]
    fn test_estimate_tokens_medium() {
        assert_eq!(estimate_tokens("Hello, world!"), 4); // 13 chars / 4 = 3.25, rounded up to 4
        assert_eq!(estimate_tokens("The quick brown fox"), 5); // 19 chars / 4 = 4.75, rounded up to 5
    }

    #[test]
    fn test_estimate_tokens_long() {
        let long_text = "The quick brown fox jumps over the lazy dog. This is a longer sentence to test token estimation.";
        let char_count = long_text.chars().count() as u32;
        let expected = (char_count + 3) / 4;
        assert_eq!(estimate_tokens(long_text), expected);
    }

    #[test]
    fn test_estimate_tokens_unicode() {
        // Unicode characters should be counted correctly
        assert_eq!(estimate_tokens("🦊🐕"), 1); // 2 chars
        assert_eq!(estimate_tokens("Hello 世界"), 3); // 8 chars
    }
}