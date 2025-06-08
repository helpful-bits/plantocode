"use client";

import { CheckCircle, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";

import {
  getModelSettingsForProject,
  saveProjectTaskModelSettingsAction,
} from "@/actions/project-settings.actions";
import { getAvailableAIModels, type ModelInfo } from "@/actions/config.actions";
import { useProject } from "@/contexts/project-context";
import { type TaskSettings } from "@/types";
import { Card, CardDescription, CardHeader, CardTitle, Tabs, TabsContent, TabsList, TabsTrigger } from "@/ui";
import { extractErrorInfo, createUserFriendlyErrorMessage, logError } from "@/utils/error-handling";
import { useNotification } from "@/contexts/notification-context";

import SystemSettings from "./system-settings";
import TaskModelSettings from "./task-model-settings";



interface SettingsFormProps {
  sessionId?: string;
}

export default function SettingsForm({ sessionId }: SettingsFormProps) {
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

    let isMounted = true;

    async function fetchProjectSettings() {
      if (!isMounted) return;
      setIsLoading(true);
      setError(null);

      try {
        // First refresh runtime config to ensure we have latest task configurations
        await invoke("fetch_runtime_ai_config");
        
        if (!isMounted) return;
        
        const [settingsResult, modelsResult] = await Promise.all([
          getModelSettingsForProject(projectDirectory),
          getAvailableAIModels(),
        ]);
        
        if (!isMounted) return;
        
        if (settingsResult.isSuccess && settingsResult.data) {
          setTaskSettings(settingsResult.data);
        } else {
          setError(settingsResult.message || "Failed to load project settings");
          setTaskSettings(null);
        }
        
        setAvailableModels(modelsResult || []);
      } catch (err) {
        if (!isMounted) return;
        
        const errorInfo = extractErrorInfo(err);
        const userMessage = createUserFriendlyErrorMessage(errorInfo, "project settings");
        
        await logError(err, "SettingsForm.fetchProjectSettings", { projectDirectory });
        
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
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    void fetchProjectSettings();

    return () => {
      isMounted = false;
    };
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
      const errorInfo = extractErrorInfo(err);
      const userMessage = createUserFriendlyErrorMessage(errorInfo, "settings");
      
      await logError(err, "SettingsForm.handleSettingsChange", { 
        projectDirectory, 
        settingsKeys: Object.keys(newSettings)
      });
      
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

      <Tabs defaultValue="models" className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="models">Model Settings</TabsTrigger>
          <TabsTrigger value="system">System Settings</TabsTrigger>
        </TabsList>
        
        <TabsContent value="models" className="space-y-4 mt-6">
          {taskSettings && (
            <TaskModelSettings
              taskSettings={taskSettings}
              availableModels={availableModels}
              onSettingsChange={handleSettingsChange}
              sessionId={sessionId}
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
        </TabsContent>
        
        <TabsContent value="system" className="space-y-4 mt-6">
          <SystemSettings projectDirectory={projectDirectory} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
