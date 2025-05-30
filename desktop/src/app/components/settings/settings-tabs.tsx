"use client";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/ui/tabs";
import { SystemPromptsSettings } from "@/components/settings/system-prompts-settings";
import { useSessionStateContext } from "@/contexts/session";
import SettingsForm from "./settings-form";

export default function SettingsTabs() {
  const { currentSession } = useSessionStateContext();
  const sessionId = currentSession?.id || '';

  return (
    <Tabs defaultValue="models" className="w-full">
      <TabsList className="grid w-full grid-cols-2">
        <TabsTrigger value="models">Model Settings</TabsTrigger>
        <TabsTrigger value="prompts">System Prompts</TabsTrigger>
      </TabsList>
      
      <TabsContent value="models" className="space-y-4">
        <div className="text-sm text-muted-foreground">
          Configure AI model preferences for different task types. These settings control which models are used for each type of request.
        </div>
        <SettingsForm />
      </TabsContent>
      
      <TabsContent value="prompts" className="space-y-4">
        <div className="text-sm text-muted-foreground">
          Customize system prompts that guide AI behavior for different tasks. 
          You can override default prompts with your own custom instructions.
        </div>
        {sessionId ? (
          <SystemPromptsSettings sessionId={sessionId} />
        ) : (
          <div className="text-center py-8 text-muted-foreground">
            No active session. Please create or select a session to manage system prompts.
          </div>
        )}
      </TabsContent>
    </Tabs>
  );
}