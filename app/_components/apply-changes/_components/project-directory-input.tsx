"use client";

import { useProject } from "@/lib/contexts/project-context";
import { useEffect } from "react";
import { GLOBAL_PROJECT_DIR_KEY } from "@/lib/constants";

export function ProjectDirectoryInput() {
  const { projectDirectory, setProjectDirectory } = useProject();

  const handleDirectoryChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setProjectDirectory(e.target.value);
  };

  useEffect(() => {
    const savedDir = localStorage.getItem(GLOBAL_PROJECT_DIR_KEY);
    if (savedDir) {
      setProjectDirectory(savedDir);
    }
  }, [setProjectDirectory]);

  return (
    <div className="flex flex-col">
      <label className="mb-2 font-bold text-foreground">Project Directory:</label>
      <input
        className="border rounded bg-background text-foreground p-2 w-full"
        type="text"
        value={projectDirectory}
        onChange={handleDirectoryChange}
        placeholder="e.g. /Users/myusername/projects/o1-pro-flow"
      />
    </div>
  );
} 