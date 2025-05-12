"use client";

import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { useProject } from "@/lib/contexts/project-context";
import { Loader2, FolderTree } from "lucide-react"; // Replace TreeStructure with FolderTree icon
import { useState } from "react";
import { generateDirectoryTree } from "@/lib/directory-tree";
interface CodebaseStructureProps { // Keep interface definition
  value: string;
  onChange: (value: string) => void; // Callback for parent state update
}

export default function CodebaseStructure({ value, onChange }: CodebaseStructureProps) {
  const { projectDirectory } = useProject();
  const [isExpanded, setIsExpanded] = useState(false); // Default to collapsed
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    onChange(e.target.value);
  };
  
  // Callback to generate directory tree
  const handleGenerateStructure = async () => {
    if (!projectDirectory) {
      setError("No project directory selected. Please select a project directory first.");
      return;
    }

    setError(null);
    setIsGenerating(true);

    try {
      const tree = await generateDirectoryTree(projectDirectory);

      if (tree && tree.trim()) {
        onChange(tree);
        setIsExpanded(true); // Show the generated tree
        setError(null); // Clear error on success
      } else {
        // Handle empty tree result
        setError("Could not generate a meaningful directory tree. Try with a smaller directory.");
      }
    } catch (error) {
      setError("Failed to generate directory tree. Is `tree` command available?");
      console.error('Failed to generate directory tree:', error);
    } finally {
      setIsGenerating(false); // Ensure loading state is reset
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-2">
        <label className="font-bold text-foreground">Codebase Structure</label>
        <div className="flex flex-wrap items-center gap-2 mt-1 sm:mt-0">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={handleGenerateStructure}
            disabled={isGenerating || !projectDirectory}
            className="h-8"
          >
            {isGenerating
              ? <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              : <FolderTree className="h-4 w-4 mr-2" />}
            Generate
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
        Automatically generates the project structure using file system information.
      </p>
      
      {isExpanded && (
        <>
          <div className="text-sm text-muted-foreground mb-2">
            Define the directory structure using ASCII tree format to help the model understand your project organization.
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
            className="min-h-[200px] font-mono text-sm resize-y"
          />
        </>
      )}

      {error && (
        <p className="text-sm text-destructive mt-1">{error}</p>
      )}

      <div className="mt-2 text-sm text-muted-foreground">
        Adding your project structure helps the AI better understand your codebase organization. If you&apos;re experiencing issues with generation, try selecting a smaller directory or write it manually.
      </div>
    </div>
  );
}
