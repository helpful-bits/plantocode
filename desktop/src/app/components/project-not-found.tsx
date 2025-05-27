"use client";

import { FolderOpen } from "lucide-react";
import { useCallback, useState } from "react";

import { Button } from "@/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/ui/card";
import { P } from "@/ui/typography";

interface ProjectNotFoundProps {
  onSelectProject?: () => void;
}

function ProjectNotFound({
  onSelectProject,
}: ProjectNotFoundProps) {
  const [isSelectingDirectory, setIsSelectingDirectory] = useState(false);

  const handleSelectDirectory = useCallback(() => {
    if (!onSelectProject) return;

    setIsSelectingDirectory(true);

    try {
      // Call the parent handler
      onSelectProject();
    } finally {
      // Reset state after a short delay
      setTimeout(() => {
        setIsSelectingDirectory(false);
      }, 500);
    }
  }, [onSelectProject]);

  return (
    <Card className="w-full max-w-2xl mx-auto bg-background/90 backdrop-blur-sm shadow-soft border-border/20 rounded-xl">
      <CardHeader className="pb-3">
        <CardTitle className="text-xl text-foreground">No Project Selected</CardTitle>
        <CardDescription className="text-muted-foreground">
          Please select a project directory to continue
        </CardDescription>
      </CardHeader>
      <CardContent className="pt-3">
        <P className="text-muted-foreground mb-6">
          You need to select a project directory before you can use this
          application. The project directory should be the root directory of
          your codebase.
        </P>
        <Button
          onClick={handleSelectDirectory}
          disabled={!onSelectProject}
          isLoading={isSelectingDirectory}
          loadingText="Selecting..."
          className="flex items-center gap-2 bg-primary hover:bg-primary/90 text-primary-foreground"
          size="default"
        >
          <FolderOpen className="h-4 w-4" />
          Select Project Directory
        </Button>
      </CardContent>
    </Card>
  );
}

ProjectNotFound.displayName = "ProjectNotFound";

export default ProjectNotFound;
