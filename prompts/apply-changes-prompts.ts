"use server";

export async function getDiffApplyPrompt(clipboardText: string): Promise<string> {
  return `You are an expert software engineer. I need you to apply the following changes from a diff to my codebase. Please process all changes and respond with detailed, actionable modifications. Don't ask for permissions - apply all changes that are clearly specified in the diff.

For files that need to be replaced or moved, create the new file and mark the old file with "// =DEPRECATED=" at the top, along with a comment indicating where the new file is.

Here is the diff to apply:

${clipboardText}

Please respond with:
1. All file changes, showing the full updated file contents for modified files
2. For any files that are being replaced or moved, show both the new file contents and the deprecated notice for the old file
3. A summary of all changes made

Be thorough and process all changes, even if there are many. Don't skip any modifications that are clearly specified in the diff.`;
}

export async function getRefactoringApplyPrompt(clipboardText: string): Promise<string> {
  return `You are an expert software engineer. I need you to implement the changes specified in the following task breakdown. Please process all changes and respond with detailed, actionable modifications.

For files that need to be replaced or moved, create the new file and mark the old file with "// =DEPRECATED=" at the top, along with a comment indicating where the new file is.

Here is the task breakdown to implement:

${clipboardText}

Please respond with:
1. All file changes, showing the full updated file contents for modified files
2. For any files that are being replaced or moved, show both the new file contents and the deprecated notice for the old file
3. A summary of all changes made

Be thorough and process all changes, even if there are many. Don't skip any modifications that are clearly specified in the task breakdown.`;
} 