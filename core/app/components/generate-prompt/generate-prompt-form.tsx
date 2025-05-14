"use client";

import React, { Suspense, useMemo } from "react";
import { Loader2 } from "lucide-react";
import { useGeneratePromptState } from "./_hooks/use-generate-prompt-state";
import { GeneratePromptContext } from "./_contexts/generate-prompt-context";
import { useSessionContext } from '@core/lib/contexts/session-context';
import ProjectSection from "./_sections/ProjectSection";
import TaskSection from "./_sections/TaskSection";
import { FileManagementProvider } from "./_contexts/file-management-provider";
import { useFileManagement } from "./_contexts/file-management-context";
import FileSection from "./_sections/FileSection";
import ActionsSection from "./_sections/ActionsSection";
import ImplementationPlanActions from "./_components/implementation-plan-actions";

// Define a separate component to handle file management
// This avoids issues with conditional hook calls
// Inner component that uses the file management context
function FileManagementContent({
  taskSectionState,
  taskSectionActions,
  contextValue,
  hasSession
}: {
  taskSectionState: any;
  taskSectionActions: any;
  contextValue: any;
  hasSession: boolean;
}) {
  // Access file management state directly
  const fileState = useFileManagement();

  return (
    <>
      {/* Task section */}
      <div className="mt-4">
        <TaskSection
          state={taskSectionState}
          actions={taskSectionActions}
        />
      </div>

      {/* Actions section */}
      <div className="mt-4">
        <ActionsSection
          regexState={contextValue.regexState}
          taskDescription={contextValue.taskState.taskDescription}
          titleRegexError={null}
          contentRegexError={null}
          negativeTitleRegexError={null}
          negativeContentRegexError={null}
          isFindingFiles={fileState.isFindingFiles}
          executeFindRelevantFiles={fileState.findRelevantFiles}
          findFilesMode={fileState.findFilesMode}
          setFindFilesMode={fileState.setFindFilesMode}
          searchSelectedFilesOnly={fileState.searchSelectedFilesOnly}
          toggleSearchSelectedFilesOnly={fileState.toggleSearchSelectedFilesOnly}
          includedFilesCount={fileState.includedPaths.length}
          canUndo={fileState.canUndo}
          canRedo={fileState.canRedo}
          undoSelection={fileState.undoSelection}
          redoSelection={fileState.redoSelection}
          onInteraction={contextValue.handleInteraction}
          disabled={!hasSession}
        />
      </div>

      {/* File section */}
      <FileSection />

      {/* Implementation Plan Actions Section */}
      <div className="mt-8">
        <ImplementationPlanActions disabled={!hasSession} />
      </div>
    </>
  );
}

// Outer wrapper component
function FileManagementWrapper({
  projectDirectory,
  taskDescription,
  hasSession,
  taskSectionState,
  taskSectionActions,
  contextValue
}: {
  projectDirectory: string | null;
  taskDescription: string;
  hasSession: boolean;
  taskSectionState: any;
  taskSectionActions: any;
  contextValue: any;
}) {
  // Return null when no project directory exists
  if (!projectDirectory) return null;

  return (
    <FileManagementProvider
      projectDirectory={projectDirectory}
      taskDescription={taskDescription}
    >
      {!hasSession ? (
        <div className="text-center text-muted-foreground italic p-4 border border-dashed rounded-md border-border bg-card/50">
          Create a new session or load an existing one to start working.
        </div>
      ) : (
        <FileManagementContent
          taskSectionState={taskSectionState}
          taskSectionActions={taskSectionActions}
          contextValue={contextValue}
          hasSession={hasSession}
        />
      )}
    </FileManagementProvider>
  );
}

// Memoize the wrapper component to prevent unnecessary re-renders
const MemoizedFileManagementWrapper = React.memo(FileManagementWrapper);

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

  // Get sessionContext to access the task description directly
  const sessionContext = useSessionContext();

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
    triggerSave: contextValue.triggerSave,
    copyArchPrompt: (selectedPaths: string[]) => contextValue.handleGenerateGuidance(selectedPaths),
    handleImproveSelection: contextValue.taskState.handleImproveSelection
  }), [contextValue]);

  const hasSession = Boolean(contextValue.activeSessionId || sessionContext.currentSession);

  return (
    <GeneratePromptContext.Provider value={contextValue}>
      <div className="py-4 w-full flex h-full">
        <div className="flex flex-col flex-1 space-y-8 w-full">
          {/* ProjectSection - Handles project directory selection and session management */}
          <Suspense fallback={
            <div className="flex justify-center items-center p-4 text-muted-foreground text-sm border rounded-lg bg-card/50 min-h-[200px]">
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
              Loading project section...
            </div>
          }>
            {/* ProjectSection */}
            <ProjectSection disabled={false} />
          </Suspense>

          {/* Always render the file management provider with memoization */}
          <MemoizedFileManagementWrapper
            projectDirectory={contextValue.projectDirectory}
            taskDescription={contextValue.taskState.taskDescription || ""}
            hasSession={hasSession}
            taskSectionState={taskSectionState}
            taskSectionActions={taskSectionActions}
            contextValue={contextValue}
          />
        </div>
      </div>
    </GeneratePromptContext.Provider>
  );
}