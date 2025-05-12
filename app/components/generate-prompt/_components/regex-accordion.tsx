"use client";

import React, { useState } from "react";
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from "@/components/ui/collapsible";
import RegexInput from "./regex-input";
import { Button } from "@/components/ui/button";
// Using custom switch implementation instead of import { Switch } from "@/components/ui/switch";
import { Loader2, Filter, ChevronDown, ChevronUp } from "lucide-react";
import { GeneratePromptContextValue } from "../_contexts/generate-prompt-context";

interface RegexAccordionProps {
  regexState: GeneratePromptContextValue['regexState']; // The full regex state object
  onInteraction: () => void;
  taskDescription: string;
  titleRegexError: string | null;
  contentRegexError: string | null;
  negativeTitleRegexError: string | null;
  negativeContentRegexError: string | null;
  disabled?: boolean;
}

export default function RegexAccordion({
  regexState,
  onInteraction,
  taskDescription,
  titleRegexError,
  contentRegexError,
  negativeTitleRegexError,
  negativeContentRegexError,
  disabled = false
}: RegexAccordionProps) {
  // Local state for controlling the accordion
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="mb-4">
      {/* Header with collapsible trigger and switch */}
      <div className="flex justify-between items-center w-full border rounded-t shadow-sm">
        <Collapsible open={isOpen} onOpenChange={setIsOpen} className="w-full">
          <div className="flex justify-between items-center w-full">
            <CollapsibleTrigger asChild>
              <div className="flex items-center gap-2 p-3 cursor-pointer hover:bg-muted flex-1">
                <Filter className="h-4 w-4" />
                <span className="text-sm font-medium">Regex File Filtering</span>
                {isOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </div>
            </CollapsibleTrigger>

            {/* Generate Regex Button - moved here for better UX */}
            <div className="pr-3">
              <Button
                type="button"
                variant={isOpen ? "secondary" : "outline"}
                size="sm"
                onClick={(e) => {
                  e.stopPropagation();
                  regexState.handleGenerateRegexFromTask();
                  if (!isOpen) setIsOpen(true);
                }}
                disabled={!taskDescription.trim() || regexState.isGeneratingTaskRegex || disabled}
                className="h-8"
                title="Generate regex patterns based on your task description"
              >
                {regexState.isGeneratingTaskRegex ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                    Generating...
                  </>
                ) : (
                  <>
                    <Filter className="h-4 w-4 mr-1.5" />
                    Generate Regex
                  </>
                )}
              </Button>
            </div>
          </div>

          {/* Collapsible content */}
          <CollapsibleContent className="pt-6 border border-t-0 rounded-b-md px-6 pb-6 mt-[-1px]">
            {/* Show regex generation error if present */}
            {regexState.regexGenerationError && (
              <div className="mb-4 p-2 bg-destructive/10 border border-destructive/20 rounded-md text-destructive text-sm">
                <strong>Error:</strong> {regexState.regexGenerationError}
              </div>
            )}

            {/* RegexInput Component */}
            <RegexInput
              titleRegex={regexState.titleRegex}
              contentRegex={regexState.contentRegex}
              negativeTitleRegex={regexState.negativeTitleRegex}
              negativeContentRegex={regexState.negativeContentRegex}
              onTitleRegexChange={regexState.setTitleRegex}
              onContentRegexChange={regexState.setContentRegex}
              onNegativeTitleRegexChange={regexState.setNegativeTitleRegex}
              onNegativeContentRegexChange={regexState.setNegativeContentRegex}
              titleRegexError={titleRegexError}
              contentRegexError={contentRegexError}
              negativeTitleRegexError={negativeTitleRegexError}
              negativeContentRegexError={negativeContentRegexError}
              onInteraction={onInteraction}
              onClearPatterns={regexState.handleClearPatterns}
              disabled={disabled}
            />
          </CollapsibleContent>
        </Collapsible>
      </div>
    </div>
  );
}