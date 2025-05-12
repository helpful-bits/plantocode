"use client";

import { useCallback, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FolderOpen, Loader2 } from "lucide-react";

interface ProjectNotFoundProps {
  onSelectProject?: () => void;
}

export default function ProjectNotFound({ onSelectProject }: ProjectNotFoundProps) {
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
    <Card className="w-full max-w-2xl mx-auto">
      <CardHeader className="pb-3">
        <CardTitle className="text-xl">No Project Selected</CardTitle>
        <CardDescription>
          Please select a project directory to continue
        </CardDescription>
      </CardHeader>
      <CardContent className="pt-3">
        <p className="text-muted-foreground mb-6">
          You need to select a project directory before you can use this application.
          The project directory should be the root directory of your codebase.
        </p>
        <Button 
          onClick={handleSelectDirectory}
          disabled={isSelectingDirectory || !onSelectProject}
          className="flex items-center gap-2"
          size="default"
        >
          {isSelectingDirectory ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <FolderOpen className="h-4 w-4" />
          )}
          {isSelectingDirectory ? 'Selecting...' : 'Select Project Directory'}
        </Button>
      </CardContent>
    </Card>
  );
} 