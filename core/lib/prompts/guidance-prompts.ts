"use strict";

/**
 * Generates a prompt for architectural guidance as a concise data flow narrative
 */
export function generateGuidanceForPathsPrompt(
  taskDescription: string,
  paths: string[],
  fileContents?: Record<string, string>
): string {
  // Build file content sections if available
  let fileContentSections = '';
  if (fileContents) {
    fileContentSections = `
  <file_contents>
${Object.entries(fileContents).map(([path, content]) => `    <file path="${path}"><![CDATA[${content}]]></file>`).join('\n')}
  </file_contents>`;
  }

  return `<architectural_guidance_query>
  <task_description><![CDATA[${taskDescription}]]></task_description>

  <relevant_files>
${paths.map(p => `    <file>${p}</file>`).join('\n')}
  </relevant_files>${fileContentSections}

  <response_format>
    Create a concise narrative in Markdown that directly explains the data flow and architecture.

    Your response must be brief and focused primarily on:

    1. The specific path data takes through the system
    2. How data is transformed between components
    3. The key function calls in sequence
    4. Clear, actionable implementation guidance
    5. No introduction, just the story

    Avoid lengthy, philosophical, or overly metaphorical explanations. The reader needs a clear, direct understanding of how data moves through the code. It has to be in engaging Andrew Huberman style (but without the science, just style of talking). The story has to be very short. Use simple English.

  </response_format>
</architectural_guidance_query>`;
}

