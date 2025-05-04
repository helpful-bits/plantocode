"use client";

import React, { Suspense, useRef } from "react";
import { Loader2 } from "lucide-react";
import { useGeneratePromptState, OutputFormat } from "./_hooks/use-generate-prompt-state";
import ProjectSection from "./_sections/ProjectSection";
import TaskSection from "./_sections/TaskSection";
import FileSection from "./_sections/FileSection";
import ActionSection from "./_sections/ActionSection";
import PromptPreview from "./_sections/PromptPreview";
import GeminiSection from "./_sections/GeminiSection";
import { default as RegexInputComponent } from "./_components/regex-input";
import { Button } from "@/components/ui/button";
import { usePromptGenerator } from "./_hooks/use-prompt-generator";

/**
 * Generate Prompt Form
 * 
 * Orchestrates the prompt generation UI components.
 * All business logic and state management is delegated to hooks.
 * The form itself is composed of focused presentational sections.
 */
export default function GeneratePromptForm() {
  // Initialize state from the central hook
  const hookResult = useGeneratePromptState();

  // Get prompt generator state
  const promptState = usePromptGenerator({
    taskDescription: hookResult.taskState.taskDescription,
    allFilesMap: hookResult.fileState.allFilesMap,
    fileContentsMap: hookResult.fileState.fileContentsMap,
    pastedPaths: hookResult.fileState.pastedPaths,
    projectDirectory: hookResult.projectDirectory,
    diffTemperature: hookResult.diffTemperature
  });

  // Create helper functions to avoid type issues
  const handleInteraction = async () => {
    hookResult.setHasUnsavedChanges(true);
    return Promise.resolve();
  };

  // Create a wrapper for setOutputFormat to handle type differences
  const handleSetOutputFormatWrapper = (value: string) => { 
    hookResult.setOutputFormat(value as OutputFormat); 
  };

  // Create a wrapper function for saveSessionState that doesn't require parameters
  const handleSaveSessionStateWrapper = async () => { 
    if (hookResult.activeSessionId) { 
      await hookResult.saveSessionState(hookResult.activeSessionId); 
    } else { 
      console.warn("Attempted to save session state without an active session ID."); 
    } 
  };

  // Create a stable ref for the task description textarea
  const taskDescriptionRef = useRef<any>(null);

  // Create computed state for ProjectSection
  const projectSectionState = {
    projectDirectory: hookResult.projectDirectory,
    activeSessionId: hookResult.activeSessionId,
    sessionInitialized: hookResult.sessionInitialized,
    isRefreshingFiles: hookResult.fileState.isRefreshingFiles,
    isRestoringSession: hookResult.isRestoringSession,
    projectDataLoading: hookResult.projectDataLoading,
    isLoadingFiles: hookResult.fileState.isLoadingFiles,
    showLoadingOverlay: hookResult.fileState.isLoadingFiles || hookResult.fileState.isRefreshingFiles || hookResult.isRestoringSession,
    currentSessionName: hookResult.sessionName
  };

  // Create actions for ProjectSection
  const projectSectionActions = {
    refreshFiles: hookResult.fileState.refreshFiles,
    handleSetActiveSessionId: hookResult.setActiveSessionId,
    handleLoadSession: (sessionOrId: any) => {
      console.log('[GeneratePromptForm] handleLoadSession received:', typeof sessionOrId, sessionOrId);
      // Pass the full session object to the handler
      hookResult.handleLoadSession(sessionOrId);
    },
    getCurrentSessionState: hookResult.getCurrentSessionState,
    setSessionInitialized: hookResult.setSessionInitialized
  };

  // Function to handle transcribed text from VoiceTranscription
  const handleTranscribedText = (text: string) => {
    if (text && typeof text === 'string' && text.trim() !== '') {
      hookResult.taskState.setTaskDescription(text);
      hookResult.setHasUnsavedChanges(true);
    }
  };

  return (
    <div className="py-4 w-full flex h-full">
      <div className="flex flex-col flex-1 space-y-8 w-full">
        {/* ProjectSection - Handles project directory selection and session management */}
        <ProjectSection 
          state={projectSectionState} 
          actions={projectSectionActions} 
        />

        {/* Message when no session is active */}
        {!hookResult.activeSessionId && hookResult.projectDirectory && (
          <div className="text-center text-muted-foreground italic p-4 border border-dashed rounded-md border-border">
            Create a new session or load an existing one to start working.
          </div>
        )}

        {/* Only show the rest of the form when a session is active and initialized */}
        {hookResult.activeSessionId && hookResult.sessionInitialized && (
          <>
            {/* Task Description Section */}
            <div>
              <TaskSection 
                state={{
                  taskDescription: hookResult.taskState.taskDescription,
                  isFindingFiles: hookResult.fileState.isFindingFiles,
                  isGeneratingGuidance: hookResult.isGeneratingGuidance,
                  taskCopySuccess: hookResult.taskState.taskCopySuccess,
                  isCopyingPrompt: promptState.isCopyingPrompt,
                  projectDirectory: hookResult.projectDirectory,
                  pastedPaths: hookResult.fileState.pastedPaths,
                  taskDescriptionRef: taskDescriptionRef,
                  searchSelectedFilesOnly: hookResult.fileState.searchSelectedFilesOnly,
                  isImprovingText: hookResult.taskState.isImprovingText,
                  textImprovementJobId: hookResult.taskState.textImprovementJobId
                }} 
                actions={{
                  handleTaskChange: hookResult.taskState.setTaskDescription,
                  handleTranscribedText: handleTranscribedText,
                  handleInteraction,
                  handleFindRelevantFiles: hookResult.fileState.findRelevantFiles,
                  copyArchPrompt: promptState.copyArchPrompt,
                  toggleSearchSelectedFilesOnly: () => hookResult.fileState.setSearchSelectedFilesOnly(!hookResult.fileState.searchSelectedFilesOnly),
                  handleImproveSelection: hookResult.taskState.handleImproveSelection
                }} 
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
                    onClick={hookResult.regexState.handleGenerateRegexFromTask}
                    disabled={!hookResult.taskState.taskDescription.trim() || hookResult.regexState.isGeneratingTaskRegex}
                    className="h-8"
                  >
                    {hookResult.regexState.isGeneratingTaskRegex ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Generating...
                      </>
                    ) : (
                      "Generate Regex from Task"
                    )}
                  </Button>
                  {hookResult.regexState.regexGenerationError && (
                    <p className="text-xs text-destructive">{hookResult.regexState.regexGenerationError}</p>
                  )}
                </div>
                <p className="text-xs text-muted-foreground mt-1">Uses AI to suggest regex patterns based on the task description.</p>

                <RegexInputComponent
                  titleRegex={hookResult.regexState.titleRegex}
                  contentRegex={hookResult.regexState.contentRegex}
                  negativeTitleRegex={hookResult.regexState.negativeTitleRegex}
                  negativeContentRegex={hookResult.regexState.negativeContentRegex}
                  onTitleRegexChange={hookResult.regexState.setTitleRegex}
                  onContentRegexChange={hookResult.regexState.setContentRegex}
                  onNegativeTitleRegexChange={hookResult.regexState.setNegativeTitleRegex}
                  onNegativeContentRegexChange={hookResult.regexState.setNegativeContentRegex}
                  titleRegexError={hookResult.regexState.titleRegexError}
                  contentRegexError={hookResult.regexState.contentRegexError}
                  negativeTitleRegexError={hookResult.regexState.negativeTitleRegexError}
                  negativeContentRegexError={hookResult.regexState.negativeContentRegexError}
                  isRegexActive={hookResult.regexState.isRegexActive}
                  onRegexActiveChange={hookResult.regexState.setIsRegexActive}
                  onInteraction={handleInteraction}
                  onClearPatterns={hookResult.regexState.handleClearPatterns}
                />
              </div>
            </Suspense>

            {/* File Selection Section */}
            <div>
              <FileSection 
                state={{
                  allFilesMap: hookResult.fileState.allFilesMap,
                  fileContentsMap: hookResult.fileState.fileContentsMap,
                  searchTerm: hookResult.fileState.searchTerm,
                  titleRegex: hookResult.regexState.titleRegex,
                  contentRegex: hookResult.regexState.contentRegex,
                  negativeTitleRegex: hookResult.regexState.negativeTitleRegex,
                  negativeContentRegex: hookResult.regexState.negativeContentRegex,
                  isRegexActive: hookResult.regexState.isRegexActive,
                  pastedPaths: hookResult.fileState.pastedPaths,
                  externalPathWarnings: hookResult.fileState.externalPathWarnings,
                  isFindingFiles: hookResult.fileState.isFindingFiles,
                  isLoadingFiles: hookResult.fileState.isLoadingFiles,
                  showOnlySelected: hookResult.fileState.showOnlySelected,
                  taskDescription: hookResult.taskState.taskDescription,
                  projectDirectory: hookResult.projectDirectory,
                  loadingStatus: hookResult.fileState.loadingStatus,
                  titleRegexError: hookResult.regexState.titleRegexError,
                  contentRegexError: hookResult.regexState.contentRegexError,
                  negativeTitleRegexError: hookResult.regexState.negativeTitleRegexError,
                  negativeContentRegexError: hookResult.regexState.negativeContentRegexError
                }} 
                actions={{
                  handleFilesMapChange: hookResult.fileState.setAllFilesMap,
                  handleSearchChange: hookResult.fileState.setSearchTerm,
                  handlePastedPathsChange: hookResult.fileState.setPastedPaths,
                  handlePathsPreview: paths => {
                    // Join paths and set them in the pastedPaths field
                    const pathsText = paths.join('\n');
                    hookResult.fileState.setPastedPaths(pathsText);
                  },
                  toggleFileSelection: hookResult.fileState.toggleFileSelection,
                  toggleShowOnlySelected: () => hookResult.fileState.setShowOnlySelected(!hookResult.fileState.showOnlySelected),
                  handleInteraction,
                  saveFileSelections: () => {
                    // Create a wrapper that doesn't require parameters
                    if (hookResult.activeSessionId) {
                      return hookResult.fileState.saveFileSelections(hookResult.activeSessionId);
                    }
                    return Promise.resolve();
                  },
                  handleFindRelevantFiles: hookResult.fileState.findRelevantFiles,
                  copyArchPrompt: promptState.copyArchPrompt,
                  handleAddPathToPastedPaths: async path => {
                    hookResult.fileState.setPastedPaths(hookResult.fileState.pastedPaths ? `${hookResult.fileState.pastedPaths}\n${path}` : path);
                    return Promise.resolve();
                  }
                }} 
              />
            </div>

            {/* Action Section */}
            <div>
              <ActionSection 
                state={{
                  taskDescription: hookResult.taskState.taskDescription,
                  outputFormat: hookResult.outputFormat,
                  projectDirectory: hookResult.projectDirectory,
                  prompt: promptState.prompt,
                  hasUnsavedChanges: hookResult.hasUnsavedChanges,
                  tokenCount: promptState.tokenCount,
                  isGenerating: promptState.isGenerating,
                  isCustomPromptMode: hookResult.isCustomPromptMode,
                  allFilesMap: hookResult.fileState.allFilesMap,
                  isLoading: promptState.isGenerating,
                  isLoadingFiles: hookResult.fileState.isLoadingFiles,
                  diffTemperature: hookResult.diffTemperature
                }}
                actions={{
                  generatePrompt: promptState.generatePrompt,
                  setDiffTemperature: hookResult.setDiffTemperature,
                  handleSetDiffTemperature: hookResult.setDiffTemperature,
                  handleSetOutputFormat: handleSetOutputFormatWrapper,
                  copyPrompt: promptState.copyPrompt,
                  handleSaveSessionState: handleSaveSessionStateWrapper,
                  handleToggleCustomPromptMode: () => hookResult.setIsCustomPromptMode(!hookResult.isCustomPromptMode),
                  handleInteraction,
                  handleGenerateGuidance: hookResult.handleGenerateGuidance,
                  handleGenerateCodebase: hookResult.handleGenerateCodebase
                }}
              />
            </div>

            {/* Prompt Preview Section */}
            <div className="flex-1 mb-4">
              <PromptPreview 
                state={{
                  prompt: promptState.prompt,
                  showPrompt: hookResult.showPrompt,
                  tokenCount: promptState.tokenCount,
                  copySuccess: promptState.copySuccess,
                  isCopyingPrompt: promptState.isCopyingPrompt,
                  isLoading: promptState.isGenerating
                }}
                actions={{
                  togglePromptView: () => hookResult.setShowPrompt(!hookResult.showPrompt),
                  copyPrompt: promptState.copyPrompt,
                  handleSetCustomPrompt: hookResult.setCustomPrompt
                }}
              />
            </div>

            {/* Only show Gemini section in custom prompt mode */}
            {hookResult.isCustomPromptMode && (
              <div className="flex-1 mb-4">
                <GeminiSection 
                  state={{
                    isGenerating: promptState.isGenerating,
                    prompt: promptState.prompt,
                    geminiApiKey: hookResult.geminiApiKey,
                    geminiResponse: hookResult.geminiResponse,
                    isSubmittingToGemini: hookResult.isSubmittingToGemini,
                    geminiErrorMessage: hookResult.geminiErrorMessage,
                    activeSessionId: hookResult.activeSessionId,
                    projectDirectory: hookResult.projectDirectory,
                    sessionInitialized: hookResult.sessionInitialized
                  }}
                  actions={{
                    handleSetGeminiApiKey: hookResult.handleSetGeminiApiKey,
                    handleSubmitToGemini: hookResult.handleSubmitToGemini,
                    handleClearGeminiResponse: hookResult.handleClearGeminiResponse
                  }}
                />
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// Lazy load RegexInput component
