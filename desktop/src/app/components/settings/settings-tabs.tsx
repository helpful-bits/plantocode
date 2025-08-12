"use client";

import { useSessionStateContext } from "@/contexts/session";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/ui/tabs";
import SettingsForm from "./settings-form";
import Legal from "./legal";

export default function SettingsTabs() {
  const { currentSession } = useSessionStateContext();
  const sessionId = currentSession?.id || '';

  return (
    <div className="w-full">
      <Tabs defaultValue="general" className="space-y-4">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="general">General</TabsTrigger>
          <TabsTrigger value="legal">Legal</TabsTrigger>
        </TabsList>
        
        <TabsContent value="general" className="space-y-4">
          <div className="text-sm text-muted-foreground">
            Configure AI model preferences and system prompts for each task type. Select a task from the sidebar to view and edit its complete configuration.
          </div>
          <SettingsForm sessionId={sessionId} />
        </TabsContent>
        
        <TabsContent value="legal">
          <Legal />
        </TabsContent>
      </Tabs>
    </div>
  );
}