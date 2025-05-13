"use strict";

/**
 * Generates a prompt for text improvement with optional formatting preservation
 */
export function generateTextImprovementPrompt(
  text: string,
  preserveFormatting: boolean = true
): string {
  const formattingInstructions = preserveFormatting ? 
    `while EXACTLY preserving its formatting style, including:
- All line breaks
- All indentation
- All bullet points and numbering
- All blank lines
- All special characters and symbols

Do not change the formatting structure at all.` : '';

  return `Please improve the following text to make it clearer (and grammatically correct) ${formattingInstructions}

IMPORTANT: Keep the original language of the text.

Here is the text to improve:
${text}

Return only the improved text without any additional commentary.`;
}