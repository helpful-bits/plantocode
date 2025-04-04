"use server";

import { callAnthropicAPI } from "@/lib/anthropic";
import { ActionState } from "@/types";

/**
 * Validates if a string is a valid JavaScript regular expression.
 */
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
  directoryTree?: string
): Promise<ActionState<{ titleRegex?: string; contentRegex?: string }>> {
  if (!process.env.ANTHROPIC_API_KEY) {
    return { isSuccess: false, message: "Anthropic API key not configured." };
  }
  if (!description?.trim()) {
    return { isSuccess: false, message: "Pattern description cannot be empty." };
  }

  try {
    // Add context from the project structure if available
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

    const payload = {
      max_tokens: 1024, // Increased max_tokens to allow for longer regex strings
      messages: [
        {
          role: "user",
          content: `Based on the following description of file patterns, generate appropriate JavaScript-compatible regular expressions for matching file paths (filenames/titles) and file content.${structureContext}

Description: "${description}"

Provide the output ONLY as a JSON object with the keys "titleRegex" and "contentRegex". If a pattern is not applicable or cannot be generated for a category, omit the key or set its value to an empty string. Do not include any explanatory text outside the JSON object. Escaped backslashes are needed for JSON strings containing regex.
Output *only* the raw JSON object, without any markdown formatting (like \`\`\`json).
IMPORTANT: Do NOT use inline flags like (?i) within the regex patterns. Standard JavaScript RegExp syntax only.
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

    console.log("Sending payload to Anthropic for regex generation:", JSON.stringify(payload, null, 2));

    const result = await callAnthropicAPI(payload, (data) => {
      console.log("Raw Anthropic response data:", JSON.stringify(data, null, 2));
      const jsonResponse = data.content[0].text?.trim();

      if (!jsonResponse) {
         console.error("Anthropic returned an empty text response.");
         throw new Error("Anthropic returned an empty text response.");
      }

      console.log("Raw JSON response string from Anthropic:", jsonResponse);

      try {
        // Attempt to extract JSON from potential markdown code blocks
        const jsonMatch = jsonResponse.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
        const cleanedJsonResponse = (jsonMatch ? jsonMatch[1] : jsonResponse).trim();

        console.log("Cleaned JSON response string:", cleanedJsonResponse);
        const patterns = JSON.parse(cleanedJsonResponse);
        console.log("Parsed patterns:", patterns);

        // Validate the generated regex patterns
        const titleRegex = patterns.titleRegex || "";
        const contentRegex = patterns.contentRegex || "";

        if (titleRegex && !isValidRegex(titleRegex)) {
          return { isSuccess: false, message: `AI generated an invalid title regex: ${titleRegex}`, data: patterns };
        }
        if (contentRegex && !isValidRegex(contentRegex)) {
          return { isSuccess: false, message: `AI generated an invalid content regex: ${contentRegex}`, data: patterns };
        }
        return { isSuccess: true, message: "Regex patterns generated", data: patterns };
      } catch (err) {
        console.error("Error parsing JSON response:", err, jsonResponse);
        let parseErrorMsg = `Failed to parse Anthropic response: ${err.message}`;
        if (err instanceof SyntaxError && err.message.includes("Unterminated string")) {
          parseErrorMsg += ". The response might have been truncated due to token limits.";
        }
        throw new Error(parseErrorMsg);
      }
    });

    // 'result' is ActionState<InnerResult>, where InnerResult might be an error state from processResponse
    if (!result.isSuccess) {
      // API call failed OR processResponse function returned failure
      console.error("Anthropic API call failed:", result.message);
      return { isSuccess: false, message: result.message || "Anthropic API call failed" };
    }

    // API call succeeded, processResponse also returned an object. Check its internal status.
    const processedResultData = result.data; // This is the InnerResult object returned by processResponse

    // Check if the InnerResult itself indicates failure (e.g., parsing or regex validation failed)
    if (!processedResultData.isSuccess) {
      console.error("Processing Anthropic response failed internally:", processedResultData.message);
      // Return the failure state from InnerResult
      return { isSuccess: false, message: processedResultData.message, data: processedResultData.data };
    }

    // Everything succeeded, return the successful state with valid regex data
    return { isSuccess: true, message: "Regex patterns generated successfully", data: processedResultData.data };

  } catch (error) {
    console.error("Error generating regex patterns:", error);
    return { 
      isSuccess: false, 
      message: error instanceof Error ? error.message : "Failed to generate regex patterns" 
    };
  }
}
