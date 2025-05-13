"use strict";

/**
 * Generates a prompt for regex pattern generation based on task description
 */
export function generateRegexPatternPrompt(
  taskDescription: string,
  directoryTree?: string
): string {
  let structureContext = "";
  if (directoryTree && directoryTree.trim()) {
    structureContext = `
To help with generating more accurate regex patterns, here is the current project directory structure:
\`\`\`
${directoryTree}
\`\`\`

Consider this structure when creating patterns to match files in the appropriate directories.
`;
  }

  return `Based on the following task description, identify the user's intent regarding file selection and generate appropriate JavaScript-compatible regular expressions for matching file paths (titles) and file content.${structureContext}

Task Description: "${taskDescription}"

IMPORTANT: The generated patterns will be used in an OR relationship - files matching EITHER the titleRegex OR the contentRegex will be included in the results. You don't need to combine both patterns into one; they will be applied separately.

CRITICAL: Your entire response must be ONLY the raw JSON object. Do NOT include any surrounding text, explanations, or markdown code fences like \`\`\`json ... \`\`\`. The response must start with '{' and end with '}'.

Provide the output with these keys:
- "titleRegex": Pattern to match file paths to INCLUDE
- "contentRegex": Pattern to match file content to INCLUDE
- "negativeTitleRegex": Pattern to match file paths to EXCLUDE
- "negativeContentRegex": Pattern to match file content to EXCLUDE

If a pattern is not applicable or cannot be generated for a category, omit the key or set its value to an empty string. Escaped backslashes are needed for JSON strings containing regex.
IMPORTANT: Do NOT use inline flags like (?i) or lookarounds within the regex patterns. Standard, widely compatible JavaScript RegExp syntax only.
Example for "Find all TypeScript files in components folder, but exclude test files":
{
  "titleRegex": "^components\\/.*\\\\.tsx?$",
  "contentRegex": "",
  "negativeTitleRegex": "\\\\.(test|spec)\\\\."
}

Example for "Find files using 'useState' hook but exclude those with 'deprecated' comments":
{
  "titleRegex": "",
  "contentRegex": "import\\s+.*?{\\s*.*?useState.*?\\s*}\\s*from\\s+['\\\"]react['\\\"]|React\\.useState",
  "negativeContentRegex": "deprecated"
}

Now, generate the JSON for the provided task description.`;
}