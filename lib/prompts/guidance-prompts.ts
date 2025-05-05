"use strict";

/**
 * Generates a prompt for file-specific guidance
 */
export function generateGuidanceForPathsPrompt(
  taskDescription: string,
  paths: string[]
): string {
  return `
Task: ${taskDescription}

Files that will be used to accomplish this task:
${paths.map(p => `- ${p}`).join('\n')}

Please provide guidance on:
1. The overall approach to accomplish this task
2. The specific role of each listed file in the solution
3. Key functions and changes that would need to be implemented
4. Any potential challenges or edge cases to consider

Structure your guidance in a clear, step-by-step format.
`;
}

/**
 * Generates a prompt for task guidance based on the specified guidance type
 */
export function generateTaskGuidancePrompt(
  taskDescription: string,
  projectSummary: string,
  guidanceType: 'full' | 'planning' | 'structured' = 'full'
): string {
  switch (guidanceType) {
    case 'planning':
      return `
Task: ${taskDescription}

Project summary:
${projectSummary}

Based on this information, please generate a comprehensive plan for implementing this task. The plan should include:

1. An analysis of what the task requires
2. A step-by-step breakdown of the implementation
3. The files that will need to be modified or created
4. Potential challenges or considerations

Please provide specific details and actionable steps.
`;

    case 'structured':
      return `
Task: ${taskDescription}

Project summary:
${projectSummary}

Please provide a structured analysis and implementation guide for this task with the following sections:

## Understanding the Task
[Brief analysis of what the task requires]

## Implementation Steps
1. [First step with details]
2. [Second step with details]
...

## Files to Modify
- [File path]: [Description of changes]
...

## Testing Approach
[How to verify the implementation works correctly]

## Potential Challenges
[List of challenges or considerations]
`;

    case 'full':
    default:
      return `
Task: ${taskDescription}

Project summary:
${projectSummary}

Please provide detailed guidance on how to implement this task, including:

1. Analysis of the task requirements
2. Step-by-step implementation plan
3. Specific files to modify and how to modify them
4. Code examples where helpful
5. Testing approach
6. Any considerations or edge cases to be aware of

The guidance should be thorough and actionable, enabling a developer to complete the task efficiently.
`;
  }
}