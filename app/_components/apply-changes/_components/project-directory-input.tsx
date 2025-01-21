"use client";

import { useEffect } from "react";
import { hashString } from "@/lib/hash";

const GLOBAL_PROJECT_DIR_KEY = 'o1-pro-flow-project-dir';

interface ProjectDirectoryInputProps {
  projectDirectory: string;
  setProjectDirectory: (value: string) => void;
}

export function ProjectDirectoryInput({ projectDirectory, setProjectDirectory }: ProjectDirectoryInputProps) {
  function getLocalStorageKey(dir: string): string {
    const hash = hashString(dir);
    return `ac-${hash}-dir`;
  }

  const handleDirectoryChange = (value: string) => {
    setProjectDirectory(value);
    const cachedDir = localStorage.getItem(getLocalStorageKey(value));
    if (!cachedDir) {
      localStorage.setItem(getLocalStorageKey(value), value);
    }
    localStorage.setItem(GLOBAL_PROJECT_DIR_KEY, value);
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
        onChange={(e) => handleDirectoryChange(e.target.value)}
        placeholder="e.g. /Users/myusername/projects/o1-pro-flow"
      />
    </div>
  );
} 