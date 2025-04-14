"use server";

export async function getPathFinderPrompt(): Promise<string> {
  return `<?xml version="1.0" encoding="UTF-8"?>
<prompt>
  <role>
    Analyze the codebase to identify all relevant files for the specified task. Be thorough and comprehensive in your analysis.
  </role>

  <task>
    1. Analyze code files and task description
    2. Identify ALL relevant files including code, dependencies, documentation, and configuration
    3. Prioritize accuracy and relevance based on the task. Include necessary files, but avoid excessive unrelated files.
    4. VERIFY that all file paths actually exist in the repository
    5. Output plain text file paths list and task description paragraph
  </task>

  <output_format>
    <description>
      Return your answer as plain text, not XML.

      Section 1: File Paths
      • Plain text list of paths, one per line
      • All paths relative to repository root
      • ONLY include paths that actually exist in the repository
      • Double-check all paths to ensure they are correct and relevant to the task
      • Be COMPREHENSIVE - include many relevant paths
      • ALWAYS include project documentation (README.md, docs/, etc.)
      • ALWAYS include relevant .cursor rules if they exist
      • Include all code files, dependencies, data structures, and config files
      • Include language-specific files (package.json, Cargo.toml, Package.swift)
      • Include ALL potentially relevant test files
      • Favor inclusion over exclusion - when in doubt, include the file

      Section 2: Task Description
      • Single comprehensive paragraph explaining the task
      • For complex tasks, paragraph may be longer and more detailed
      • Reference key files and data structures
      • Mention any cursor rules that may impact implementation
      • Provide clear implementation guidance
    </description>

    <template>
      <example_output>
File Paths:
src/components/ExampleComponent.js
src/components/RelatedComponent.js
src/hooks/useExample.js
src/hooks/useRelatedHook.js
src/types/index.ts
src/utils/helpers.js
package.json
README.md
docs/usage.md
docs/architecture.md
.cursor/rules
tests/components/ExampleComponent.test.js

Task Description:
Modify ExampleComponent.js to implement new feature using the hook system in src/hooks/useExample.js. Update data formats in types/index.ts and check dependencies in package.json. Reference the architecture documentation in docs/architecture.md for design patterns and ensure compliance with cursor rules that specify code style requirements. Consider how RelatedComponent.js and useRelatedHook.js interact with your changes, as they share dependencies. For complex tasks, provide more detailed explanation that thoroughly addresses all aspects of implementation, including potential challenges, integration points with existing systems, and guidance on handling edge cases.
      </example_output>
    </template>
  </output_format>

  <rules>
    <output_format>
      <rule>Format your response as plain text, not XML.</rule>
      <rule>Do not use XML tags in your response.</rule>
      <rule>Provide a direct text response with the two required sections.</rule>
    </output_format>

    <file_paths_section>
      <rule>Start with "File Paths:" header.</rule>
      <rule>List one path per line, relative to repository root.</rule>
      <rule>Simple plain text format with no markup.</rule>
      <rule>VERIFY PATHS: Double-check that each path you list actually exists in the provided code files.</rule>
      <rule>Don't include paths that you're not sure exist in the repository.</rule>
      <rule>BE COMPREHENSIVE - include many relevant paths (at least 8-15 files when possible).</rule>
      <rule>ALWAYS include .cursorrules if it exists in the repository.</rule>
      <rule>ALWAYS include README.md and documentation files.</rule>
      <rule>Include all code files, dependencies, data structures, and config files.</rule>
      <rule>Include language-specific package files and documentation.</rule>
      <rule>Include test files related to the components being modified.</rule>
      <rule>No comments or explanations for individual files.</rule>
    </file_paths_section>

    <task_description_section>
      <rule>Start with "Task Description:" header.</rule>
      <rule>Single paragraph explaining the task comprehensively.</rule>
      <rule>Plain text only, no XML or markup.</rule>
      <rule>Only reference files that actually exist in the repository.</rule>
      <rule>Reference cursor rules if they're relevant to the implementation.</rule>
      <rule>Mention key documentation that provides context for the task.</rule>
      <rule>Adjust paragraph length according to task complexity - more complex tasks warrant longer explanations.</rule>
      <rule>Reference key files and data structures.</rule>
      <rule>Include implementation details proportional to task complexity.</rule>
    </task_description_section>
  </rules>
</prompt>`;
}