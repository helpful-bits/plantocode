"use server";
import { callAnthropicAPI } from "@/lib/anthropic";
import { ActionState } from "@/types";

function isValidRegex(pattern: string): boolean {
  try {
    new RegExp(pattern);
    return true;
  } catch (e) {
    return false;
  }
}

export async function generateRegexPatternsAction(
  description: string,
  directoryTree?: string,
): Promise<ActionState<{ titleRegex?: string; contentRegex?: string }>> {
  if (!description || !description.trim()) {
    return { isSuccess: false, message: "Pattern description cannot be empty." };
  }

  try {
    let structureContext = "";
    // Add context from the project structure if available
    if (directoryTree && directoryTree.trim()) {
      structureContext = `
To help with generating more accurate regex patterns, here is the current project directory structure:
\`\`\`
${directoryTree}
\`\`\`

Consider this structure when creating patterns to match files in the appropriate directories.
`;
    } // Close if statement

    const payload: { messages: { role: string; content: string }[], max_tokens: number } = {
      max_tokens: 1024,
      messages: [{
          role: "user",
          content: `Based on the following description of file patterns, generate appropriate JavaScript-compatible regular expressions for matching file paths (filenames/titles) and file content.${structureContext}

Description: "${description}"

Provide the output ONLY as a JSON object with the keys "titleRegex" and "contentRegex". If a pattern is not applicable or cannot be generated for a category, omit the key or set its value to an empty string. Do not include any explanatory text outside the JSON object. Escaped backslashes are needed for JSON strings containing regex.
Output *only* the raw JSON object, without any markdown formatting (like \`\`\`json).
IMPORTANT: Do NOT use inline flags like (?i) or lookarounds within the regex patterns. Standard, widely compatible JavaScript RegExp syntax only.
Example for "Find all TypeScript files in components folder":
{
  "titleRegex": "^components\\/.*\\\\.tsx?$",
  "contentRegex": ""
}

Example for "Find files using 'useState' hook":
{
  "titleRegex": "",
  "contentRegex": "import\\s+.*?{\\s*.*?useState.*?\\s*}\\s*from\\s+['\\\"]react['\\\"]|React\\.useState"
}

Example for "Find Markdown files containing 'TODO'":
{
  "titleRegex": "\\\\.md$",
  "contentRegex": "TODO"
}

Now, generate the JSON for the provided description.`,
        },
      ],
    };
    console.log("Sending payload to Anthropic for regex generation...");

    const result: ActionState<string> = await callAnthropicAPI(payload);

    if (!result.isSuccess || !result.data) {
      console.error("Anthropic API call failed:", result.message);
      return { isSuccess: false, message: result.message || "Failed to generate regex patterns via Anthropic" };
    }

    const jsonResponse = result.data;
    if (!jsonResponse) {
      console.error("Anthropic returned an empty text response.");
      return { isSuccess: false, message: "Anthropic returned an empty text response." };
    }

    try {
      console.log("Raw JSON response string from Anthropic:", jsonResponse);

      // Attempt to extract JSON from potential markdown code blocks
      const jsonMatch = jsonResponse.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
      const cleanedJsonResponse = (jsonMatch ? jsonMatch[1] : jsonResponse).trim();

      console.log("Cleaned JSON response string:", cleanedJsonResponse);
      const patterns = JSON.parse(cleanedJsonResponse);

      const titleRegex = patterns.titleRegex || "";
      const contentRegex = patterns.contentRegex || "";

      if (titleRegex && !isValidRegex(titleRegex)) {
        throw new Error(`AI generated an invalid title regex: ${titleRegex}`);
      }
      if (contentRegex && !isValidRegex(contentRegex)) {
        throw new Error(`AI generated an invalid content regex: ${contentRegex}`);
      }
      return {
        isSuccess: true,
        message: "Regex patterns generated successfully",
        data: { titleRegex, contentRegex }
      };
    } catch (err: any) {
      console.error("Error parsing JSON response:", err, jsonResponse);
      let parseErrorMsg = `Failed to parse Anthropic response: ${err.message}`;
      if (err instanceof SyntaxError && err.message.includes("Unterminated string")) {
      }
      return { isSuccess: false, message: parseErrorMsg };
    }
  } catch (error) {
    console.error("Error generating regex patterns:", error);
    return {
      isSuccess: false,
      message: error instanceof Error ? error.message : "Failed to generate regex patterns"
    };
  }
}
