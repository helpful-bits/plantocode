"use client";

import { CheckCircle, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";

import {
  getModelSettingsForProject,
  saveProjectTaskModelSettingsAction,
} from "@/actions/project-settings.actions";
import { useProject } from "@/contexts/project-context";
import { type TaskSettings } from "@/types";
import { Card, CardDescription, CardHeader, CardTitle } from "@/ui";

import SubscriptionManager from "@/app/components/billing/subscription-manager";
import SystemSettings from "./system-settings";
import TaskModelSettings from "./task-model-settings";



export default function SettingsForm() {
  const { projectDirectory } = useProject();
  const [taskSettings, setTaskSettings] = useState<TaskSettings | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Fetch project settings when projectDirectory changes
  useEffect(() => {
    if (!projectDirectory) return;

    async function fetchProjectSettings() {
      setIsLoading(true);
      setError(null);

      try {
        const result = await getModelSettingsForProject(projectDirectory);
        if (result.isSuccess && result.data) {
          setTaskSettings(result.data);
        } else {
          setError(result.message || "Failed to load project settings");
          setTaskSettings(null);
        }
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Failed to load project settings"
        );
        console.error("Error fetching project settings:", err);
        setTaskSettings(null);
      } finally {
        setIsLoading(false);
      }
    }

    void fetchProjectSettings();
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
      const result = await saveProjectTaskModelSettingsAction(
        projectDirectory,
        newSettings
      );

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
            <CardTitle className="text-lg">
              Project: {projectDirectory.split("/").pop()}
            </CardTitle>
            <CardDescription className="text-balance">
              Configure AI model preferences specifically for the &apos;
              {projectDirectory.split("/").pop()}&apos; project. These settings
              override global defaults and apply to all sessions within this
              project.
            </CardDescription>
          </div>
          <div className="flex items-center gap-2 min-w-[100px] justify-end">
            {isLoading && (
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            )}
            {saveSuccess && (
              <div className="flex items-center gap-1 text-xs text-primary">
                <CheckCircle className="h-4 w-4" /> Saved
              </div>
            )}
            {error && <span className="text-xs text-destructive">{error}</span>}
          </div>
        </CardHeader>
      </Card>

      {taskSettings && (
        <TaskModelSettings
          taskSettings={taskSettings}
          onSettingsChange={handleSettingsChange}
        />
      )}

      {!taskSettings && !isLoading && (
        <Card>
          <CardHeader>
            <CardTitle>Unable to Load Settings</CardTitle>
            <CardDescription>
              {error || "Failed to load AI model settings from server. Please ensure the server is running and try refreshing the page."}
            </CardDescription>
          </CardHeader>
        </Card>
      )}

      <SystemSettings projectDirectory={projectDirectory} />

      <SubscriptionManager />
    </div>
  );
}
