"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { CheckCircle, Loader2 } from "lucide-react";
import { getProjectSetting, saveProjectSetting } from "@/actions/project-settings-actions";
import { OUTPUT_FILE_EDITOR_COMMAND_KEY } from "@/lib/constants";

interface SystemSettingsProps {
  projectDirectory: string;
}

export default function SystemSettings({ projectDirectory }: SystemSettingsProps) {
  const [outputFileEditorCommand, setOutputFileEditorCommand] = useState<string>("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Fetch the output file editor command when component mounts or projectDirectory changes
  useEffect(() => {
    if (!projectDirectory) return;

    async function fetchOutputFileEditorCommand() {
      setIsLoading(true);
      setError(null);
      
      try {
        const command = await getProjectSetting(projectDirectory, OUTPUT_FILE_EDITOR_COMMAND_KEY);
        setOutputFileEditorCommand(command || "");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load output file editor command");
        console.error("Error fetching output file editor command:", err);
      } finally {
        setIsLoading(false);
      }
    }

    fetchOutputFileEditorCommand();
  }, [projectDirectory]);

  // Handle saving the output file editor command
  const handleSave = async () => {
    if (!projectDirectory) {
      setError("No active project");
      return;
    }

    setIsLoading(true);
    setError(null);
    setSaveSuccess(false);
    
    try {
      const result = await saveProjectSetting(
        projectDirectory, 
        OUTPUT_FILE_EDITOR_COMMAND_KEY, 
        outputFileEditorCommand
      );
      
      if (result.isSuccess) {
        setSaveSuccess(true);
        // Hide success message after a delay
        setTimeout(() => setSaveSuccess(false), 3000);
      } else {
        setError(result.message || "Failed to save output file editor command");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save output file editor command");
      console.error("Error saving output file editor command:", err);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-lg">System Settings</CardTitle>
        <CardDescription className="text-balance">
          Configure system-level settings for this project
        </CardDescription>
      </CardHeader>
      <CardContent className="p-6">
        <div className="space-y-4">
          <div className="space-y-2">
            <label htmlFor="output-file-editor-command" className="text-sm font-medium">
              Output File Editor Command
            </label>
            <div className="text-xs text-muted-foreground mb-2 text-balance">
              Command used to open generated output files (like implementation plans) in your preferred editor.
              For example: <code className="bg-muted px-1.5 py-0.5 rounded text-[11px] font-mono">code</code>, <code className="bg-muted px-1.5 py-0.5 rounded text-[11px] font-mono">vim</code>, or <code className="bg-muted px-1.5 py-0.5 rounded text-[11px] font-mono">open -a &quot;Text Editor&quot;</code>
            </div>
            <div className="flex items-center gap-2">
              <Input
                id="output-file-editor-command"
                value={outputFileEditorCommand}
                onChange={(e) => setOutputFileEditorCommand(e.target.value)}
                placeholder="Enter command to open output files"
                className="flex-1"
                disabled={isLoading}
              />
              <Button 
                onClick={handleSave} 
                disabled={isLoading}
                size="sm"
                className="min-w-[70px]"
              >
                {isLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : "Save"}
              </Button>
            </div>
            <div className="flex items-center h-5 mt-1">
              {error && <span className="text-xs text-destructive">{error}</span>}
              {saveSuccess && (
                <span className="text-xs text-green-500 flex items-center gap-1">
                  <CheckCircle className="h-3 w-3" /> Saved successfully
                </span>
              )}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
} 