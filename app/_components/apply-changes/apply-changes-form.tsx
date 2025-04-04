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
    <div className="max-w-xl w-full mx-auto p-4 flex flex-col gap-4">
      <StatusMessages 
        errorMessage={errorMessage}
        successMessage={successMessage}
      />
      
      <Button
        onClick={handleApplyFromClipboard}
        disabled={isLoading || (outputFormat === "custom" && !customFormat.trim()) || outputFormat === "path-finder"}
      >
        {isLoading ? "Processing..." : "Generate \"Apply Changes\" Prompt from Clipboard"}
      </Button>
    </div>
  );
} 