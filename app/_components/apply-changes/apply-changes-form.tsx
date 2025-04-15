"use client";
 
import { useState, useEffect } from "react";
import { StatusMessages } from "./_components/status-messages"; // Keep StatusMessages import
import { getRefactoringApplyPrompt, getDiffApplyPrompt } from "../../../prompts/apply-changes-prompts";
import { useFormat } from "@/lib/contexts/format-context"; // Keep useFormat import
import { Button } from "@/components/ui/button"; // Keep Button import
import { Loader2, Clipboard } from "lucide-react"; // Keep Clipboard import

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

  const handleApplyFromClipboard = async () => {
    setErrorMessage("");
    setIsLoading(true);

    let prompt: string = '';
    try {
      const clipboardText = await navigator.clipboard.readText();
      if (!clipboardText.trim()) {
        setErrorMessage("Clipboard is empty");
        setIsLoading(false);
        return;
      }

      if (outputFormat === "refactoring") {
        prompt = await getRefactoringApplyPrompt(clipboardText);
      } else if (outputFormat === "diff") {
        prompt = await getDiffApplyPrompt(clipboardText);
      } else if (outputFormat === "path-finder") {
        setErrorMessage("Apply Changes is not applicable for Path Finder format.");
        setIsLoading(false);
        return; // Keep return
      }
      // Custom format implementation would go here

      await navigator.clipboard.writeText(prompt);
      setSuccessMessage("Prompt copied to clipboard - ready to send to AI!");

    } catch (error: any) {
      setErrorMessage("Failed to read from clipboard");
    } finally {
      // Ensure loading state is reset even if an error occurred before API call
      if (!prompt) {
        setIsLoading(false);
      }
      setIsLoading(false);
    }
  };

  const isButtonDisabled = isLoading || (outputFormat === "custom" && !customFormat.trim()) || outputFormat === "path-finder";

  return (
    <div className="max-w-[1400px] w-full mx-auto p-4 flex flex-col gap-4">
      <StatusMessages 
        errorMessage={errorMessage}
        successMessage={successMessage}
      />
      
      <div className="flex justify-center my-4">
        <Button
          type="button"
          onClick={handleApplyFromClipboard}
          disabled={isButtonDisabled}
          className="bg-primary text-primary-foreground px-8 py-6 rounded-lg text-lg font-semibold shadow-md hover:shadow-lg transition-all hover:bg-primary/90 disabled:opacity-50"
          title={
            outputFormat === "path-finder" ? "Apply Changes is not available for Path Finder format" : 
            (outputFormat === "custom" && !customFormat.trim()) ? "Please define custom format instructions first" : 
            ""
          }
        >
          {isLoading ? (
            <div className="flex items-center gap-2">
              <Loader2 className="animate-spin -ml-1 mr-2 h-5 w-5 text-white" />
              Processing...
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <Clipboard className="h-5 w-5" />
              Generate &quot;Apply Changes&quot; Prompt from Clipboard
            </div>
          )}
        </Button>
      </div>
    </div>
  );
}
