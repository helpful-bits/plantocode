"use client";

import React, { useCallback } from "react";
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

  const handleSessionNameChange = useCallback((_name: string) => {
    // Session name changes are handled through context
    // Prefix with underscore to indicate deliberate non-use
  }, [setSessionName]);


  return (
    <>
      <ProjectDirectorySelector disabled={disabled} />

      <div className="mt-6">
        <SessionManager
          projectDirectory={projectDirectory || ""}
          getCurrentSessionState={getCurrentSessionState}
          onSessionNameChange={handleSessionNameChange}
          disabled={disabled}
        />
      </div>
    </>
  );
});

ProjectSection.displayName = "ProjectSection";

export default ProjectSection;