"use client";

import { useProject } from "@/lib/contexts/project-context";
import { Button } from "@/components/ui/button"; // Import Button
// Note: This component might be redundant if ProjectDirectorySelector is always shown.
// Consider removing if the selector is always available at the top level.
export function ProjectDirectoryInput() {
  const { projectDirectory, setProjectDirectory } = useProject();

  return (
    <div className="flex flex-col mb-6">
      <label className="mb-2 font-bold text-foreground">Project Directory:</label>
      {/* Removed ProjectDirectorySelector */}
    </div>
  );
}
