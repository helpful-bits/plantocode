"use client";

import { useState } from "react";
import { generateDirectoryTree } from "@/lib/directory-tree";

interface CodebaseStructureProps {
  value: string;
  onChange: (value: string) => void;
  projectDirectory: string;
}

export default function CodebaseStructure({ value, onChange, projectDirectory }: CodebaseStructureProps) {
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
  };

  const handleGenerateStructure = async () => {
    if (!projectDirectory) return;
    
    setIsGenerating(true);
    try {
      const tree = await generateDirectoryTree(projectDirectory);
      if (tree) {
        onChange(tree);
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
          <button
            onClick={handleGenerateStructure}
            disabled={isGenerating || !projectDirectory}
            className="text-sm bg-secondary text-secondary-foreground px-2 py-1 rounded disabled:opacity-50"
          >
            {isGenerating ? "Generating..." : "Generate from Project"}
          </button>
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="text-sm text-muted-foreground hover:text-foreground"
          >
            {isExpanded ? "Hide" : "Show"}
          </button>
        </div>
      </div>
      
      {isExpanded && (
        <>
          <div className="text-sm text-muted-foreground">
            Define the current or planned directory structure using ASCII tree format.
          </div>
          <textarea
            className="font-mono text-sm border rounded bg-background text-foreground p-2 h-48"
            value={value}
            onChange={handleChange}
            placeholder="project/
  ├── folder/        # Purpose
  │   └── file.ts    # Description
  └── ..."
          />
          <div className="flex justify-end gap-2">
            <button
              onClick={handleExample}
              className="text-sm text-primary hover:text-primary/80"
            >
              Insert Example
            </button>
          </div>
        </>
      )}
    </div>
  );
} 