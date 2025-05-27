"use client";

import { H3, P, Subtle } from "@/ui/typography";

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
            <div className="p-6 border border-destructive/20 bg-background/95 backdrop-blur-sm shadow-soft rounded-xl">
              <H3 className="text-destructive">Project Section Error</H3>
              <P className="text-destructive text-sm mt-1">Unable to load project section. Please try refreshing.</P>
            </div>
          }
        >
          {/* ProjectSection */}
          <div className="relative">
            <ProjectSection disabled={false} />
          </div>
        </ErrorBoundary>

        {/* FileManagementContent wrapped with its own provider */}
        {projectDirectory ? (
          <ErrorBoundary
            fallback={
              <div className="p-6 border border-destructive/20 bg-background/95 backdrop-blur-sm shadow-soft rounded-xl">
                <H3 className="text-destructive">File Management Error</H3>
                <P className="text-destructive text-sm mt-1">Unable to load file management. Please try selecting the project directory again.</P>
              </div>
            }
          >
            <FileManagementProvider>
              <div className="relative">
                <MemoizedFileManagementWrapper
                  hasSession={hasSession}
                />
              </div>
            </FileManagementProvider>
          </ErrorBoundary>
        ) : (
          <div className="text-center text-muted-foreground italic p-6 border border-dashed rounded-xl border-border/60 bg-background/80 backdrop-blur-sm shadow-soft">
            <P>No project directory selected.</P>
            <Subtle className="mt-2">Please select a project directory in the Project section above.</Subtle>
          </div>
        )}
      </div>
    </div>
  );
}

GeneratePromptForm.displayName = "GeneratePromptForm";
GeneratePromptFormContent.displayName = "GeneratePromptFormContent";
