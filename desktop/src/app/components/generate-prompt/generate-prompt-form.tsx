"use client";

import { Loader2 } from "lucide-react";
import { Suspense } from "react";

import { MemoizedFileManagementWrapper } from "./_components/file-management-wrapper";
import { useCorePromptContext } from "./_contexts/core-prompt-context";
import { FileManagementProvider } from "./_contexts/file-management-provider";
import { useTaskContext } from "./_contexts/task-context";
import ProjectSection from "./_sections/project-section";

/**
 * Generate Prompt Form
 *
 * Orchestrates the prompt generation UI components.
 * Uses the GeneratePromptFeatureProvider to provide granular contexts to all child components.
 * The form itself is composed of focused presentational sections.
 */
export default function GeneratePromptForm() {
  return <GeneratePromptFormContent />;
}

// Separate content component that consumes the contexts
function GeneratePromptFormContent() {
  // Get data from contexts
  const {
    state: { projectDirectory, activeSessionId },
  } = useCorePromptContext();

  // Initialize task context
  useTaskContext();

  const hasSession = Boolean(activeSessionId);

  return (
    <div className="py-4 w-full flex h-full">
      <div className="flex flex-col flex-1 space-y-8 w-full">
        {/* ProjectSection - Handles project directory selection and session management */}
        <Suspense
          fallback={
            <div className="flex justify-center items-center p-4 text-muted-foreground text-sm border rounded-lg bg-card/50 min-h-[200px]">
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
              Loading project section...
            </div>
          }
        >
          {/* ProjectSection */}
          <ProjectSection disabled={false} />
        </Suspense>

        {/* FileManagementContent wrapped with its own provider */}
        {projectDirectory ? (
          <FileManagementProvider projectDirectory={projectDirectory}>
            <MemoizedFileManagementWrapper
              projectDirectory={projectDirectory}
              hasSession={hasSession}
            />
          </FileManagementProvider>
        ) : (
          <div className="text-center text-muted-foreground italic p-4 border border-dashed rounded-md border-border bg-card/50">
            <p>No project directory selected.</p>
            <p className="text-xs mt-2">Please select a project directory in the Project section above.</p>
          </div>
        )}
      </div>
    </div>
  );
}
