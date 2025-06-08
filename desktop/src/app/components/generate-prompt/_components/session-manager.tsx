"use client";

import { RefreshCw } from "lucide-react";
import { memo } from "react";

import { useSessionStateContext } from "@/contexts/session";
import { type Session } from "@/types/session-types";
import {
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/ui/alert-dialog";
import { Button } from "@/ui/button";

import { useSessionManagerOrchestrator } from "../_hooks/session-management";

import NewSessionForm from "./session-manager/NewSessionForm";
import SessionList from "./session-manager/SessionList";


export interface SessionManagerProps {
  projectDirectory: string;
  disabled?: boolean;
  onLoadSession?: (session: Session) => Promise<void>; // Optional custom session loader
}

const SessionManager = ({
  projectDirectory,
  disabled = false,
  onLoadSession,
}: SessionManagerProps) => {
  // Get contexts
  const { activeSessionId, isSessionLoading: globalIsSwitching } =
    useSessionStateContext();

  // Use the session manager orchestrator hook
  const {
    sessions,
    sessionNameInput,
    editingSessionId,
    editSessionNameInput,
    isLoading,
    error,

    setSessionNameInput,
    loadSessionsFromServer,
    handleSaveNewSession,
    handleUpdateSessionName,
    handleDeleteSession,
    handleLoadSessionWrapper,
    handleCloneSessionWrapper,
    startEditingSessionWrapper,
    cancelEditingWrapper,
    setEditSessionNameInput,
  } = useSessionManagerOrchestrator({
    projectDirectory,
  });

  // Function to render the delete confirmation dialog
  const renderDeleteDialog = (sessionId: string, sessionName: string) => (
    <AlertDialogContent>
      <AlertDialogHeader>
        <AlertDialogTitle>Delete Session</AlertDialogTitle>
        <AlertDialogDescription className="text-balance">
          This will permanently delete the session &quot;{sessionName}&quot;.
          This action cannot be undone.
        </AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter>
        <AlertDialogCancel
          onClick={(e: React.MouseEvent) => e.stopPropagation()}
          disabled={isLoading || disabled}
        >
          Cancel
        </AlertDialogCancel>
        <Button
          onClick={(e: React.MouseEvent<HTMLButtonElement>) => {
            e.stopPropagation();
            void handleDeleteSession(sessionId);
          }}
          className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          isLoading={isLoading}
          loadingText="Deleting..."
          disabled={disabled}
        >
          Delete
        </Button>
      </AlertDialogFooter>
    </AlertDialogContent>
  );


  return (
    <div className="space-y-2">
      {/* New Session Form */}
      <NewSessionForm
        sessionNameInput={sessionNameInput}
        onSessionNameInputChange={setSessionNameInput}
        onSave={handleSaveNewSession}
        isLoading={isLoading}
        disabled={disabled}
        globalIsSwitching={globalIsSwitching}
      />

      {/* Sessions List */}
      <div className="border border-border rounded-xl shadow-soft bg-card/95 backdrop-blur-sm">
        <div className="p-3 bg-muted/80 backdrop-blur-sm border-b border-border flex justify-between items-center rounded-t-xl">
          <h3 className="text-lg font-semibold text-foreground">Sessions</h3>
        </div>

        <SessionList
          sessions={sessions}
          activeSessionId={activeSessionId}
          editingSessionId={editingSessionId}
          editSessionNameInput={editSessionNameInput}
          onLoadSession={onLoadSession || handleLoadSessionWrapper}
          onStartEdit={startEditingSessionWrapper}
          onCloneSession={handleCloneSessionWrapper}
          onSaveEdit={handleUpdateSessionName}
          onCancelEdit={cancelEditingWrapper}
          onEditInputChange={setEditSessionNameInput}
          isLoading={isLoading}
          disabled={disabled}
          globalIsSwitching={globalIsSwitching}
          renderDeleteDialog={renderDeleteDialog}
        />
      </div>

      {/* Error Display */}
      {error && (
        <div className="text-center text-destructive text-xs mt-1">{error}</div>
      )}

      {/* Refresh Button */}
      <div className="flex justify-end mt-2">
        <Button
          size="sm"
          variant="outline"
          className="text-xs h-8 px-3 text-foreground"
          onClick={() => {
            void loadSessionsFromServer(true);
          }}
          disabled={disabled}
        >
          <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
          Refresh
        </Button>
      </div>
    </div>
  );
};

// Export the component with memo to prevent unnecessary re-renders
SessionManager.displayName = "SessionManager";

export default memo(SessionManager);
