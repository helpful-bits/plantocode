"use client";

import { ReactNode, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FolderOpen } from "lucide-react";
import { useProject } from "@/lib/contexts/project-context";
import DirectoryBrowser from "@/app/_components/generate-prompt/_components/directory-browser";
import ProjectNotFound from "@/components/project-not-found";

interface RequireProjectDirectoryProps {
  children: ReactNode;
  title?: string;
  description?: string;
}

interface ProjectNotFoundProps {
  onSelectProject: () => void;
}

export function RequireProjectDirectory({ 
  children,
  title,
  description 
}: RequireProjectDirectoryProps) {
  const { projectDirectory, setProjectDirectory } = useProject();
  const [isDirectoryBrowserOpen, setIsDirectoryBrowserOpen] = useState(false);

  const handleOpenDirectoryBrowser = () => {
    console.log("Select Project Directory button clicked");
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

export function ProjectNotFound({ onSelectProject }: ProjectNotFoundProps) {
  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle>No Project Selected</CardTitle>
        <CardDescription>
          Please select a project directory to continue
        </CardDescription>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground mb-4">
          You need to select a project directory before you can configure project-specific settings.
        </p>
        <Button 
          variant="outline" 
          className="gap-2"
          onClick={onSelectProject}
        >
          <FolderOpen size={16} />
          Select Project Directory
        </Button>
      </CardContent>
    </Card>
  );
} 