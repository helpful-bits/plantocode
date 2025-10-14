"use client";

import { createContext, useContext, useMemo, useEffect } from "react";
import type { ReactNode } from "react";
import { listen } from "@tauri-apps/api/event";

import {
  useProjectDirectoryManager,
  type ProjectDirectoryState,
} from "./_hooks/use-project-directory-manager";
import { logError } from "@/utils/error-handling";

export interface ProjectContextValue extends ProjectDirectoryState {
  setProjectDirectory: (dir: string) => Promise<void>;
  externalFolders: string[];
  setExternalFolders: (folders: string[]) => Promise<void>;
}

// Create the context without default values, will force provider usage
const ProjectContext = createContext<ProjectContextValue | null>(null);

export function ProjectProvider({ children }: { children: ReactNode }) {
  // Use the extracted hook for project directory management
  const {
    projectDirectory,
    isLoading,
    error,
    setProjectDirectory,
    externalFolders,
    setExternalFolders,
  } = useProjectDirectoryManager();

  // AuthFlowManager now controls app initialization state

  const value = useMemo(
    () => ({
      projectDirectory,
      setProjectDirectory,
      isLoading,
      error,
      externalFolders,
      setExternalFolders,
    }),
    [projectDirectory, setProjectDirectory, isLoading, error, externalFolders, setExternalFolders]
  );

  useEffect(() => {
    let unlisten: (() => void) | null = null;

    const setupListener = async () => {
      try {
        unlisten = await listen<{ type: string; payload: { projectDirectory: string }; relayOrigin: string }>(
          "device-link-event",
          (event) => {
            const { type, payload } = event.payload;

            if (type === "project-directory-updated") {
              const newDir = payload?.projectDirectory;
              if (newDir && newDir !== projectDirectory) {
                setProjectDirectory(newDir).catch((err) => {
                  console.error("Failed to update project directory from remote:", err);
                });
              }
            }
          }
        );
      } catch (err) {
        console.error("Failed to setup project-directory-updated listener:", err);
      }
    };

    setupListener();

    return () => {
      if (unlisten) {
        unlisten();
      }
    };
  }, [projectDirectory, setProjectDirectory]);

  return (
    <ProjectContext.Provider value={value}>
      {children}
    </ProjectContext.Provider>
  );
}

export function useProject(): ProjectContextValue {
  const context = useContext(ProjectContext);
  if (!context) {
    const error = new Error("useProject must be used within a ProjectProvider");
    logError(error, "Project Context - Hook Used Outside Provider").catch(() => {});
    throw error;
  }
  return context;
}
