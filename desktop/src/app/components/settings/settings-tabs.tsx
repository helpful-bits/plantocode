"use client";

import { useSessionStateContext } from "@/contexts/session";
import SettingsForm from "./settings-form";

export default function SettingsTabs() {
  const { currentSession } = useSessionStateContext();
  const sessionId = currentSession?.id || '';

  return (
    <div className="w-full space-y-4">
      <div className="text-sm text-muted-foreground">
        Configure AI model preferences and system prompts for different task types, including workflow stages. These settings control which models are used and how the AI behaves for each type of request.
      </div>
      <SettingsForm sessionId={sessionId} />
    </div>
  );
}