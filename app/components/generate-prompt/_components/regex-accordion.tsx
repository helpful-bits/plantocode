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
  negativeContentRegexError
}: RegexAccordionProps) {
  // Local state for controlling the accordion
  const [isOpen, setIsOpen] = useState(false);
  
  // Function to handle the switch click without triggering the collapsible
  const handleSwitchClick = (e: React.MouseEvent) => {
    e.stopPropagation();
  };

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
            
            <div className="flex items-center gap-3 mr-3" onClick={handleSwitchClick}>
              <span className="text-xs text-muted-foreground">
                {regexState.isRegexActive ? "Active" : "Inactive"}
              </span>
              <div
                className="inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors focus-visible:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50 bg-input"
                style={{
                  backgroundColor: regexState.isRegexActive ? 'var(--primary)' : 'var(--input)',
                  position: 'relative'
                }}
                onClick={(e) => {
                  e.stopPropagation();
                  const newValue = !regexState.isRegexActive;
                  regexState.setIsRegexActive(newValue);
                  // onInteraction is now called inside setIsRegexActive
                }}
                role="switch"
                aria-checked={regexState.isRegexActive}
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    const newValue = !regexState.isRegexActive;
                    regexState.setIsRegexActive(newValue);
                    // onInteraction is now called inside setIsRegexActive
                  }
                }}
              >
                <div
                  className="pointer-events-none block h-4 w-4 rounded-full bg-background shadow-lg ring-0 transition-transform"
                  style={{
                    transform: regexState.isRegexActive ? 'translateX(16px)' : 'translateX(0)',
                    position: 'absolute',
                    left: '2px'
                  }}
                />
              </div>
            </div>
          </div>

          {/* Collapsible content */}
          <CollapsibleContent className="pt-6 border border-t-0 rounded-b-md px-6 pb-6 mt-[-1px]">
            {/* "Generate Regex from Task" Button Section */}
            <div className="mb-5">
              <div className="flex items-center justify-between mb-2">
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={regexState.handleGenerateRegexFromTask}
                  disabled={!taskDescription.trim() || regexState.isGeneratingTaskRegex}
                  className="h-9"
                >
                  {regexState.isGeneratingTaskRegex ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Generating...
                    </>
                  ) : (
                    "Generate Regex from Task"
                  )}
                </Button>
                {regexState.regexGenerationError && (
                  <p className="text-xs text-destructive">{regexState.regexGenerationError}</p>
                )}
              </div>
              <p className="text-xs text-muted-foreground text-balance">Suggests regex patterns based on the task description using AI.</p>
            </div>

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
              isRegexActive={regexState.isRegexActive}
              onRegexActiveChange={regexState.setIsRegexActive}
              onInteraction={onInteraction}
              onClearPatterns={regexState.handleClearPatterns}
            />
          </CollapsibleContent>
        </Collapsible>
      </div>
    </div>
  );
}