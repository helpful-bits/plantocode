"use server";

export async function getDiffPrompt(): Promise<string> {
  return `<?xml version="1.0" encoding="UTF-8"?>
<prompt>
  <role>
    As an expert software engineer, implement code changes that are practical and meet the requirements. Focus on direct solutions.
  </role>

  <task>
    Implement the required code changes while:
    - Writing clear, direct code
    - Following project standards
    - Handling all dependencies and imports
    - Maintaining type safety and compatibility
  </task>

  <output_format>
    <file_operations>
      <create>
        <requirement>Full file contents with imports</requirement>
        <requirement>Follow conventions</requirement>
        <requirement>No "+" markers</requirement>
      </create>

      <update>
        <requirement>Changes with context</requirement>
        <requirement>Use +/- markers</requirement>
        <requirement>Update dependencies</requirement>
      </update>

      <move>
        <requirement>Old and new paths</requirement>
        <requirement>Update references</requirement>
        <requirement>Handle configs</requirement>
      </move>

      <delete>
        <requirement>File path</requirement>
        <requirement>Update dependencies</requirement>
        <requirement>Handle configs</requirement>
      </delete>
    </file_operations>

    <diff_format>
      <principles>
        <requirement>Absolutely ALL changes</requirement>
        <requirement>Needed context</requirement>
        <requirement>Logical grouping</requirement>
      </principles>
      <presentation>
        <requirement>Use markdown txt codeblock</requirement>
      </presentation>
    </diff_format>

    <change_specification>
      <header>For each file change:</header>
      <requirements>
        <requirement>1. Operation (CREATE/UPDATE/DELETE)</requirement>
        <requirement>2. File path from root</requirement>
        <requirement>3. CREATE: Full contents</requirement>
        <requirement>4. UPDATE: +/- changes</requirement>
        <requirement>5. DELETE: Path only</requirement>
      </requirements>
    </change_specification>

    <template>
      <code_changes>
        <file>
          <operation>CREATE</operation>
          <path>path/to/new/file.ts</path>
          <content>
// Full content for new files
          </content>
        </file>
        <file>
          <operation>UPDATE</operation>
          <path>path/to/existing/file.ts</path>
          <changes>
-old line
+new line
          </changes>
        </file>
        <file>
          <operation>DELETE</operation>
          <path>path/to/deleted/file.ts</path>
        </file>
      </code_changes>
    </template>
  </output_format>

  <rules>
    <code_quality>
      <rule>Follow conventions</rule>
      <rule>Handle errors consistently</rule>
      <rule>Keep existing comments</rule>
      <rule>No edit comments</rule>
    </code_quality>
    
    <completeness>
      <rule>Complete implementation</rule>
      <rule>All dependencies</rule>
      <rule>Sufficient context</rule>
    </completeness>
  </rules>
</prompt>`;
} 