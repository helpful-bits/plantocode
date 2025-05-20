"use client";

import { type ReactNode, useState } from "react";

import DirectoryBrowser from "@/app/components/generate-prompt/_components/directory-browser";
import ProjectNotFound from "@/app/components/project-not-found";
import { useProject } from "@/contexts/project-context";

interface RequireProjectDirectoryProps {
  children: ReactNode;
  title?: string;
  description?: string;
}


export function RequireProjectDirectory({
  children,
  title: _title, // Prefix with _ to indicate unused
  description: _description, // Prefix with _ to indicate unused
}: RequireProjectDirectoryProps) {
  const { projectDirectory, setProjectDirectory } = useProject();
  const [isDirectoryBrowserOpen, setIsDirectoryBrowserOpen] = useState(false);

  const handleOpenDirectoryBrowser = () => {
    setIsDirectoryBrowserOpen(true);
  };

  const handleDirectorySelected = async (selectedPath: string) => {
    setIsDirectoryBrowserOpen(false);
    if (selectedPath) {
      await setProjectDirectory(selectedPath);
    }
  };

  if (!projectDirectory) {
    return (
      <>
        <ProjectNotFound onSelectProject={handleOpenDirectoryBrowser} />
        <DirectoryBrowser
          onClose={() => setIsDirectoryBrowserOpen(false)}
          onSelect={handleDirectorySelected}
          initialPath={projectDirectory || ""}
          isOpen={isDirectoryBrowserOpen}
        />
      </>
    );
  }

  return <>{children}</>;
}

// InlineProjectNotFound component has been removed as it duplicates functionality in ProjectNotFound
