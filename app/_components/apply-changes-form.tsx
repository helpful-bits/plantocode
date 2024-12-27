"use client";
import { applyChangesAction } from "@/actions/apply-changes-actions";
import { useEffect, useState } from "react";

const PROJECT_DIR_KEY = 'o1-pro-flow-project-dir';

export function ApplyChangesForm() {
  const [projectDirectory, setProjectDirectory] = useState<string>("");
  const [successMessage, setSuccessMessage] = useState<string>("");
  const [errorMessage, setErrorMessage] = useState<string>("");
  const [isLoading, setIsLoading] = useState(false);

  // Load saved directory on mount
  useEffect(() => {
    const savedDir = localStorage.getItem(PROJECT_DIR_KEY);
    if (savedDir) {
      setProjectDirectory(savedDir);
    }
  }, []);

  // Save directory when it changes
  const handleDirectoryChange = (value: string) => {
    setProjectDirectory(value);
    localStorage.setItem(PROJECT_DIR_KEY, value);
  };

  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (successMessage) {
      timer = setTimeout(() => {
        setSuccessMessage("");
      }, 2000);
    }
    return () => {
      if (timer) clearTimeout(timer);
    };
  }, [successMessage]);

  const handleApplyFromClipboard = async () => {
    setErrorMessage("");
    setIsLoading(true);

    try {
      const clipboardText = await navigator.clipboard.readText();
      if (!clipboardText.trim()) {
        setErrorMessage("Clipboard is empty");
        return;
      }

      const prompt = `You are an expert software engineer. I need you to apply the following changes from a diff to my codebase. Please process all changes and respond with detailed, actionable modifications. Don't ask for permissions - apply all changes that are clearly specified in the diff.

For any file operations (deletions, renamings), include them in a cleanup.sh script.

Here is the diff to apply:

${clipboardText}

Please respond with:
1. All file changes, showing the full updated file contents for modified files
2. A cleanup.sh script if any files need to be deleted or renamed
3. A summary of all changes made

Be thorough and process all changes, even if there are many. Don't skip any modifications that are clearly specified in the diff.`;

      // Here you would send this prompt to Claude and process its response
      // For now, we'll just copy it to clipboard
      await navigator.clipboard.writeText(prompt);
      setSuccessMessage("Prompt copied to clipboard - ready to send to Claude!");

    } catch (error: any) {
      setErrorMessage("Failed to read from clipboard");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="max-w-xl w-full mx-auto p-4 flex flex-col gap-4">
      {errorMessage && <div className="text-destructive">{errorMessage}</div>}
      {successMessage && <div className="text-green-500 dark:text-green-400">{successMessage}</div>}
      <div className="flex flex-col">
        <label className="mb-2 font-bold text-foreground">Project Directory:</label>
        <input
          className="border rounded bg-background text-foreground p-2 w-full"
          type="text"
          value={projectDirectory}
          onChange={(e) => handleDirectoryChange(e.target.value)}
          placeholder="e.g. /Users/myusername/projects/o1-pro-flow"
        />
      </div>
      <button
        className="bg-primary text-primary-foreground p-2 rounded disabled:opacity-50"
        onClick={handleApplyFromClipboard}
        disabled={isLoading}
      >
        {isLoading ? "Processing..." : "Generate \"Apply Changes\" Prompt from Clipboard"}
      </button>
    </div>
  );
}
