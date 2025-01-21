"use server";

export async function getDiffApplyPrompt(clipboardText: string): Promise<string> {
  return `<role>
You are an expert software engineer tasked with applying code changes from a diff to the codebase. Your responsibility is to process and implement all changes specified in the diff accurately and thoroughly.
</role>

<input>
Here is the diff to apply:

<diff_content>
${clipboardText}
</diff_content>
</input>

<output_format>
<changes>
  <summary>
    Comprehensive overview of all implemented modifications
  </summary>
</changes>
</output_format>

<focus>
Process all changes thoroughly and implement everything specified in the diff without seeking additional permissions.
</focus>`;
}

export async function getRefactoringApplyPrompt(clipboardText: string): Promise<string> {
  return `<role>
You are an expert software engineer tasked with implementing changes from a detailed task breakdown. Your responsibility is to process and implement all specified changes accurately and thoroughly.
</role>

<input>
Here is the task breakdown to implement:

<task_content>
${clipboardText}
</task_content>
</input>

<output_format>
<changes>
  <summary>
    Comprehensive overview of all implemented modifications
  </summary>
</changes>
</output_format>

<focus>
Process all changes thoroughly and implement everything specified in the task breakdown without seeking additional permissions.
</focus>`;
} 