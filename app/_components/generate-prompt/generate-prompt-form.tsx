"use client";

import React, { Suspense } from "react";
import { Loader2 } from "lucide-react";
import { useGeneratePromptState } from "./_hooks/use-generate-prompt-state";
import ProjectSection from "./_sections/ProjectSection";
import TaskSection from "./_sections/TaskSection";
import FileSection from "./_sections/FileSection";
import ActionSection from "./_sections/ActionSection";
import PromptPreview from "./_sections/PromptPreview";
import GeminiSection from "./_sections/GeminiSection";
import { Button } from "@/components/ui/button";

// Lazy load session-guard
const SessionGuard = React.lazy(() => import("./_components/session-guard"));

/**
 * Generate Prompt Form
 * 
 * Orchestrates the prompt generation UI components.
 * All business logic and state management is delegated to hooks.
 * The form itself is composed of focused presentational sections.
 */
export default function GeneratePromptForm() {
  // Initialize state and actions from the central hook
  const { state, actions } = useGeneratePromptState();

  // Create enhanced actions with required functions
  const enhancedActions = {
    ...actions,
    // Add missing functions required by components
    handleInteraction: () => {
      if (actions.setHasUnsavedChanges) {
        actions.setHasUnsavedChanges(true);
      }
    },
    setSessionInitialized: (initialized: boolean) => {
      // This is handled by the hook internally
      console.log("Session initialized state changed:", initialized);
    }
  };

  // Create specific props for ActionSection
  const actionSectionState = {
    isLoading: state.isGenerating || false,  // Use isGenerating instead of missing isLoading
    isLoadingFiles: state.isLoadingFiles,
    hasUnsavedChanges: state.hasUnsavedChanges,
    diffTemperature: state.diffTemperature,
    tokenCount: state.tokenCount
  };

  const actionSectionActions = {
    generatePrompt: actions.generatePrompt,
    // Use setDiffTemperature from actions object directly
    setDiffTemperature: actions.setDiffTemperature || ((value: number) => {
      console.error('setDiffTemperature not implemented in the hook');
    })
  };

  return (
    <div className="py-4 w-full flex h-full">
      <div className="flex flex-col flex-1 space-y-8 w-full">
        {/* Project Directory and Session Management */}
        <ProjectSection state={state} actions={enhancedActions} />

        {/* Message when no session is active */}
        {!state.activeSessionId && state.projectDirectory && !state.showLoadingOverlay && (
          <div className="text-center text-muted-foreground italic p-4 border border-dashed rounded-md border-border">
            Select a project directory to begin. Create a new session or load an existing one.
          </div>
        )}

        {/* Session Guard ensures form components are only shown when a session exists */}
        <Suspense fallback={
          <div className="h-[300px] flex items-center justify-center text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin mr-2"/>Loading session...
          </div>
        }>
          <SessionGuard
            activeSessionId={state.activeSessionId}
            setActiveSessionId={actions.handleSetActiveSessionId}
            getCurrentSessionState={actions.getCurrentSessionState}
            onLoadSession={actions.handleLoadSession}
            sessionInitialized={state.sessionInitialized}
          >
            {/* Task Description Section */}
            <TaskSection state={state} actions={enhancedActions} />

            {/* Pattern & Regex Section */}
            <Suspense fallback={<div>Loading pattern input...</div>}>
              <div className="flex flex-col gap-4">
                <div className="flex justify-between items-center mb-2">
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={actions.handleGenerateRegexFromTask}
                    disabled={!state.taskDescription.trim() || state.isGeneratingTaskRegex}
                    className="h-8"
                  >
                    {state.isGeneratingTaskRegex ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Generating...
                      </>
                    ) : (
                      "Generate Regex from Task"
                    )}
                  </Button>
                  {state.regexGenerationError && (
                    <p className="text-xs text-destructive">{state.regexGenerationError}</p>
                  )}
                </div>
                <p className="text-xs text-muted-foreground mt-1">Uses AI to suggest regex patterns based on the task description.</p>

                <RegexInput
                  titleRegex={state.titleRegex}
                  contentRegex={state.contentRegex}
                  onTitleRegexChange={actions.handleTitleRegexChange}
                  onContentRegexChange={actions.handleContentRegexChange}
                  titleRegexError={state.titleRegexError}
                  contentRegexError={state.contentRegexError}
                  isRegexActive={state.isRegexActive}
                  onRegexActiveChange={actions.handleToggleRegexActive}
                  onInteraction={enhancedActions.handleInteraction}
                  onClearPatterns={actions.handleClearPatterns}
                />
              </div>
            </Suspense>

            {/* File Selection Section */}
            <FileSection state={state} actions={enhancedActions} />

            {/* Generate Button and Controls */}
            <ActionSection 
              state={actionSectionState} 
              actions={actionSectionActions} 
            />

            {/* Prompt Preview and Error */}
            <PromptPreview state={state} actions={enhancedActions} />
          </SessionGuard>
        </Suspense>

        {/* Gemini Processor Section */}
        <GeminiSection state={state} />
      </div>
    </div>
  );
}

// Lazy load RegexInput component
const RegexInput = React.lazy(() => import("./_components/regex-input"));