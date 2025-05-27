"use client";

import { type ReactNode, useCallback } from "react";
import { open } from "@tauri-apps/plugin-dialog";

import ProjectNotFound from "@/app/components/project-not-found";
import { useProject } from "@/contexts/project-context";
import { getHomeDirectoryAction } from "@/actions";
import { useNotification } from "@/contexts/notification-context";

interface RequireProjectDirectoryProps {
  children: ReactNode;
}


export function RequireProjectDirectory({
  children,
}: RequireProjectDirectoryProps) {
  const { projectDirectory, setProjectDirectory } = useProject();
  const { showNotification } = useNotification();

  const handleOpenDirectoryBrowser = useCallback(async () => {
    try {
      // Get default path - use home directory
      let defaultPath = "";
      const homeResult = await getHomeDirectoryAction();
      if (homeResult?.isSuccess && homeResult.data) {
        defaultPath = homeResult.data;
      }

      // Open native directory picker
      const selectedPath = await open({
        directory: true,
        multiple: false,
        defaultPath: defaultPath || undefined,
      });

      // Handle selection
      if (selectedPath && typeof selectedPath === 'string') {
        await setProjectDirectory(selectedPath);
        showNotification({
          title: "Project Directory Set",
          message: "Project directory has been selected successfully.",
          type: "success",
        });
      }
    } catch (error) {
      console.error("[RequireProjectDirectory] Error opening directory dialog:", error);
      showNotification({
        title: "Error",
        message: "Failed to open directory picker",
        type: "error",
      });
    }
  }, [setProjectDirectory, showNotification]);

  if (!projectDirectory) {
    return <ProjectNotFound onSelectProject={handleOpenDirectoryBrowser} />;
  }

  return <>{children}</>;
}

// InlineProjectNotFound component has been removed as it duplicates functionality in ProjectNotFound
