"use client";

import React, { Suspense } from "react";
import { Loader2 } from "lucide-react";
import ProjectDirectorySelector from "../_components/project-directory-selector";
import SessionManager from "../_components/session-manager";
import { useGeneratePrompt } from "../_contexts/generate-prompt-context";

interface ProjectSectionProps {
  disabled?: boolean;
}

const ProjectSection = React.memo(function ProjectSection({ disabled }: ProjectSectionProps) {
  const context = useGeneratePrompt();

  const {
    projectDirectory,
    sessionInitialized,
    getCurrentSessionState,
    setSessionInitialized
  } = context;

  // Get the current session state directly without depending on FileManagementContext
  const getFullSessionState = () => {
    return getCurrentSessionState();
  };

  return (
    <>
      <ProjectDirectorySelector
        disabled={disabled}
      />

      <div className="mt-6">
        <Suspense fallback={
          <div className="text-center text-muted-foreground border rounded-lg p-4 min-h-[120px] flex items-center justify-center">
            <Loader2 className="h-4 w-4 animate-spin inline-block mr-2"/>
            Loading session manager...
          </div>
        }>
          <SessionManager
            projectDirectory={projectDirectory || ''}
            getCurrentSessionState={getFullSessionState}
            onLoadSession={(session) => {}}
            sessionInitialized={sessionInitialized}
            onSessionStatusChange={(hasSession: boolean) => {
              requestAnimationFrame(() => {
                setSessionInitialized(hasSession);
              });
            }}
            onSessionNameChange={(name: string) => {}}
            disabled={disabled}
          />
        </Suspense>
      </div>
    </>
  );
});

export default ProjectSection;