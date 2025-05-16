/// Prompt template for correcting voice transcriptions
pub fn generate_voice_correction_prompt(transcribed_text: &str, language: &str) -> String {
    let language_instruction = if language.is_empty() || language.eq_ignore_ascii_case("en") {
        "The text is in English. Keep the English language, focusing on correcting grammar and readability.".to_string()
    } else {
        format!("The text is in {}. Please maintain the original language ({}) while correcting the text.", language, language)
    };

    let prompt = format!(
r#"You are a specialist in correcting and improving voice transcriptions. Your task is to correct the provided transcription, which was generated from a voice recording. The transcription may contain errors, filler words, repetitions, and other issues common in voice recognition systems or natural speech.

{language_instruction}

TRANSCRIBED TEXT:
{text}

Please correct and improve this transcription by:

1. Fixing any obvious transcription errors or mistranslations
2. Removing filler words (um, uh, like, you know, etc.) unless they are essential to the meaning
3. Eliminating false starts and repetitions
4. Correcting grammar and syntax issues while preserving the speaker's voice and intent
5. Ensuring proper punctuation, capitalization, and paragraph structure
6. Preserving technical terms, names, and specialized vocabulary
7. Maintaining the original meaning and intent of the speaker

Please provide your response in the following format:

<voice_correction>
  <corrected_text>
    The fully corrected and improved transcription, properly formatted with paragraphs, punctuation, and proper grammar.
  </corrected_text>
  
  <changes>
    <change>Description of significant correction or improvement 1</change>
    <change>Description of significant correction or improvement 2</change>
    <!-- Include any significant changes made -->
  </changes>
  
  <confidence>
    A brief assessment of your confidence in the corrections. Note any parts that were ambiguous or where multiple interpretations were possible.
  </confidence>
</voice_correction>

Ensure your corrections maintain the original speaker's tone and intent while making the text clear, coherent, and grammatically correct."#,
    language_instruction = language_instruction,
    text = transcribed_text);

    prompt
}

/// Simplified version of the voice correction prompt that only returns the corrected text
pub fn generate_simple_voice_correction_prompt(text: &str, language: &str) -> String {
    let language_instruction = if language.is_empty() || language.eq_ignore_ascii_case("en") {
        "The text is in English. Keep the English language, focusing on correcting grammar and readability.".to_string()
    } else {
        format!("The text is in {}. Please maintain the original language ({}) while correcting the text.", language, language)
    };

    format!(
r#"You are an expert at correcting text transcribed from voice input. Your task is to correct this voice-to-text transcription, fixing grammar, punctuation, and phrasing to make it read naturally while preserving the original meaning.

{language_instruction}

VOICE TRANSCRIPTION:
{text}

Please provide the corrected text. Maintain the original meaning and intent, but improve readability and correct any obvious transcription errors. Do not add explanations or comments - only return the corrected text.

IMPORTANT GUIDELINES:
- Fix grammar, punctuation, and sentence structure
- Correct obvious transcription errors and misheard words
- Use appropriate technical terminology if the context is technical
- Keep the same tone and style as the original
- Preserve the original meaning
- Do not add new information or change the intent
- Do not add explanations or comments - only return the corrected text

Respond with ONLY the corrected text."#,
        language_instruction = language_instruction,
        text = text
    )
}