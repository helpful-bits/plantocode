"use client";

import { H3 } from "@/ui/typography";

import { useCorePromptContext } from "./_contexts/core-prompt-context";
import { NoActiveSessionState } from "./no-active-session-state";
import ProjectSection from "./_sections/project-section";
import TaskSection from "./_sections/task-section";
import FileSection from "./_sections/file-section";
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
    state: { lifecycleStatus },
  } = useCorePromptContext();


  return (
    <div className="py-4 w-full flex h-full">
      <div className="flex flex-col flex-1 space-y-8 w-full">
        {/* ProjectSection - Handles project directory selection and session management */}
        <ErrorBoundary
          fallback={
            <div className="p-6 border border-destructive/20 bg-background/95 backdrop-blur-sm shadow-soft rounded-xl">
              <H3 className="text-destructive">Project Section Error</H3>
              <p className="text-destructive text-sm mt-1">Unable to load project section. Please try refreshing.</p>
            </div>
          }
        >
          {/* ProjectSection */}
          <div className="relative">
            <ProjectSection disabled={lifecycleStatus !== 'READY'} />
          </div>
        </ErrorBoundary>

        {lifecycleStatus === 'IDLE' ? (
          <NoActiveSessionState />
        ) : lifecycleStatus === 'INITIALIZING' || lifecycleStatus === 'RESTORING' ? (
          <div className="p-6 border border-border bg-background/95 backdrop-blur-sm shadow-soft rounded-xl">
            <div className="flex items-center justify-center space-x-3">
              <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-primary"></div>
              <span className="text-sm text-muted-foreground">
                {lifecycleStatus === 'INITIALIZING' ? 'Initializing session...' : 'Restoring session...'}
              </span>
            </div>
          </div>
        ) : lifecycleStatus === 'READY' ? (
          <>
            <ErrorBoundary
              fallback={
                <div className="p-6 border border-destructive/20 bg-background/95 backdrop-blur-sm shadow-soft rounded-xl">
                  <H3 className="text-destructive">Task Section Error</H3>
                  <p className="text-destructive text-sm mt-1">Unable to load task section. Please try refreshing.</p>
                </div>
              }
            >
              <div className="relative">
                <TaskSection disabled={false} />
              </div>
            </ErrorBoundary>

            <ErrorBoundary
              fallback={
                <div className="p-6 border border-destructive/20 bg-background/95 backdrop-blur-sm shadow-soft rounded-xl">
                  <H3 className="text-destructive">File Management Error</H3>
                  <p className="text-destructive text-sm mt-1">Unable to load file management. Please try selecting the project directory again.</p>
                </div>
              }
            >
              <div className="relative">
                <FileSection />
              </div>
            </ErrorBoundary>
          </>
        ) : (
          <NoActiveSessionState />
        )}
      </div>
    </div>
  );
}

GeneratePromptForm.displayName = "GeneratePromptForm";
GeneratePromptFormContent.displayName = "GeneratePromptFormContent";
