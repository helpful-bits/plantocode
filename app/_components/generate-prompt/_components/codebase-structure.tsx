"use client";

import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button"; // Fixed duplicate import
import { useState, useCallback } from "react";
import { generateDirectoryTree } from "@/lib/directory-tree";
interface CodebaseStructureProps {
  value: string;
  onChange: (value: string) => void; // Callback for parent state update
}

export default function CodebaseStructure({ value, onChange }: CodebaseStructureProps) {
  const { projectDirectory } = useProject();
  const [isExpanded, setIsExpanded] = useState(true); // Default to expanded
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null); // State for error message

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    onChange(e.target.value);
  };


  const handleGenerateStructure = async () => {
    if (!projectDirectory) return;
    
    setIsGenerating(true);
    try {
      const tree = await generateDirectoryTree(projectDirectory);
      if (tree) {
        onChange(tree);
        setIsExpanded(true); // Show the generated tree
        setError(null); // Clear error on success
      }
    } catch (error) {
      setError("Failed to generate directory tree. Is `tree` command available?");
      console.error('Failed to generate directory tree:', error);
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <label className="font-bold text-foreground">Codebase Structure (Optional):</label>
        <div className="flex gap-2">
          <Button
            type="button"
            variant="secondary" size="sm"
            onClick={handleGenerateStructure}
            disabled={isGenerating || !projectDirectory}
          >
            {isGenerating ? "Generating..." : "Generate from Project"}
          </Button>
          <Button
            type="button"
            variant="ghost" size="sm"
            onClick={() => setIsExpanded(!isExpanded)}
            className="text-sm text-muted-foreground hover:text-foreground"
          >
            {isExpanded ? "Hide" : "Show"}
          </Button>
        </div>
      </div>
      
      {isExpanded && (
        <>
          <div className="text-sm text-muted-foreground mb-2">
            Define the current or planned directory structure using ASCII tree format.
          </div>
          <Textarea
            id="codebaseStructure" // Added id for label association
            value={value}
            onChange={handleChange}
            placeholder="project/
  ├── folder/        # Purpose
  │   └── file.ts    # Description
  └── ..."
            className="min-h-[150px] font-mono text-sm" // Increased min height and added font
          />
          {error && (
            <p className="text-sm text-destructive">{error}</p>
          )}
        </>
      )}
    </div>
  );
} 