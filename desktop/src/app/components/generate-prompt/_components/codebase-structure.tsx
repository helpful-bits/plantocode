"use client";

import { Loader2, FolderTree } from "lucide-react";
import { useState, useEffect, ChangeEvent } from "react";

import { createGenerateDirectoryTreeJobAction } from "@/actions/file-system/directory-tree.actions";

import { useBackgroundJobs } from "@/contexts/background-jobs";
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
  const [jobId, setJobId] = useState<string | null>(null);

  // Track background job
  const { getJobById } = useBackgroundJobs();

  // Handle text input change
  const handleChange = (e: ChangeEvent<HTMLTextAreaElement>) => {
    onChange(e.target.value);
  };

  // Generate directory tree using the background job system
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
      // Create the background job and store the returned job ID
      const result = await createGenerateDirectoryTreeJobAction("system", projectDirectory, undefined);

      if (!result.isSuccess || !result.data?.jobId) {
        throw new Error(result.message || "Failed to create job");
      }

      setJobId(result.data.jobId);
    } catch (_error) {
      setError("Failed to generate directory tree.");
      setIsGenerating(false);
    }
  };

  // Monitor job completion
  useEffect(() => {
    if (!jobId) {
      return;
    }
    
    const job = getJobById(jobId);
    if (!job) {
      return;
    }

    if (job.status === "completed" && job.response) {
      try {
        const parsed = JSON.parse(job.response) as { directory: string; tree: string };
        if (parsed.tree && parsed.tree.trim()) {
          onChange(parsed.tree);
          setIsExpanded(true);
          setError(null);
        } else {
          setError("Could not generate a meaningful directory tree.");
        }
      } catch (_err) {
        setError("Failed to parse directory tree result");
      }

      setIsGenerating(false);
      setJobId(null);
    } else if (job.status === "failed" || job.status === "canceled") {
      setError(job.errorMessage || "Failed to generate directory tree");
      setIsGenerating(false);
      setJobId(null);
    }
  }, [getJobById, onChange, jobId]);

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
            disabled={isGenerating || !projectDirectory}
            className="h-8"
          >
            {isGenerating ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <FolderTree className="h-4 w-4 mr-2" />
            )}
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
            className="min-h-[200px] font-mono text-sm resize-y"
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
