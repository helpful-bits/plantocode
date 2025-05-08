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
import { Button } from "@/components/ui/button";
import { Session } from "@/types/session-types";

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
    isImprovingText: contextValue.taskState.isImprovingText,
    textImprovementJobId: contextValue.taskState.textImprovementJobId
  }), [
    contextValue.taskState.taskDescription,
    contextValue.isGeneratingGuidance,
    contextValue.projectDirectory,
    contextValue.taskState.taskDescriptionRef,
    contextValue.taskState.isImprovingText,
    contextValue.taskState.textImprovementJobId
  ]);

  const taskSectionActions = useMemo(() => ({
    handleTaskChange: contextValue.taskState.setTaskDescription,
    handleTranscribedText: contextValue.taskState.setTaskDescription,
    handleInteraction: contextValue.handleInteraction,
    copyArchPrompt: (selectedPaths: string[]) => contextValue.handleGenerateGuidance(selectedPaths),
    handleImproveSelection: contextValue.taskState.handleImproveSelection
  }), [
    contextValue
  ]);

  // Create session data for FileManagementProvider with the minimum required fields
  // Use loadedSessionFilePrefs as the authoritative source for file preferences
  const getSessionData = () => {
    if (!contextValue.activeSessionId) return undefined;
    
    // Get the current session state for non-file preferences
    const currentState = contextValue.getCurrentSessionState();
    
    // Use the loaded session file preferences or empty defaults
    const filePrefs = contextValue.loadedSessionFilePrefs || {
      includedFiles: [],
      forceExcludedFiles: [],
      searchTerm: "",
      searchSelectedFilesOnly: false
    };
    
    // Create a session object with the minimum required fields
    const sessionData: Session = {
      id: contextValue.activeSessionId,
      name: contextValue.sessionName || "Untitled Session",
      createdAt: Date.now(),
      projectDirectory: contextValue.projectDirectory || '/unknown',
      taskDescription: currentState.taskDescription || "",
      titleRegex: currentState.titleRegex || "",
      contentRegex: currentState.contentRegex || "",
      negativeTitleRegex: currentState.negativeTitleRegex || "",
      negativeContentRegex: currentState.negativeContentRegex || "",
      isRegexActive: currentState.isRegexActive !== undefined ? currentState.isRegexActive : true,
      includedFiles: filePrefs.includedFiles,
      forceExcludedFiles: filePrefs.forceExcludedFiles,
      searchTerm: filePrefs.searchTerm,
      searchSelectedFilesOnly: filePrefs.searchSelectedFilesOnly,
    };
    
    return sessionData;
  };

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
              sessionData={getSessionData()}
              isSwitchingSession={contextValue.isSwitchingSession}
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
              sessionData={getSessionData()}
              isSwitchingSession={contextValue.isSwitchingSession}
            >
              {/* Task Description Section */}
              <div>
                <TaskSection 
                  state={taskSectionState}
                  actions={taskSectionActions}
                />
              </div>

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