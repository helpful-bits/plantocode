"use client";

import React, { Suspense, useMemo } from "react";
import { Loader2 } from "lucide-react";
import { useGeneratePromptState } from "./_hooks/use-generate-prompt-state";
import { GeneratePromptContext } from "./_contexts/generate-prompt-context";
import { FileManagementProvider } from "./_contexts/file-management-provider";
import ProjectSection from "./_sections/ProjectSection";
import TaskSection from "./_sections/TaskSection";
import FileSection from "./_sections/FileSection";
import ActionSection from "./_sections/ActionSection";
import PromptPreview from "./_sections/PromptPreview";
import { default as RegexInputComponent } from "./_components/regex-input";
import { Button } from "@/components/ui/button";

/**
 * Generate Prompt Form
 * 
 * Orchestrates the prompt generation UI components.
 * All business logic and state management is delegated to hooks.
 * The form itself is composed of focused presentational sections.
 * Uses Context to pass state to child components.
 */
export default function GeneratePromptForm() {
  // Initialize state from the central hook
  const contextValue = useGeneratePromptState();
  
  // Create memoized props for TaskSection to prevent unnecessary re-renders
  const taskSectionState = useMemo(() => ({
    taskDescription: contextValue.taskState.taskDescription,
    isGeneratingGuidance: contextValue.isGeneratingGuidance,
    projectDirectory: contextValue.projectDirectory || '',
    taskDescriptionRef: contextValue.taskState.taskDescriptionRef,
    // Add these props to satisfy the type requirements
    isFindingFiles: false,
    pastedPaths: ""
  }), [
    contextValue.taskState.taskDescription,
    contextValue.isGeneratingGuidance,
    contextValue.projectDirectory,
    contextValue.taskState.taskDescriptionRef
  ]);

  const taskSectionActions = useMemo(() => ({
    handleTaskChange: contextValue.taskState.setTaskDescription,
    handleTranscribedText: contextValue.taskState.setTaskDescription,
    handleInteraction: contextValue.handleInteraction,
    copyArchPrompt: contextValue.handleGenerateGuidance,
    // Add this prop to satisfy the type requirements
    handleFindRelevantFiles: () => Promise.resolve()
  }), [
    contextValue.taskState.setTaskDescription,
    contextValue.handleInteraction,
    contextValue.handleGenerateGuidance
  ]);

  return (
    <GeneratePromptContext.Provider value={contextValue}>
      <div className="py-4 w-full flex h-full">
        <div className="flex flex-col flex-1 space-y-8 w-full">
          {/* ProjectSection - Handles project directory selection and session management */}
          <Suspense fallback={<div>Loading project section...</div>}>
            <FileManagementProvider
              projectDirectory={contextValue.projectDirectory || ''}
              activeSessionId={contextValue.activeSessionId}
              taskDescription={contextValue.taskState.taskDescription}
              sessionData={undefined}
            >
              <ProjectSection />
            </FileManagementProvider>
          </Suspense>

          {/* Message when no session is active */}
          {!contextValue.activeSessionId && contextValue.projectDirectory && (
            <div className="text-center text-muted-foreground italic p-4 border border-dashed rounded-md border-border">
              Create a new session or load an existing one to start working.
            </div>
          )}

          {/* Only show the rest of the form when a session is active and initialized */}
          {contextValue.activeSessionId && contextValue.sessionInitialized && (
            <FileManagementProvider
              projectDirectory={contextValue.projectDirectory || ''}
              activeSessionId={contextValue.activeSessionId}
              taskDescription={contextValue.taskState.taskDescription}
              sessionData={undefined}
            >
              {/* Task Description Section */}
              <div>
                <TaskSection 
                  state={taskSectionState}
                  actions={taskSectionActions}
                />
              </div>

              {/* Pattern & Regex Section */}
              <Suspense fallback={<div>Loading pattern input...</div>}>
                <div className="flex flex-col gap-4">
                  <div className="flex justify-between items-center mb-2">
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={contextValue.regexState.handleGenerateRegexFromTask}
                      disabled={!contextValue.taskState.taskDescription.trim() || contextValue.regexState.isGeneratingTaskRegex}
                      className="h-8"
                    >
                      {contextValue.regexState.isGeneratingTaskRegex ? (
                        <>
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          Generating...
                        </>
                      ) : (
                        "Generate Regex from Task"
                      )}
                    </Button>
                    {contextValue.regexState.regexGenerationError && (
                      <p className="text-xs text-destructive">{contextValue.regexState.regexGenerationError}</p>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">Uses AI to suggest regex patterns based on the task description.</p>

                  <Suspense fallback={<div>Loading regex input...</div>}>
                    <RegexInputComponent
                      titleRegex={contextValue.regexState.titleRegex}
                      contentRegex={contextValue.regexState.contentRegex}
                      negativeTitleRegex={contextValue.regexState.negativeTitleRegex}
                      negativeContentRegex={contextValue.regexState.negativeContentRegex}
                      onTitleRegexChange={contextValue.regexState.setTitleRegex}
                      onContentRegexChange={contextValue.regexState.setContentRegex}
                      onNegativeTitleRegexChange={contextValue.regexState.setNegativeTitleRegex}
                      onNegativeContentRegexChange={contextValue.regexState.setNegativeContentRegex}
                      titleRegexError={contextValue.regexState.titleRegexError}
                      contentRegexError={contextValue.regexState.contentRegexError}
                      negativeTitleRegexError={contextValue.regexState.negativeTitleRegexError}
                      negativeContentRegexError={contextValue.regexState.negativeContentRegexError}
                      isRegexActive={contextValue.regexState.isRegexActive}
                      onRegexActiveChange={contextValue.regexState.setIsRegexActive}
                      onInteraction={contextValue.handleInteraction}
                      onClearPatterns={contextValue.regexState.handleClearPatterns}
                    />
                  </Suspense>
                </div>
              </Suspense>

              {/* File Selection Section */}
              <div>
                <Suspense fallback={<div>Loading file browser...</div>}>
                  <FileSection />
                </Suspense>
              </div>

              {/* Action Section */}
              <div>
                <Suspense fallback={<div>Loading action section...</div>}>
                  <ActionSection />
                </Suspense>
              </div>

              {/* Prompt Preview Section */}
              <div className="flex-1 mb-4">
                <PromptPreview 
                  state={{
                    prompt: contextValue.prompt || "", // Use prompt from context if available
                    copySuccess: contextValue.copySuccess || false,
                    showPrompt: true,
                    tokenCount: contextValue.tokenCount || 0,
                    isCopyingPrompt: false
                  }}
                  actions={{
                    copyPrompt: contextValue.copyPrompt || (async () => {}),
                    togglePromptView: () => contextValue.setShowPrompt && contextValue.setShowPrompt(!contextValue.showPrompt)
                  }}
                />
              </div>
            </FileManagementProvider>
          )}
        </div>
      </div>
    </GeneratePromptContext.Provider>
  );
}