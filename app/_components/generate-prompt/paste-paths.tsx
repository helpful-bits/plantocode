"use client";
import { useEffect, useState, ReactNode } from "react";
import { Textarea } from "@/components/ui/textarea";
import { Info, CheckSquare, Sparkles, Loader2 } from "lucide-react"; // Import more icons
import { correctPathsAction } from "@/actions/path-correction-actions"; // Import the new action
interface PastePathsProps {
  value: string;
  onChange: (value: string) => void;
  projectDirectory?: string;
  onInteraction?: () => void;
  onParsePaths?: (paths: string[]) => void; // Callback after parsing paths
  warnings?: string[];
  children?: ReactNode; // Allow passing children, e.g., the Find Files button
  onFindRelevantFiles?: () => Promise<void>; // Add prop for finding relevant files
  // New props for correction button
  canCorrectPaths?: boolean;
  isFindingFiles?: boolean; // Add prop for loading state
  canFindFiles?: boolean; // Add prop for button enablement condition
}

export default function PastePaths({
  value,
  onChange,
  onParsePaths,
  projectDirectory,
  onInteraction = () => {}, // Default to no-op
  warnings = [],
  children, // Receive children
  onFindRelevantFiles,
  canCorrectPaths,
  isFindingFiles,
  canFindFiles,
}: PastePathsProps) {
  const [foundCount, setFoundCount] = useState(0);
  const [isCorrectingPaths, setIsCorrectingPaths] = useState(false); // State for correction loading
  const [correctionError, setCorrectionError] = useState<string | null>(null); // State for correction errors
  const [correctionSuccess, setCorrectionSuccess] = useState<string | null>(null); // State for correction success messages
  useEffect(() => {
    if (value.trim()) { // Calculate whenever value changes
      const lines = value
        .split("\n")
        .map((l) => l.trim())
        .filter((l) => !!l && !l.startsWith("#"));
      
      // Update the internal count state
      setFoundCount(lines.length);

      // Call the optional onParsePaths callback if provided
      if (onParsePaths) {
        onParsePaths(lines); // Pass the filtered lines
      }
    } else setFoundCount(0); // Reset count if value is empty
  }, [value, onParsePaths]);

  // Handler for the path correction button
  const handleCorrectPaths = async () => {
    if (!projectDirectory || !value.trim()) return;

    setIsCorrectingPaths(true);
    setCorrectionError(null);
    setCorrectionSuccess(null);

    try {
      const result = await correctPathsAction(projectDirectory, value);
      if (result.isSuccess && result.data) {
        onChange(result.data.correctedPaths.join('\n')); // Update the textarea with corrected paths
        setCorrectionSuccess(result.message || "Paths checked/corrected successfully.");
        onInteraction(); // Notify parent about interaction
        // Clear success message after a delay
        setTimeout(() => setCorrectionSuccess(null), 3000);
      } else {
        setCorrectionError(result.message || "Failed to correct paths.");
      }
    } catch (error) {
      console.error("Error correcting paths:", error);
      setCorrectionError(error instanceof Error ? error.message : "An unexpected error occurred.");
    } finally {
      setIsCorrectingPaths(false);
    }
  };

  // Clear errors/success messages when the input value changes
  useEffect(() => {
    setCorrectionError(null);
  }, [value]);

  return (
    <div className="flex flex-col gap-2 bg-card p-4 rounded-lg border shadow-sm">
      <div className="flex items-center justify-between">
        <label className="font-bold text-foreground">
          Or Paste File Paths (one per line):
          <span className="text-sm font-normal text-muted-foreground ml-2">
            Supports project paths and external/absolute paths
          </span>
        </label>
        {value.trim() && (
          <span className="text-sm font-medium bg-secondary text-secondary-foreground px-2 py-1 rounded">
            {foundCount} path(s) found
          </span>
        )}
      </div>

      <Textarea
        className="border rounded bg-background text-foreground p-2 h-32 font-mono text-sm"
        value={value}
        onChange={(e) => {
          // Clean XML tags if present when the user pastes or types
          const cleanedValue = e.target.value.replace(/<file>|<\/file>/g, '');
          onChange(cleanedValue);
          onInteraction(); // Call interaction handler on change
        }}
        placeholder={`# Project paths
path/to/file1.ts
path/to/file2.ts

  # Lines starting with # are ignored
  # Paste paths from your file system or the 'Path Finder' output
  # The 'Find Relevant Files (AI)' button below can auto-populate this field.

# External paths (absolute or relative)
/home/user/projects/other-project/src/main.ts
../other-project/src/components/Button.tsx`}
      />
      
      {warnings && warnings.length > 0 && (
        <div className="text-amber-600 text-xs bg-amber-500/10 p-2 rounded border border-amber-500/20 flex flex-col gap-1">
          {warnings.map((warning, i) => (
            <p key={i}>⚠️ {warning}</p>
          ))}
        </div>
      )}
      {/* Render children (e.g., the Find Files button) */}
      {children && <div className="mt-1">{children}</div>}

      {/* Path Correction Button */}
      <div className="flex flex-col items-start gap-1">
          <button
              type="button"
              onClick={handleCorrectPaths}
              disabled={isCorrectingPaths || !value.trim() || !projectDirectory || !canCorrectPaths}
              className="flex items-center gap-1.5 text-xs px-2 py-1 rounded border border-input hover:bg-accent hover:text-accent-foreground disabled:opacity-50 disabled:cursor-not-allowed"
              title={!projectDirectory ? "Select a project directory first" : !value.trim() ? "Paste paths first" : "Attempt to correct potential typos in paths using AI"}
          >
              {isCorrectingPaths ? (
                  <>
                      <Loader2 className="h-3.5 w-3.5 animate-spin" /> Correcting...
                  </>
              ) : (
                  <>
                      <Sparkles className="h-3.5 w-3.5" /> Correct Paths (AI)
                  </>
              )}
          </button>
          {correctionError && <p className="text-xs text-destructive mt-1">{correctionError}</p>}
          {correctionSuccess && <p className="text-xs text-green-600 mt-1">{correctionSuccess}</p>}
      </div>


      <div className="text-xs text-muted-foreground">
        <p>• You can use both paths within the project and external/absolute paths</p>
        <p>• Lines starting with # are treated as comments</p>
        <p>• External paths will be read from the file system directly</p>
      </div>
    </div> // Close main div
  );
}
