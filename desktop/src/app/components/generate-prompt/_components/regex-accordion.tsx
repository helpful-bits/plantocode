"use client";

import { Loader2, Filter, ChevronDown, ChevronUp, FileText, Sparkles } from "lucide-react";
import { useState } from "react";

import { useSessionStateContext } from "@/contexts/session";
import { Button } from "@/ui/button";
import {
  Collapsible,
  CollapsibleTrigger,
  CollapsibleContent,
} from "@/ui/collapsible";
import { Card, CardContent, CardHeader, CardTitle } from "@/ui/card";

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
  // Get regex state and actions from contexts
  const { state, actions } = useRegexContext();
  const { currentSession } = useSessionStateContext();

  // Local state for controlling the accordion
  const [isOpen, setIsOpen] = useState(false);

  const hasAnyPatterns = currentSession?.titleRegex || currentSession?.contentRegex || 
                        currentSession?.negativeTitleRegex || currentSession?.negativeContentRegex;

  return (
    <div className="mb-4">
      <div className="flex justify-between items-center w-full border rounded-t shadow-sm">
        <Collapsible open={isOpen} onOpenChange={setIsOpen} className="w-full">
          <div className="flex justify-between items-center w-full">
            <CollapsibleTrigger asChild>
              <div className="flex items-center gap-2 p-3 cursor-pointer hover:bg-muted flex-1">
                <Filter className="h-4 w-4" />
                <span className="text-sm font-medium">
                  File Filtering
                </span>
                {hasAnyPatterns && (
                  <span className="text-xs bg-primary/20 text-primary px-2 py-0.5 rounded">
                    Active
                  </span>
                )}
                {isOpen ? (
                  <ChevronUp className="h-4 w-4 ml-auto" />
                ) : (
                  <ChevronDown className="h-4 w-4 ml-auto" />
                )}
              </div>
            </CollapsibleTrigger>
          </div>

          <CollapsibleContent className="border border-t-0 rounded-b-md p-6 space-y-6 mt-[-1px]">
            {/* Show regex generation error if present */}
            {state.regexGenerationError && (
              <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-md text-destructive text-sm">
                <strong>Error:</strong> {state.regexGenerationError}
              </div>
            )}

            {/* Individual field generation error */}
            {state.fieldRegexGenerationError && (
              <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-md text-destructive text-sm">
                <strong>Field Generation Error:</strong> {state.fieldRegexGenerationError}
              </div>
            )}

            {/* Summary generation error */}
            {state.summaryGenerationError && (
              <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-md text-destructive text-sm">
                <strong>Summary Error:</strong> {state.summaryGenerationError}
              </div>
            )}

            {/* RegexInput Component */}
            <RegexInput
              titleRegex={currentSession?.titleRegex || ""}
              contentRegex={currentSession?.contentRegex || ""}
              negativeTitleRegex={currentSession?.negativeTitleRegex || ""}
              negativeContentRegex={currentSession?.negativeContentRegex || ""}
              titleRegexDescription={state.titleRegexDescription}
              contentRegexDescription={state.contentRegexDescription}
              negativeTitleRegexDescription={state.negativeTitleRegexDescription}
              negativeContentRegexDescription={state.negativeContentRegexDescription}
              onTitleRegexDescriptionChange={(value: string) => {
                actions.setTitleRegexDescription(value);
                onInteraction();
              }}
              onContentRegexDescriptionChange={(value: string) => {
                actions.setContentRegexDescription(value);
                onInteraction();
              }}
              onNegativeTitleRegexDescriptionChange={(value: string) => {
                actions.setNegativeTitleRegexDescription(value);
                onInteraction();
              }}
              onNegativeContentRegexDescriptionChange={(value: string) => {
                actions.setNegativeContentRegexDescription(value);
                onInteraction();
              }}
              onGenerateTitleRegex={async (description: string) => {
                await actions.handleGenerateRegexForField('title', description);
                onInteraction();
              }}
              onGenerateContentRegex={async (description: string) => {
                await actions.handleGenerateRegexForField('content', description);
                onInteraction();
              }}
              onGenerateNegativeTitleRegex={async (description: string) => {
                await actions.handleGenerateRegexForField('negativeTitle', description);
                onInteraction();
              }}
              onGenerateNegativeContentRegex={async (description: string) => {
                await actions.handleGenerateRegexForField('negativeContent', description);
                onInteraction();
              }}
              titleRegexError={titleRegexError}
              contentRegexError={contentRegexError}
              negativeTitleRegexError={negativeTitleRegexError}
              negativeContentRegexError={negativeContentRegexError}
              generatingFieldType={state.generatingFieldType}
              fieldRegexGenerationError={state.fieldRegexGenerationError}
              isGenerating={state.isGeneratingTaskRegex}
              onClearPatterns={() => {
                actions.handleClearPatterns();
                onInteraction();
              }}
              disabled={disabled}
            />

            {/* Filter Summary Section */}
            {hasAnyPatterns && (
              <Card className="border-dashed">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <FileText className="h-4 w-4" />
                    Filter Summary
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {state.regexSummaryExplanation ? (
                    <div className="p-3 bg-muted/50 rounded-md text-sm text-muted-foreground">
                      {state.regexSummaryExplanation}
                    </div>
                  ) : (
                    <div className="p-3 bg-muted/30 rounded-md text-sm text-muted-foreground italic">
                      No filter explanation generated yet. Click below to create one.
                    </div>
                  )}
                  
                  <div className="flex justify-center">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={async () => {
                        await actions.handleGenerateSummaryExplanation();
                        onInteraction();
                      }}
                      disabled={!hasAnyPatterns || state.isGeneratingSummaryExplanation || disabled}
                      className="flex items-center gap-2"
                    >
                      {state.isGeneratingSummaryExplanation ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin" />
                          Generating explanation...
                        </>
                      ) : (
                        <>
                          <Sparkles className="h-4 w-4" />
                          {state.regexSummaryExplanation ? 'Regenerate' : 'Generate'} Filter Explanation
                        </>
                      )}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Legacy Generate Regex Button (for backward compatibility) */}
            {hasTaskDescription && (
              <div className="pt-2 border-t">
                <div className="text-xs text-muted-foreground mb-2">
                  Legacy: Generate all patterns from task description
                </div>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={async () => {
                    await actions.handleGenerateRegexFromTask();
                    onInteraction();
                  }}
                  disabled={state.isGeneratingTaskRegex || disabled}
                  className="flex items-center gap-2"
                >
                  {state.isGeneratingTaskRegex ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Generating...
                    </>
                  ) : (
                    <>
                      <Filter className="h-4 w-4" />
                      Generate All from Task
                    </>
                  )}
                </Button>
              </div>
            )}
          </CollapsibleContent>
        </Collapsible>
      </div>
    </div>
  );
}
