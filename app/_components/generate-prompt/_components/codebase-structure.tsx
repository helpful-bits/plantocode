"use client";

import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { useProject } from "@/lib/contexts/project-context"; // Import useProject
import { Loader2 } from "lucide-react"; // Import Loader2
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
    if (!projectDirectory) return;

    setError(null);
    setIsGenerating(true);
    try { // Corrected: Call the utility function
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
      <div className="flex items-center justify-between mb-1"> {/* Reduced bottom margin */}
        <label className="font-bold text-foreground">Codebase Structure (Optional):</label>
        <div className="flex gap-2">
          <Button
            type="button"
            variant="secondary" size="sm"
            onClick={handleGenerateStructure}
            disabled={isGenerating || !projectDirectory}
          >
            {isGenerating ? (
              <Loader2 className="animate-spin -ml-1 mr-2 h-4 w-4" />
            ) : null} {/* Add Loader2 icon */}
            {isGenerating ? "Generating..." : "Generate Tree"} {/* Update button text */}
            {/* Added Loader2 icon */}
            {/* Update button text */}
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
          <div className="text-sm text-muted-foreground mb-1"> {/* Reduced bottom margin */}
            Define the current or planned directory structure using ASCII tree format.
          </div>
          <Textarea
            id="codebaseStructure"
            value={value}
            onChange={handleChange}
            placeholder={`project/
  ├── folder/        # Purpose
  │   └── file.ts    # Description
  └── ...`}
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
