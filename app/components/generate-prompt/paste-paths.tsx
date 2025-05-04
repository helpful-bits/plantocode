"use client";
import { useEffect, useState, ReactNode } from "react";
import { Textarea } from "@/components/ui/textarea";
import { Info, CheckSquare, Sparkles, Loader2, X } from "lucide-react"; // Import more icons
import { correctPathsAction } from "@/actions/path-correction-actions"; // Import the new action
import { Button } from "@/components/ui/button"; // Import Button
interface PastePathsProps {
  value: string;
  onChange: (value: string) => void;
  projectDirectory?: string;
  onInteraction?: () => void;
  onParsePaths?: (paths: string[]) => void; // Callback after parsing paths
  warnings?: string[];
  children?: ReactNode; // Allow passing children, e.g., the Find Files button
  onFindRelevantFiles?: () => Promise<void>; // For finding relevant files
  onGenerateGuidance?: () => Promise<void>; // Add new prop for generating guidance
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
  onGenerateGuidance,
  canCorrectPaths,
  isFindingFiles,
  canFindFiles,
}: PastePathsProps) {
  const [foundCount, setFoundCount] = useState(0);
  const [isCorrectingPaths, setIsCorrectingPaths] = useState(false); // State for correction loading
  const [correctionError, setCorrectionError] = useState<string | null>(null); // State for correction errors
  const [correctionSuccess, setCorrectionSuccess] = useState<string | null>(null); // State for correction success messages
  
  // Log value changes for debugging
  useEffect(() => {
    console.log("[PastePaths] Value changed:", value);
  }, [value]);
  
  // Update foundCount whenever value changes
  useEffect(() => {
    if (value.trim()) {
      const lines = value
        .split("\n")
        .map((l) => l.trim())
        .filter((l) => !!l && !l.startsWith("#"));
      
      setFoundCount(lines.length);
      console.log(`[PastePaths] Found ${lines.length} paths`);
      
      // Call the optional onParsePaths callback if provided
      if (onParsePaths) {
        onParsePaths(lines);
      }
    } else {
      setFoundCount(0);
    }
  }, [value, onParsePaths]);

  // Handler for the path correction button
  const handleCorrectPaths = async () => {
    if (!projectDirectory || !value.trim()) return;

    setIsCorrectingPaths(true);
    setCorrectionError(null);
    setCorrectionSuccess(null);

    try {
      const result = await correctPathsAction(value);
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
    setCorrectionError(null); // Clear error on input change
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
          // Clean potential XML tags when the user pastes or types
          // Also removes leading/trailing whitespace per line
          const cleanedValue = e.target.value.split('\n').map(line => line.replace(/<file>|<\/file>/g, '').trim()).join('\n');
          onChange(cleanedValue);
          onInteraction(); // Call interaction handler on change
        }}
        placeholder={`# Paste file paths here (one per line)
path/to/file1.ts
path/to/file2.ts

# Lines starting with # are ignored
# The 'Find Relevant Files' button can auto-populate this area with AI-suggested paths

# External paths (absolute or relative) are also supported
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
      {children && <div>{children}</div>}

      {/* Path Correction Button */}
      <div className="flex flex-col items-start gap-1">
          <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleCorrectPaths}
              disabled={isCorrectingPaths || !value.trim() || !projectDirectory || !canCorrectPaths}
              className="flex items-center gap-1.5 text-xs"
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
          </Button>
          <p className="text-xs text-muted-foreground mt-1">Uses AI to check pasted paths against project files and suggest corrections for typos.</p>
          {correctionError && <p className="text-xs text-destructive mt-1">{correctionError}</p>}
          {correctionSuccess && <p className="text-xs text-green-600 mt-1">{correctionSuccess}</p>}
      </div>

      <div className="text-xs text-muted-foreground">
        <p>• You can use both paths within the project and external/absolute paths</p>
        <p>• Lines starting with # are treated as comments</p>
        <p>• External paths will be read from the file system directly</p>
        <p>• If this field is empty, checked files from the file browser below will be used</p>
      </div>
    </div> // Close main div
  );
}
