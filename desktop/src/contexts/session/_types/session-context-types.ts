import { type Session } from "../../../types/session-types";
import type { Dispatch, SetStateAction } from "react";


// Define the state context type (read-only session data)
export interface SessionStateContextType {
  // Session state
  currentSession: Session | null;
  // Loading state
  isSessionLoading: boolean;
  // Session modification tracking
  isSessionModified: boolean;
  // Active session ID management
  activeSessionId: string | null;
  // Session error
  sessionError: Error | null;
}

// Define the actions context type (functions that modify session state)
export interface SessionActionsContextType {
  // State setters
  setCurrentSession: Dispatch<SetStateAction<Session | null>>;
  setSessionLoading: (loading: boolean) => void;
  setSessionModified: (modified: boolean) => void;
  setActiveSessionId: (sessionId: string | null) => void;

  // Session field updates
  updateCurrentSessionFields: (fields: Partial<Session>) => void;

  // Session operations
  saveCurrentSession: () => Promise<boolean>;
  flushSaves: () => Promise<boolean>;
  loadSessionById: (sessionId: string) => Promise<void>;
  createNewSession: (
    name: string,
    initialState: Partial<Session>
  ) => Promise<string | null>;
  deleteActiveSession: () => Promise<void>;
  deleteNonActiveSession: (sessionId: string) => Promise<void>;
  renameActiveSession: (newName: string) => Promise<void>;
  renameSession: (sessionId: string, newName: string) => Promise<void>;
}
