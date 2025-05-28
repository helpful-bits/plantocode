"use client";

import { CheckCircle, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";

import {
  getModelSettingsForProject,
  saveProjectTaskModelSettingsAction,
} from "@/actions/project-settings.actions";
import { getAvailableAIModels, type ModelInfo } from "@/actions/config.actions";
import { useProject } from "@/contexts/project-context";
import { type TaskSettings } from "@/types";
import { Card, CardDescription, CardHeader, CardTitle } from "@/ui";
import { logError, getErrorMessage } from "@/utils/error-handling";
import { useNotification } from "@/contexts/notification-context";

import SystemSettings from "./system-settings";
import TaskModelSettings from "./task-model-settings";



export default function SettingsForm() {
  const { projectDirectory } = useProject();
  const { showNotification } = useNotification();
  const [taskSettings, setTaskSettings] = useState<TaskSettings | null>(null);
  const [availableModels, setAvailableModels] = useState<ModelInfo[] | null>(null);
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
        const [settingsResult, modelsResult] = await Promise.all([
          getModelSettingsForProject(projectDirectory),
          getAvailableAIModels(),
        ]);
        
        if (settingsResult.isSuccess && settingsResult.data) {
          setTaskSettings(settingsResult.data);
        } else {
          setError(settingsResult.message || "Failed to load project settings");
          setTaskSettings(null);
        }
        
        setAvailableModels(modelsResult || []);
      } catch (err) {
        const errorMessage = getErrorMessage(err);
        await logError(err, "Settings Form - Load Project Settings Failed", { projectDirectory });
        
        let userMessage = "Failed to load project settings";
        if (errorMessage.includes("network")) {
          userMessage = "Network error loading settings. Please check your connection.";
        } else if (errorMessage.includes("permission")) {
          userMessage = "Permission denied accessing project settings.";
        }
        
        setError(userMessage);
        setTaskSettings(null);
        
        showNotification({
          title: "Settings Load Error",
          message: userMessage,
          type: "error",
          actionButton: {
            label: "Retry",
            onClick: () => fetchProjectSettings(),
            variant: "outline"
          }
        });
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
      const errorMessage = getErrorMessage(err);
      await logError(err, "Settings Form - Save Settings Failed", { projectDirectory, newSettings });
      
      let userMessage = "Failed to save settings";
      if (errorMessage.includes("network")) {
        userMessage = "Network error saving settings. Please check your connection and try again.";
      } else if (errorMessage.includes("permission")) {
        userMessage = "Permission denied saving settings. Please check your access rights.";
      } else if (errorMessage.includes("validation")) {
        userMessage = "Invalid settings values. Please check your configuration.";
      }
      
      setError(userMessage);
      
      showNotification({
        title: "Settings Save Error",
        message: userMessage,
        type: "error",
        actionButton: {
          label: "Try Again",
          onClick: () => handleSettingsChange(newSettings),
          variant: "outline"
        }
      });
    } finally {
      setIsLoading(false);
    }
  };


  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 justify-end">
        {isLoading && (
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        )}
        <div className="h-5 text-xs flex items-center min-w-[60px]">
          {saveSuccess && (
            <span className="text-success flex items-center gap-1">
              <CheckCircle className="h-4 w-4" /> Saved
            </span>
          )}
        </div>
        {error && <span className="text-xs text-destructive">{error}</span>}
      </div>

      {taskSettings && (
        <TaskModelSettings
          taskSettings={taskSettings}
          availableModels={availableModels}
          onSettingsChange={handleSettingsChange}
        />
      )}

      {!taskSettings && !isLoading && (
        <Card className="bg-card/80 backdrop-blur-sm border shadow-soft rounded-xl">
          <CardHeader>
            <CardTitle>Unable to Load Settings</CardTitle>
            <CardDescription>
              {error || "Failed to load AI model settings from server. Please ensure the server is running and try refreshing the page."}
            </CardDescription>
          </CardHeader>
        </Card>
      )}

      <SystemSettings projectDirectory={projectDirectory} />
    </div>
  );
}
