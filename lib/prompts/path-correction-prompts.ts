"use strict";

/**
 * Generates a prompt for path correction
 */
export function generatePathCorrectionPrompt(paths: string[]): string {
  return `
I have the following file paths that may contain errors or may not exist:
${paths.map(p => `- ${p}`).join('\n')}

Please correct these paths based on:
1. Most likely real paths in typical project structures
2. Usual naming conventions for files
3. What files would typically be needed

Return ONLY a list of corrected file paths, one per line.
`;
}