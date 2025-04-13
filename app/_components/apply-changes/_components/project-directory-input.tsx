"use client";

import { useProject } from "@/lib/contexts/project-context";
import { useState } from "react";
import ProjectDirectorySelector from "@/app/_components/generate-prompt/_components/project-directory-selector";

export function ProjectDirectoryInput() {
  const { projectDirectory, setProjectDirectory } = useProject();
  const [isLoadingFiles, setIsLoadingFiles] = useState(false);

  // This component now leverages ProjectDirectorySelector which handles directory selection safely
  // The ProjectProvider already handles loading the project directory

  // Handle directory change
  const handleDirectoryChange = (value: string) => {
    // Set the directory value in the project context
    setProjectDirectory(value);
  };

  return (
    <div className="flex flex-col">
      <label className="mb-2 font-bold text-foreground">Project Directory:</label>
      <ProjectDirectorySelector
        value={projectDirectory}
        onChange={handleDirectoryChange}
        isLoadingFiles={isLoadingFiles}
      />
    </div>
  );
} 