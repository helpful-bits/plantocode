"use client";

import { useProject } from "@/lib/contexts/project-context";
import { useEffect, useState } from "react";
import { TaskSettings } from "@/types";
import TaskModelSettings from "./task-model-settings";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CheckCircle, Loader2 } from "lucide-react";
import { getModelSettingsForProject, saveModelSettingsForProject } from "@/actions/project-settings-actions";

export default function SettingsForm() {
  const { projectDirectory } = useProject();
  const [taskSettings, setTaskSettings] = useState<TaskSettings>({});
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Fetch project settings when projectDirectory changes
  useEffect(() => {
    if (!projectDirectory) return;

    async function fetchProjectSettings() {
      setIsLoading(true);
      setError(null);
      
      try {
        const settings = await getModelSettingsForProject(projectDirectory);
        setTaskSettings(settings || {});
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load project settings");
        console.error("Error fetching project settings:", err);
      } finally {
        setIsLoading(false);
      }
    }

    fetchProjectSettings();
  }, [projectDirectory]);

  // Handle settings changes
  const handleSettingsChange = async (newSettings: TaskSettings) => {
    setTaskSettings(newSettings);
    setSaveSuccess(false);

    if (!projectDirectory) {
      setError("No active project");
      return;
    }

    setIsLoading(true);
    setError(null);
    
    try {
      const result = await saveModelSettingsForProject(projectDirectory, newSettings);
      
      if (result.isSuccess) {
        setSaveSuccess(true);
        // Hide success message after a delay
        setTimeout(() => setSaveSuccess(false), 3000);
      } else {
        setError(result.message || "Failed to save settings");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save settings");
      console.error("Error saving settings:", err);
    } finally {
      setIsLoading(false);
    }
  };

  if (!projectDirectory) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>No Active Project</CardTitle>
          <CardDescription>
            Please select or create a project to manage settings
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <div>
            <CardTitle className="text-lg">Project: {projectDirectory.split('/').pop()}</CardTitle>
            <CardDescription>
              Configure AI model preferences specifically for the &apos;{projectDirectory.split('/').pop()}&apos; project. These settings will apply to all sessions within this project directory.
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            {isLoading && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
            {saveSuccess && <CheckCircle className="h-4 w-4 text-green-500" />}
            {error && <span className="text-xs text-destructive">{error}</span>}
          </div>
        </CardHeader>
      </Card>
      
      <TaskModelSettings 
        taskSettings={taskSettings} 
        onSettingsChange={handleSettingsChange} 
      />
    </div>
  );
} 