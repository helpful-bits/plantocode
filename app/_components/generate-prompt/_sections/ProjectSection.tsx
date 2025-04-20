"use client";

import React, { Suspense } from "react";
import { Loader2 } from "lucide-react";
import ProjectDirectorySelector from "../_components/project-directory-selector";
import SessionManager from "../_components/session-manager";

interface ProjectSectionProps {
  state: {
    projectDirectory: string;
    activeSessionId: string | null;
    sessionInitialized: boolean;
    isRefreshingFiles: boolean;
    isRestoringSession: boolean;
    projectDataLoading: boolean;
    isLoadingFiles: boolean;
    sessionSaveError: string | null;
    showLoadingOverlay: boolean;
  };
  actions: {
    refreshFiles: () => Promise<void>;
    handleSetActiveSessionId: (id: string | null) => void;
    handleLoadSession: (session: any) => void;
    getCurrentSessionState: () => any;
    setSessionInitialized: (initialized: boolean) => void;
  };
}

export default function ProjectSection({ state, actions }: ProjectSectionProps) {
  const { 
    projectDirectory, 
    activeSessionId, 
    sessionInitialized, 
    isRefreshingFiles,
    showLoadingOverlay,
    sessionSaveError
  } = state;
  
  const { 
    refreshFiles, 
    handleSetActiveSessionId, 
    handleLoadSession,
    getCurrentSessionState,
    setSessionInitialized
  } = actions;

  return (
    <>
      <ProjectDirectorySelector 
        onRefresh={refreshFiles} 
        isRefreshing={isRefreshingFiles} 
      />
      
      <Suspense fallback={
        <div className="text-center text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin inline-block mr-2"/>
          Loading session manager...
        </div>
      }>
        <SessionManager 
          projectDirectory={projectDirectory}
          getCurrentSessionState={getCurrentSessionState}
          onLoadSession={handleLoadSession}
          activeSessionId={activeSessionId}
          setActiveSessionIdExternally={handleSetActiveSessionId}
          sessionInitialized={sessionInitialized}
          onSessionStatusChange={(hasSession: boolean) => setSessionInitialized(hasSession)}
          onSessionNameChange={(name: string) => {}} // No need to handle name changes at this level
          onActiveSessionIdChange={handleSetActiveSessionId}
        />
        
        {/* Display auto-save errors near session manager */}
        {sessionSaveError && (
          <div className="text-xs text-destructive text-center mt-0.5 -mb-2">
            ⚠️ Auto-save failed: {sessionSaveError}
          </div>
        )}
      </Suspense>
      
      {/* Loading/Initializing Overlay */}
      {showLoadingOverlay && (
        <div className="flex items-center justify-center p-6 bg-card border rounded-lg shadow-sm text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin mr-3" />
          <span>
            {isRefreshingFiles ? "Refreshing files..." : 
             state.isRestoringSession ? "Restoring session..." : 
             state.isLoadingFiles ? "Loading project files..." : 
             "Initializing..."}
          </span>
        </div>
      )}
    </>
  );
} 