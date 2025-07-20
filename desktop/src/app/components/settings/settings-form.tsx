"use client";

import { useEffect, useState, useCallback } from "react";

import {
  getServerDefaultTaskModelSettings,
  getProjectTaskModelSettings,
} from "@/actions/project-settings.actions";
import { getProvidersWithModels } from "@/actions/config.actions";
import { type ProviderWithModels } from "@/types/config-types";
import { useProject } from "@/contexts/project-context";
import { type TaskSettings } from "@/types";
import { Card, CardDescription, CardHeader, CardTitle } from "@/ui";
import { extractErrorInfo, createUserFriendlyErrorMessage, logError } from "@/utils/error-handling";
import { useNotification } from "@/contexts/notification-context";

import TaskModelSettings from "./task-model-settings";



interface SettingsFormProps {
  sessionId?: string;
}

export default function SettingsForm({}: SettingsFormProps) {
  const { projectDirectory } = useProject();
  const { showNotification } = useNotification();
  const [taskSettings, setTaskSettings] = useState<TaskSettings | null>(null);
  const [serverDefaults, setServerDefaults] = useState<TaskSettings | null>(null);
  const [providersWithModels, setProvidersWithModels] = useState<ProviderWithModels[] | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Function to refresh project settings (can be called from child components)
  const refreshProjectSettings = useCallback(async () => {
    if (!projectDirectory) return;

    setIsLoading(true);
    setError(null);

    try {
      const [serverDefaultsResult, projectSettingsResult, modelsResult] = await Promise.all([
        getServerDefaultTaskModelSettings(),
        getProjectTaskModelSettings(projectDirectory),
        getProvidersWithModels(),
      ]);
      
      if (serverDefaultsResult.isSuccess && serverDefaultsResult.data) {
        setServerDefaults(serverDefaultsResult.data);
        
        // Use project settings if available, otherwise fall back to server defaults
        if (projectSettingsResult.isSuccess && projectSettingsResult.data) {
          setTaskSettings(projectSettingsResult.data);
        } else {
          setTaskSettings(serverDefaultsResult.data);
        }
      } else {
        setError(serverDefaultsResult.message || "Failed to load server default settings");
        setTaskSettings(null);
        setServerDefaults(null);
      }
      
      setProvidersWithModels(modelsResult || []);
    } catch (err) {
      const errorInfo = extractErrorInfo(err);
      const userMessage = createUserFriendlyErrorMessage(errorInfo, "project settings");
      
      await logError(err, "SettingsForm.refreshProjectSettings", { projectDirectory });
      
      setError(userMessage);
      setTaskSettings(null);
      
      showNotification({
        title: "Settings Load Error",
        message: userMessage,
        type: "error",
        actionButton: {
          label: "Retry",
          onClick: refreshProjectSettings,
          variant: "outline"
        }
      });
    } finally {
      setIsLoading(false);
    }
  }, [projectDirectory, showNotification]);

  // Fetch project settings when projectDirectory changes
  useEffect(() => {
    if (!projectDirectory) return;

    let isMounted = true;

    async function fetchProjectSettings() {
      if (!isMounted) return;
      await refreshProjectSettings();
    }

    void fetchProjectSettings();

    return () => {
      isMounted = false;
    };
  }, [projectDirectory, refreshProjectSettings]);



  return (
    <div className="space-y-6">
      {taskSettings && (
        <TaskModelSettings
          taskSettings={taskSettings}
          serverDefaults={serverDefaults}
          providersWithModels={providersWithModels}
          projectDirectory={projectDirectory}
          onRefresh={refreshProjectSettings}
        />
      )}

      {!taskSettings && !isLoading && (
        <Card className="bg-card/80 backdrop-blur-sm border border-border shadow-soft rounded-xl">
          <CardHeader>
            <CardTitle>Unable to Load Settings</CardTitle>
            <CardDescription>
              {error || "Failed to load AI model settings from server. Please ensure the server is running and try refreshing the page."}
            </CardDescription>
          </CardHeader>
        </Card>
      )}
    </div>
  );
}
