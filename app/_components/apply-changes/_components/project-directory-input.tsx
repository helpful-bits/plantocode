"use client";

import { useProject } from "@/lib/contexts/project-context";
import { useEffect, useState } from "react";
import { GLOBAL_PROJECT_DIR_KEY } from "@/lib/constants"; // Assuming constants are in lib/constants.ts
import ProjectDirectorySelector from "@/app/_components/generate-prompt/_components/project-directory-selector";

export function ProjectDirectoryInput() {
  const { projectDirectory, setProjectDirectory } = useProject();
  const [isLoadingFiles, setIsLoadingFiles] = useState(false);

  // This component now leverages ProjectDirectorySelector which handles directory selection safely
  
  useEffect(() => {
    const savedDir = localStorage.getItem(GLOBAL_PROJECT_DIR_KEY);
    if (savedDir) {
      setProjectDirectory(savedDir);
    }
  }, [setProjectDirectory]);

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