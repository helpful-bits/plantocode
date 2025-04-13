"use client";

import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { useState } from "react";
import { generateDirectoryTree } from "@/lib/directory-tree";
import { useProject } from "@/lib/contexts/project-context";

interface CodebaseStructureProps {
  value: string;
  onChange: (value: string) => void; // Callback for parent state update
  onInteraction: () => void; // Callback to notify parent about interaction
}

export default function CodebaseStructure({ value, onChange, onInteraction }: CodebaseStructureProps) {
  const { projectDirectory } = useProject();
  const [isExpanded, setIsExpanded] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    onChange(e.target.value);
  };

  const handleExample = () => {
    const example = `project/
  ├── src/           # Source code
  │   ├── components/  # React components
  │   ├── lib/         # Utility functions
  │   └── types/       # TypeScript types
  └── tests/         # Test files`;
    onChange(example);
    onInteraction(); // Notify parent about interaction
  };

  const handleGenerateStructure = async () => {
    if (!projectDirectory) return;
    
    setIsGenerating(true);
    try {
      const tree = await generateDirectoryTree(projectDirectory);
      if (tree) {
        onChange(tree);
        setIsExpanded(true); // Show the generated tree
        onInteraction(); // Notify parent about interaction
      }
    } catch (error) {
      console.error('Failed to generate directory tree:', error);
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <label className="font-bold text-foreground">Codebase Structure:</label>
        <div className="flex gap-2">
          <Button
            variant="secondary" size="sm"
            onClick={handleGenerateStructure}
            disabled={isGenerating || !projectDirectory}
          >
            {isGenerating ? "Generating..." : "Generate from Project"}
          </Button>
          <Button
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
          <div className="text-sm text-muted-foreground">
            Define the current or planned directory structure using ASCII tree format.
          </div>
          <Textarea
            className="font-mono text-sm border rounded bg-background text-foreground p-2 h-48"
            value={value}
            onChange={handleChange}
            placeholder="project/
  ├── folder/        # Purpose
  │   └── file.ts    # Description
  └── ..."
          />
          <div className="flex justify-end gap-2">
            <Button
              variant="link" size="sm"
              onClick={handleExample}
            >
              Insert Example
            </Button>
          </div>

        </>
      )}
    </div>
  );
} 