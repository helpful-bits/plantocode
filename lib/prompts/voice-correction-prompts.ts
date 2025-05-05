"use strict";

/**
 * Generates the system prompt for voice-to-text correction
 */
export function generateVoiceCorrectionSystemPrompt(language: string = 'en'): string {
  return `You are a helpful, accurate assistant that specializes in refining verbally dictated text. 
When given transcribed speech, you will:
1. Fix grammar, spelling, and punctuation errors
2. Improve sentence structure and clarity
3. Make the language more professional and coherent
4. Preserve the original meaning and intent
5. Maintain important technical terms and concepts

When reformatting, focus on making the text more suitable for a written technical document. 
Do not add new concepts or information not present in the original.
Language: ${language}`;
}

/**
 * Generates the user prompt for voice-to-text correction
 */
export function generateVoiceCorrectionUserPrompt(rawText: string): string {
  return `Here is a transcription of verbally dictated text that needs to be refined into clear, professional written form:

${rawText}

Please correct and improve this text while maintaining its original meaning and technical content.`;
}