"use client";

import { useSessionStateContext } from "@/contexts/session";
import SettingsForm from "./settings-form";

export default function SettingsTabs() {
  const { currentSession } = useSessionStateContext();
  const sessionId = currentSession?.id || '';

  return (
    <div className="w-full space-y-4">
      <div className="text-sm text-muted-foreground">
        Configure AI model preferences and system prompts for each task type. Select a task from the sidebar to view and edit its complete configuration.
      </div>
      <SettingsForm sessionId={sessionId} />
    </div>
  );
}