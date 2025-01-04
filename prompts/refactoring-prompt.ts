"use server";

export async function getRefactoringPrompt(): Promise<string> {
  return `You are an expert software architect. Please analyze the codebase and break down the refactoring into smaller, manageable tasks.

Your response should follow this structure:

1. OVERVIEW
- Brief summary of the current state
- Key architectural goals of the refactoring
- High-level approach to changes

{{STRUCTURE_SECTION}}

3. TASK BREAKDOWN
For each task, create a markdown file in the /work-in-progress/current/ directory:

/work-in-progress/current/01-task-name.md:
\`\`\`markdown
# Task Title

## Overview
Brief description of what this task accomplishes

## Changes Required
- List specific changes needed
- Include file paths and what needs to change
- Note any dependencies affected
- For files that need to be replaced or moved, create the new file and mark the old file with "// =DEPRECATED=" at the top, along with a comment indicating where the new file is

## Implementation Details
Detailed technical steps for implementation

## Dependencies
- List any tasks that must be completed first
- Note any tasks that depend on this one
\`\`\`

4. IMPLEMENTATION ORDER
Explain the recommended order for tackling the tasks:
1. First task because...
2. Second task because...
3. And so on...


Please analyze the provided code and task description to create a detailed task breakdown following this format.`;
} 