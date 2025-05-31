"use client";

import React from "react";
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
  } = useCorePromptContext();

  return (
    <>
      <ProjectDirectorySelector disabled={disabled} />

      <div className="mt-6">
        <SessionManager
          projectDirectory={projectDirectory || ""}
          disabled={disabled}
        />
      </div>
    </>
  );
});

ProjectSection.displayName = "ProjectSection";

export default ProjectSection;