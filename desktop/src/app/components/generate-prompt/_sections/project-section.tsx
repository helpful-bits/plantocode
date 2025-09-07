"use client";

import React, { useCallback } from "react";
import ProjectDirectorySelector from "../_components/project-directory-selector";
import SessionManager from "../_components/session-manager";
import { ExternalFoldersSettings } from "../_components/external-folders-settings";
import { useCorePromptContext } from "../_contexts/core-prompt-context";
import { useTaskContext } from "../_contexts/task-context";
import { useSessionActionsContext, useSessionStateContext } from "@/contexts/session";
import { type Session } from "@/types/session-types";

interface ProjectSectionProps {
  disabled?: boolean;
}

const ProjectSection = React.memo(function ProjectSection({}: ProjectSectionProps) {
  const {
    state: { projectDirectory, lifecycleStatus },
  } = useCorePromptContext();

  const { actions: taskActions } = useTaskContext();
  const sessionActions = useSessionActionsContext();
  const sessionState = useSessionStateContext();

  // Create a wrapper that flushes pending task changes before switching sessions
  const handleLoadSessionWithFlush = useCallback(async (session: Session) => {
    // Check if we're already loading to avoid conflicts
    if (sessionState.isSessionLoading) {
      return;
    }
    
    // Check if the session is already loaded
    if (sessionState.currentSession?.id === session.id) {
      return;
    }

    // First, flush any pending task description changes and get the current value
    const currentTaskDescription = taskActions.flushPendingTaskChanges();
    
    // If we have pending task changes and a current session, save with the updated task description
    if (currentTaskDescription !== null && sessionState.currentSession) {
      const updatedSession = {
        ...sessionState.currentSession,
        taskDescription: currentTaskDescription
      };
      
      // Import and call saveSessionAction directly to avoid React state race conditions
      const { saveSessionAction } = await import("@/actions");
      await saveSessionAction(updatedSession);
    } else if (sessionState.isSessionModified && sessionState.currentSession) {
      // Fallback: save any other pending changes
      await sessionActions.flushSaves();
    }

    // Load the new session
    await sessionActions.loadSessionById(session.id);
  }, [taskActions, sessionActions, sessionState]);

  return (
    <>
      <ProjectDirectorySelector disabled={lifecycleStatus !== 'READY' && lifecycleStatus !== 'IDLE'} />
      
      <div className="mt-3">
        <ExternalFoldersSettings />
      </div>

      <div className="mt-6">
        <SessionManager
          projectDirectory={projectDirectory || ""}
          disabled={lifecycleStatus === 'INITIALIZING' || lifecycleStatus === 'RESTORING'}
          onLoadSession={handleLoadSessionWithFlush}
        />
      </div>
    </>
  );
});

ProjectSection.displayName = "ProjectSection";

export default ProjectSection;