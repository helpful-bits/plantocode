"use server";
import claudeClient from "@/lib/api/claude-client";
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
  taskDescription: string,
  directoryTree?: string,
): Promise<ActionState<{ titleRegex?: string; contentRegex?: string }>> {
  if (!taskDescription || !taskDescription.trim()) {
    return { isSuccess: false, message: "Task description cannot be empty." };
  }

  try {
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

    const payload: { messages: { role: string; content: string }[], max_tokens: number } = {
      max_tokens: 1024,
      messages: [{
          role: "user",
          content: `Based on the following task description, identify the user's intent regarding file selection and generate appropriate JavaScript-compatible regular expressions for matching file paths (titles) and file content.${structureContext}

Task Description: "${taskDescription}"

IMPORTANT: The generated patterns will be used in an OR relationship - files matching EITHER the titleRegex OR the contentRegex will be included in the results. You don't need to combine both patterns into one; they will be applied separately.

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

Now, generate the JSON for the provided task description.`,
        }, // Close user message
      ],
    };
    console.log("Sending payload to Anthropic for regex generation...");

    const result: ActionState<string> = await claudeClient.sendRequest(payload);

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
      
      // Try to sanitize the JSON string before parsing
      let sanitizedJson = cleanedJsonResponse;
      // Handle potential issues with escaped backslashes in regex patterns
      try {
        // First attempt - try regular JSON.parse
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
      } catch (parseError) {
        console.error("Initial JSON parse failed, attempting to sanitize:", parseError);
        
        // Second attempt - try to fix common JSON escaping issues
        try {
          // Convert single backslashes to double in regex patterns (common issue)
          sanitizedJson = sanitizedJson.replace(/([^\\])\\([^\\"])/g, '$1\\\\$2');
          
          // Sometimes Claude doesn't properly escape quotes inside regex patterns
          sanitizedJson = sanitizedJson.replace(/([^\\])"/g, '$1\\"').replace(/^"/, '\\"');
          
          // Try to create a simpler JSON structure manually
          const titleMatch = sanitizedJson.match(/"titleRegex"\s*:\s*"([^"]*?)(?<!\\)"/);
          const contentMatch = sanitizedJson.match(/"contentRegex"\s*:\s*"([^"]*?)(?<!\\)"/);
          
          const titleRegex = titleMatch ? titleMatch[1].replace(/\\"/g, '"') : "";
          const contentRegex = contentMatch ? contentMatch[1].replace(/\\"/g, '"') : "";
          
          console.log("Extracted patterns manually:", { titleRegex, contentRegex });
          
          if (titleRegex && !isValidRegex(titleRegex)) {
            throw new Error(`AI generated an invalid title regex: ${titleRegex}`);
          }
          if (contentRegex && !isValidRegex(contentRegex)) {
            throw new Error(`AI generated an invalid content regex: ${contentRegex}`);
          }
          
          return {
            isSuccess: true,
            message: "Regex patterns extracted successfully",
            data: { titleRegex, contentRegex }
          };
        } catch (extractError) {
          console.error("Failed to extract regex patterns:", extractError);
          // Keep the existing error handling
          throw parseError;
        }
      }
    } catch (err: any) {
      console.error("Error parsing JSON response:", err, jsonResponse);
      let parseErrorMsg = `Failed to parse Anthropic response: ${err.message}`;
      return { isSuccess: false, message: parseErrorMsg };
    }
  } catch (error) {
    return {
      isSuccess: false,
      message: error instanceof Error ? error.message : "Failed to generate regex patterns",
    };
  }
}
