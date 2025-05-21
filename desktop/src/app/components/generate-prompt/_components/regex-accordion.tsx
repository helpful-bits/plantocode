"use client";

import { Loader2, Filter, ChevronDown, ChevronUp } from "lucide-react";
import { useState } from "react";

import { Button } from "@/ui/button";
import {
  Collapsible,
  CollapsibleTrigger,
  CollapsibleContent,
} from "@/ui/collapsible";

import { useRegexContext } from "../_contexts/regex-context";

import RegexInput from "./regex-input";

interface RegexAccordionProps {
  titleRegexError: string | null;
  contentRegexError: string | null;
  negativeTitleRegexError: string | null;
  negativeContentRegexError: string | null;
  hasTaskDescription: boolean;
  onInteraction: () => void;
  disabled?: boolean;
}

export default function RegexAccordion({
  titleRegexError,
  contentRegexError,
  negativeTitleRegexError,
  negativeContentRegexError,
  hasTaskDescription,
  onInteraction,
  disabled = false,
}: RegexAccordionProps) {
  // Get regex state and actions directly from context
  const { state, actions } = useRegexContext();

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
                <span className="text-sm font-medium">
                  Regex File Filtering
                </span>
                {isOpen ? (
                  <ChevronUp className="h-4 w-4" />
                ) : (
                  <ChevronDown className="h-4 w-4" />
                )}
              </div>
            </CollapsibleTrigger>

            {/* Generate Regex Button - moved here for better UX */}
            <div className="pr-3">
              <Button
                type="button"
                variant={isOpen ? "secondary" : "outline"}
                size="sm"
                onClick={(e: React.MouseEvent<HTMLButtonElement>) => {
                  e.stopPropagation();
                  void actions.handleGenerateRegexFromTask();
                  if (!isOpen) setIsOpen(true);
                  onInteraction();
                }}
                disabled={
                  !hasTaskDescription || state.isGeneratingTaskRegex || disabled
                }
                className="h-8"
                title="Generate regex patterns based on your task description"
              >
                {state.isGeneratingTaskRegex ? (
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
            {state.regexGenerationError && (
              <div className="mb-4 p-2 bg-destructive/10 border border-destructive/20 rounded-md text-destructive text-sm">
                <strong>Error:</strong> {state.regexGenerationError}
              </div>
            )}

            {/* RegexInput Component */}
            <RegexInput
              titleRegex={state.titleRegex}
              contentRegex={state.contentRegex}
              negativeTitleRegex={state.negativeTitleRegex}
              negativeContentRegex={state.negativeContentRegex}
              onTitleRegexChange={(value: string) => {
                actions.setTitleRegex(value);
                onInteraction();
              }}
              onContentRegexChange={(value: string) => {
                actions.setContentRegex(value);
                onInteraction();
              }}
              onNegativeTitleRegexChange={(value: string) => {
                actions.setNegativeTitleRegex(value);
                onInteraction();
              }}
              onNegativeContentRegexChange={(value: string) => {
                actions.setNegativeContentRegex(value);
                onInteraction();
              }}
              titleRegexError={titleRegexError}
              contentRegexError={contentRegexError}
              negativeTitleRegexError={negativeTitleRegexError}
              negativeContentRegexError={negativeContentRegexError}
              onClearPatterns={() => {
                actions.handleClearPatterns();
                onInteraction();
              }}
              disabled={disabled}
            />
          </CollapsibleContent>
        </Collapsible>
      </div>
    </div>
  );
}
