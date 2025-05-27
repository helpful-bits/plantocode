"use client";

import { Loader2 } from "lucide-react";
import { Suspense } from "react";

import { MemoizedFileManagementWrapper } from "./_components/file-management-wrapper";
import { useCorePromptContext } from "./_contexts/core-prompt-context";
import { FileManagementProvider } from "./_contexts/file-management-provider";
import { useTaskContext } from "./_contexts/task-context";
import ProjectSection from "./_sections/project-section";
import { ErrorBoundary } from "@/components/error-boundary";

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
        <ErrorBoundary
          fallback={
            <div className="p-4 border border-red-200 bg-red-50 rounded-lg">
              <h3 className="text-red-800 font-medium">Project Section Error</h3>
              <p className="text-red-600 text-sm mt-1">Unable to load project section. Please try refreshing.</p>
            </div>
          }
        >
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
        </ErrorBoundary>

        {/* FileManagementContent wrapped with its own provider */}
        {projectDirectory ? (
          <ErrorBoundary
            fallback={
              <div className="p-4 border border-red-200 bg-red-50 rounded-lg">
                <h3 className="text-red-800 font-medium">File Management Error</h3>
                <p className="text-red-600 text-sm mt-1">Unable to load file management. Please try selecting the project directory again.</p>
              </div>
            }
          >
            <FileManagementProvider>
              <MemoizedFileManagementWrapper
                hasSession={hasSession}
              />
            </FileManagementProvider>
          </ErrorBoundary>
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

GeneratePromptForm.displayName = "GeneratePromptForm";
GeneratePromptFormContent.displayName = "GeneratePromptFormContent";
