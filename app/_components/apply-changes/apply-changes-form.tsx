"use client";

import { useState, useEffect, useCallback } from "react";
import { StatusMessages } from "./_components/status-messages";
import { getRefactoringApplyPrompt, getDiffApplyPrompt } from "../../../prompts/apply-changes-prompts";
import { useFormat } from "@/lib/contexts/format-context";
import { Button } from "@/components/ui/button";

export function ApplyChangesForm() {
  const [successMessage, setSuccessMessage] = useState<string>("");
  const [errorMessage, setErrorMessage] = useState<string>("");
  const [isLoading, setIsLoading] = useState(false);
  const { outputFormat, customFormat } = useFormat();

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

  const handleApplyFromClipboard = useCallback(async () => {
    setErrorMessage("");
    setIsLoading(true);

    try {
      const clipboardText = await navigator.clipboard.readText();
      if (!clipboardText.trim()) {
        setErrorMessage("Clipboard is empty");
        return;
      }

      let prompt;
      if (outputFormat === "refactoring") {
        prompt = await getRefactoringApplyPrompt(clipboardText);
      } else if (outputFormat === "diff") {
        prompt = await getDiffApplyPrompt(clipboardText);
      } else if (outputFormat === "path-finder") {
         setErrorMessage("Apply Changes is not applicable for Path Finder format.");
      } else {
        if (!customFormat.trim()) throw new Error("Custom format is empty.");
        // Custom format
        prompt = customFormat.replace("{{CLIPBOARD_CONTENT}}", clipboardText);
      }

      await navigator.clipboard.writeText(prompt);
      setSuccessMessage("Prompt copied to clipboard - ready to send to AI!");

    } catch (error: any) {
      setErrorMessage("Failed to read from clipboard");
    } finally {
      setIsLoading(false);
    }
  }, [outputFormat, customFormat]);

  return (
    <div className="max-w-[1400px] w-full mx-auto p-4 flex flex-col gap-4">
      <StatusMessages 
        errorMessage={errorMessage}
        successMessage={successMessage}
      />
      
      <div className="flex justify-center my-4">
        <Button
          onClick={handleApplyFromClipboard}
          disabled={isLoading || (outputFormat === "custom" && !customFormat.trim()) || outputFormat === "path-finder"}
          className="bg-primary text-primary-foreground px-8 py-6 rounded-lg text-lg font-semibold shadow-md hover:shadow-lg transition-all hover:bg-primary/90 disabled:opacity-50"
        >
          {isLoading ? (
            <div className="flex items-center gap-2">
              <svg className="animate-spin -ml-1 mr-2 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              Processing...
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
              Generate "Apply Changes" Prompt from Clipboard
            </div>
          )}
        </Button>
      </div>
    </div>
  );
} 