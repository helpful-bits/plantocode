"use server";

import { callAnthropicAPI } from "@/lib/anthropic";
import { ActionState } from "@/types";

export async function generateRegexPatternsAction(
  description: string
): Promise<ActionState<{ titleRegex?: string; contentRegex?: string }>> {
  if (!process.env.ANTHROPIC_API_KEY) {
    return { isSuccess: false, message: "Anthropic API key not configured." };
  }
  if (!description?.trim()) {
    return { isSuccess: false, message: "Pattern description cannot be empty." };
  }

  try {
    const payload = {
      max_tokens: 500,
      messages: [
        {
          role: "user",
          content: `Based on the following description of file patterns, generate appropriate JavaScript-compatible regular expressions for matching file paths (filenames/titles) and file content.

Description: "${description}"

Provide the output ONLY as a JSON object with the keys "titleRegex" and "contentRegex". If a pattern is not applicable or cannot be generated for a category, omit the key or set its value to an empty string. Do not include any explanatory text outside the JSON object. Escaped backslashes are needed for JSON strings containing regex.

Example for "Find all TypeScript files in components folder":
{
  "titleRegex": "^components/.*\\.tsx?$",
  "contentRegex": ""
}

Example for "Find files using 'useState' hook":
{
  "titleRegex": "",
  "contentRegex": "import\\s+.*?{\\s*.*?useState.*?\\s*}\\s*from\\s+['\\\"]react['\\\"];|React\\.useState"
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

    const result = await callAnthropicAPI(payload, (data) => {
    const jsonResponse = data.content[0].text?.trim();

    if (!jsonResponse) {
       throw new Error("Anthropic returned an empty response.");
    }

    // Basic JSON cleaning
    const cleanedJsonResponse = jsonResponse.replace(/^```json\s*|```$/g, '').trim();
    const patterns = JSON.parse(cleanedJsonResponse);
    return { isSuccess: true, message: "Regex patterns generated", data: patterns };
    });

    if (!result.isSuccess) {
      throw new Error(result.message);
    }

    return result;

  } catch (error) {
    console.error("Error generating regex patterns:", error);
    return { 
      isSuccess: false, 
      message: error instanceof Error ? error.message : "Failed to generate regex patterns" 
    };
  }
}
