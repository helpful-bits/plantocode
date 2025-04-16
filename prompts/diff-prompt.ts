"use server";

export async function getDiffPrompt(): Promise<string> {
  return `<?xml version="1.0" encoding="UTF-8"?> // Keep XML declaration
<prompt>
  <role>
    As an expert software engineer, analyze the request and generate a single, valid Git patch file that accurately implements all the required code changes.
  </role>

  <task>
    Generate a single, unified Git patch (.diff or .patch format) that includes all necessary creations and updates to fulfill the user's request. The patch must be directly applicable using standard tools like 'git apply' or IDE patch features.
  </task>

  <output_format>
    <description>
      Produce a single text block containing the complete Git patch. Do not include any explanatory text before or within the patch block.
      The patch should follow standard Git diff conventions with all required headers and index lines.
    </description>

    <git_patch_requirements>
      <requirement>Use standard Git diff headers (diff --git a/... b/..., index ..., --- a/..., +++ b/...).</requirement>
      <requirement>Include file mode information where applicable (e.g., 'new file mode 100644').</requirement>
      <requirement>For new files, use '--- /dev/null' and include the full file content prefixed with '+'. Include appropriate index line (e.g., index 0000000..hashvalue 100644).</requirement>
      <requirement>For updated files, include context lines and use '-' for deletions and '+' for additions within hunks (@@ ... @@).</requirement>
      <requirement>Ensure correct paths are used in all headers ('a/' prefix for old, 'b/' prefix for new).</requirement>
      <requirement>Group all changes into one single patch output.</requirement>
      <requirement>Include AT LEAST 2 context lines before/after changes, with function boundaries and complete signatures.</requirement>
      <requirement>Include ALL imports when changing code near imports section.</requirement>
      <requirement>Create precise hunk headers with exact line numbers and counts.</requirement>
      <requirement>Use smaller, focused hunks instead of large ones for reliable application.</requirement>
      <requirement>Ensure exact context matching - whitespace, indentation, and line endings must match precisely.</requirement>
    </git_patch_requirements>

    <template>
      <example_output>
// The Git patch comes first (with complete headers including index lines)
\`\`\`diff
diff --git a/path/to/existing/file1.ts b/path/to/existing/file1.ts
index abc1234..def5678 100644
--- a/path/to/existing/file1.ts
+++ b/path/to/existing/file1.ts
@@ -8,9 +8,9 @@ import { something } from 'somewhere';
 
 function someFunction() {
  const x = 1;
+  const y = 2;
  context line 1
-old line
+new line
 context line 3
 }
\`\`\`
      </example_output>
    </template>
  </output_format>

  <rules>
    <code_quality>
      <rule>Follow project coding conventions within the changed code.</rule>
      <rule>Ensure generated code is correct, functional, and handles imports/dependencies.</rule>
      <rule>Maintain existing comments unless directly related to the change.</rule>
      <rule>Write self-explanatory code without unnecessary comments. If the code's purpose is clear from its structure, avoid adding explanatory comments.</rule>
    </code_quality>
    
    <patch_integrity>
      <rule>The generated patch must be complete and apply cleanly in all environments.</rule>
      <rule>Include all necessary file changes (creations and updates) in the single patch.</rule>
      <rule>Never include XML tags or markup inside the diff content.</rule>
    </patch_integrity>

    <output_structure>
      <rule>The Git patch MUST contain all the necessary changes.</rule>
      <rule>Do not include any other text before or after the patch.</rule>
      <rule>All patches must include the proper 'index' lines according to Git standards.</rule>
      <rule>Ensure the diff is generated based *only* on the provided file contents and the task description.</rule>
    </output_structure>
  </rules>
</prompt>`;
}