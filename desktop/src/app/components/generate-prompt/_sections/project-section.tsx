"use client";

import { Loader2 } from "lucide-react";
import React, { Suspense } from "react";

import { type Session } from "@/types/session-types";
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
    state: { projectDirectory, sessionInitialized },
    actions: { getCurrentSessionState, setSessionInitialized },
  } = useCorePromptContext();


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
            getCurrentSessionState={() => getCurrentSessionState() as Omit<Session, "id" | "name" | "updatedAt">} // Type assertion to match expected format
            onLoadSession={() => {
              // Session loading is handled through context
            }}
            onSessionNameChange={(_name) => {
              // Session name changes are handled through context
              // Prefix with underscore to indicate deliberate non-use
            }}
            sessionInitialized={sessionInitialized}
            onSessionStatusChange={(hasSession) => {
              // Only update if the status actually changed to avoid unnecessary renders
              if (hasSession !== sessionInitialized) {
                setSessionInitialized(hasSession);
              }
            }}
            disabled={disabled}
          />
        </Suspense>
      </div>
    </>
  );
});

export default ProjectSection;