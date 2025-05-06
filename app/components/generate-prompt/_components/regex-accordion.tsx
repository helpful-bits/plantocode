"use client";

import React, { useState } from "react";
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from "@/components/ui/collapsible";
import RegexInput from "./regex-input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
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
      <div className="flex justify-between items-center w-full border rounded-t">
        <Collapsible open={isOpen} onOpenChange={setIsOpen} className="w-full">
          <div className="flex justify-between items-center w-full">
            <CollapsibleTrigger asChild>
              <div className="flex items-center gap-2 p-2 cursor-pointer hover:bg-muted flex-1">
                <Filter className="h-4 w-4" />
                <span className="text-sm font-medium">Regex File Filtering</span>
                {isOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </div>
            </CollapsibleTrigger>
            
            <div className="flex items-center gap-3 mr-2" onClick={handleSwitchClick}>
              <span className="text-xs text-muted-foreground">
                {regexState.isRegexActive ? "Active" : "Inactive"}
              </span>
              <Switch
                checked={regexState.isRegexActive}
                onCheckedChange={(checked) => {
                  regexState.setIsRegexActive(checked);
                  onInteraction();
                }}
              />
            </div>
          </div>

          {/* Collapsible content */}
          <CollapsibleContent className="pt-4 border border-t-0 rounded-b-md px-4 pb-4 mt-[-1px]">
            {/* "Generate Regex from Task" Button Section */}
            <div className="mb-4">
              <div className="flex items-center justify-between mb-2">
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={regexState.handleGenerateRegexFromTask}
                  disabled={!taskDescription.trim() || regexState.isGeneratingTaskRegex}
                  className="h-8"
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
              <p className="text-xs text-muted-foreground">Uses AI to suggest regex patterns based on the task description.</p>
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