"use client";

import React, { Suspense } from "react";
import { Loader2 } from "lucide-react";
import ProjectDirectorySelector from "../_components/project-directory-selector";
import SessionManager from "../_components/session-manager";
import { useGeneratePrompt } from "../_contexts/generate-prompt-context";
import { useFileManagement } from "../_contexts/file-management-context";

const ProjectSection = React.memo(function ProjectSection() {
  const context = useGeneratePrompt();
  const fileState = useFileManagement();
  
  const { 
    projectDirectory, 
    activeSessionId, 
    sessionInitialized, 
    isRestoringSession,
    getCurrentSessionState,
    handleLoadSession,
    setSessionInitialized
  } = context;
  
  // Show loading overlay when loading files or restoring session
  const showLoadingOverlay = fileState.isLoadingFiles || isRestoringSession;
  
  // Get the current file state to include in session state
  const getFullSessionState = () => {
    return getCurrentSessionState(fileState.getFileStateForSession());
  };

  return (
    <>
      <ProjectDirectorySelector />
      
      <Suspense fallback={
        <div className="text-center text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin inline-block mr-2"/>
          Loading session manager...
        </div>
      }>
        <SessionManager 
          projectDirectory={projectDirectory || ''}
          getCurrentSessionState={getFullSessionState}
          onLoadSession={handleLoadSession}
          activeSessionId={activeSessionId}
          sessionInitialized={sessionInitialized}
          onSessionStatusChange={(hasSession: boolean) => setSessionInitialized(hasSession)}
          onSessionNameChange={(name: string) => {}} // No need to handle name changes at this level
          onActiveSessionIdChange={() => {}} // ActiveSessionId is now controlled by context
        />
      </Suspense>
      
      {/* Loading/Initializing Overlay */}
      {showLoadingOverlay && (
        <div className="flex items-center justify-center p-6 bg-card border rounded-lg shadow-sm text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin mr-3" />
          <span>
            {isRestoringSession ? "Restoring session..." : 
             fileState.isLoadingFiles ? "Loading project files..." : 
             "Initializing..."}
          </span>
        </div>
      )}
    </>
  );
});

export default ProjectSection;