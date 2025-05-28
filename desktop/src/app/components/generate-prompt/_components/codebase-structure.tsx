"use client";

import { FolderTree } from "lucide-react";
import { useState, ChangeEvent } from "react";

import { generateDirectoryTreeAction } from "@/actions/file-system/directory-tree.actions";
import { useProject } from "@/contexts/project-context";
import { Button } from "@/ui/button";
import { Textarea } from "@/ui/textarea";




interface CodebaseStructureProps {
  value: string;
  onChange: (value: string) => void;
}

/**
 * Component for showing and generating a codebase structure visualization
 * Uses backend for all file system operations
 */
export default function CodebaseStructure({
  value,
  onChange,
}: CodebaseStructureProps) {
  // UI state
  const { projectDirectory } = useProject();
  const [isExpanded, setIsExpanded] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Handle text input change
  const handleChange = (e: ChangeEvent<HTMLTextAreaElement>) => {
    onChange(e.target.value);
  };

  // Generate directory tree directly
  const handleGenerateStructure = async () => {
    if (!projectDirectory) {
      setError(
        "No project directory selected. Please select a project directory first."
      );
      return;
    }

    setError(null);
    setIsGenerating(true);

    try {
      const result = await generateDirectoryTreeAction(projectDirectory);

      if (result.isSuccess && result.data?.directoryTree) {
        onChange(result.data.directoryTree);
        setIsExpanded(true);
        setError(null);
      } else {
        setError(result.message || "Failed to generate directory tree");
      }
    } catch (error) {
      setError("Failed to generate directory tree.");
    } finally {
      setIsGenerating(false);
    }
  };


  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-2">
        <label htmlFor="codebaseStructure" className="font-bold text-foreground">Codebase Structure</label>
        <div className="flex flex-wrap items-center gap-2 mt-1 sm:mt-0">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={handleGenerateStructure}
            disabled={!projectDirectory}
            className="h-8"
          >
            <FolderTree className="h-4 w-4 mr-2" />
            {isGenerating ? "Generating..." : "Generate"}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setIsExpanded(!isExpanded)}
            className="text-sm text-muted-foreground hover:text-foreground h-8"
          >
            {isExpanded ? "Hide" : "Show"}
          </Button>
        </div>
      </div>

      <p className="text-xs text-muted-foreground mb-2">
        Automatically generates the project structure using the backend file
        system API.
      </p>

      {isExpanded && (
        <>
          <div className="text-sm text-muted-foreground mb-2">
            Define the directory structure using ASCII tree format to help the
            model understand your project organization.
          </div>
          <Textarea
            id="codebaseStructure"
            value={value}
            onChange={handleChange}
            placeholder={`project/
  ├── folder/        # Purpose
  │   └── file.ts    # Description
  └── ...

Defines your project's file structure to provide better context for the AI.`}
            className="min-h-[200px] font-mono text-sm resize-y bg-background/90 backdrop-blur-sm border border-border/60 rounded-lg shadow-soft"
          />
        </>
      )}

      {error && <p className="text-sm text-destructive mt-1">{error}</p>}

      <div className="mt-2 text-sm text-muted-foreground">
        Adding your project structure helps the AI better understand your
        codebase organization. If you&apos;re experiencing issues with generation,
        try selecting a smaller directory or write it manually.
      </div>
    </div>
  );
}

CodebaseStructure.displayName = "CodebaseStructure";
