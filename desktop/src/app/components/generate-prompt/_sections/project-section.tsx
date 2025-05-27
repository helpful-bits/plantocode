"use client";

import { Loader2 } from "lucide-react";
import React, { Suspense, useCallback } from "react";
import ProjectDirectorySelector from "../_components/project-directory-selector";
import SessionManager from "../_components/session-manager";
import { useCorePromptContext } from "../_contexts/core-prompt-context";

interface ProjectSectionProps {
  disabled?: boolean;
}

const ProjectSection = React.memo(function ProjectSection({
  disabled,
}: ProjectSectionProps) {
  const {
    state: { projectDirectory },
    actions: { getCurrentSessionState, setSessionName },
  } = useCorePromptContext();

  const handleLoadSession = useCallback(() => {
    // Session loading is handled through context
  }, []);

  const handleSessionNameChange = useCallback((_name: string) => {
    // Session name changes are handled through context
    // Prefix with underscore to indicate deliberate non-use
  }, [setSessionName]);


  return (
    <>
      <ProjectDirectorySelector disabled={disabled} />

      <div className="mt-6">
        <Suspense
          fallback={
            <div className="p-4 flex items-center text-muted-foreground text-sm">
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
              Loading sessions...
            </div>
          }
        >
          <SessionManager
            projectDirectory={projectDirectory || ""}
            getCurrentSessionState={getCurrentSessionState}
            onLoadSession={handleLoadSession}
            onSessionNameChange={handleSessionNameChange}
            disabled={disabled}
          />
        </Suspense>
      </div>
    </>
  );
});

ProjectSection.displayName = "ProjectSection";

export default ProjectSection;