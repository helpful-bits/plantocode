"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { CheckCircle, Loader2 } from "lucide-react";
import { getProjectSetting, saveProjectSetting } from "@/actions/project-settings-actions";
import { XML_EDITOR_COMMAND_KEY } from "@/lib/constants";

interface SystemSettingsProps {
  projectDirectory: string;
}

export default function SystemSettings({ projectDirectory }: SystemSettingsProps) {
  const [xmlEditorCommand, setXmlEditorCommand] = useState<string>("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Fetch the XML editor command when component mounts or projectDirectory changes
  useEffect(() => {
    if (!projectDirectory) return;

    async function fetchXmlEditorCommand() {
      setIsLoading(true);
      setError(null);
      
      try {
        const command = await getProjectSetting(projectDirectory, XML_EDITOR_COMMAND_KEY);
        setXmlEditorCommand(command || "");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load XML editor command");
        console.error("Error fetching XML editor command:", err);
      } finally {
        setIsLoading(false);
      }
    }

    fetchXmlEditorCommand();
  }, [projectDirectory]);

  // Handle saving the XML editor command
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
        XML_EDITOR_COMMAND_KEY, 
        xmlEditorCommand
      );
      
      if (result.isSuccess) {
        setSaveSuccess(true);
        // Hide success message after a delay
        setTimeout(() => setSaveSuccess(false), 3000);
      } else {
        setError(result.message || "Failed to save XML editor command");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save XML editor command");
      console.error("Error saving XML editor command:", err);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">System Settings</CardTitle>
        <CardDescription>
          Configure system-level settings for this project
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <div className="space-y-2">
            <label htmlFor="xml-editor-command" className="text-sm font-medium">
              XML Editor Command
            </label>
            <div className="text-xs text-muted-foreground mb-2">
              Specify the command to use when opening XML implementation plan files.
              For example: <code>code</code>, <code>vim</code>, or <code>open -a &quot;XML Editor&quot;</code>
            </div>
            <div className="flex items-center space-x-2">
              <Input
                id="xml-editor-command"
                value={xmlEditorCommand}
                onChange={(e) => setXmlEditorCommand(e.target.value)}
                placeholder="Enter command to open XML files"
                className="flex-1"
                disabled={isLoading}
              />
              <Button 
                onClick={handleSave} 
                disabled={isLoading}
                size="sm"
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