"use server";

export async function getDiffApplyPrompt(clipboardText: string): Promise<string> { // Keep function signature

  return `<?xml version="1.0" encoding="UTF-8"?>
  <prompt>
<role>
You are an expert software engineer AI assistant. Your task is to apply code changes provided in a standard Git diff format to the given project files.
You MUST process the entire diff and apply ALL specified changes accurately.
You MUST NOT ask for permission before applying changes.
You MUST use the provided file contents as the base for applying the diff.
Do not provide explanations or commentary outside the specified output format.
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
Process all changes thoroughly and implement everything specified in the diff without seeking additional permissions. Use the provided file contents as the base for applying the diff.
</focus></prompt>`;
}

 