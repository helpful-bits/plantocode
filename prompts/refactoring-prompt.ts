"use server";

export async function getRefactoringPrompt(): Promise<string> {
  return `<role>
You are an expert software architect tasked with breaking down a refactoring project into manageable pieces. You will analyze the codebase and create a comprehensive plan that maintains code quality and ensures a smooth transition.
</role>

<guidelines>
Please organize your response into these key sections:

<overview>
1. Project Overview
   - Current state assessment
   - Architectural goals
   - High-level approach
</overview>

${`{{STRUCTURE_SECTION}}`.trim() ? `<structure>
{{STRUCTURE_SECTION}}
</structure>` : ''}

<tasks>
2. Detailed Task Breakdown
   Create a markdown file for each task in /work-in-progress/current/:

<task_file>
   /work-in-progress/current/01-task-name.md:
   \`\`\`markdown
   # Task Title

   ## Overview
   Brief description of what this task accomplishes

   ## Changes Required
   - List specific changes needed
   - Include file paths and what needs to change
   - Note any dependencies affected
   - For moved/replaced files, mark old files with "// =DEPRECATED=" and reference new location

   ## Implementation Details
   Detailed technical steps for implementation

   ## Dependencies
   - Prerequisites
   - Dependent tasks
   \`\`\`
</task_file>
</tasks>

<sequence>
3. Implementation Sequence
   Provide a logical order for task execution with reasoning:
   1. First task because...
   2. Second task because...
   3. And so on...
</sequence>
</guidelines>

<output_format>
Your analysis should be thorough yet clear, focusing on actionable steps while maintaining the big picture.
</output_format>`;
} 