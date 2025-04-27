"use client";
import { Loader2 } from 'lucide-react';
import { Suspense } from "react";
import { useProject } from "@/lib/contexts/project-context";
import { RequireProjectDirectory } from "@/components/with-project-directory";
import GeneratePromptRoot from "./_components/generate-prompt/generate-prompt-root";
import { useNotification } from "@/lib/contexts/notification-context";

export default function Home() {
  const { projectDirectory, isLoading } = useProject();
  const { showNotification } = useNotification();
  
  // If still loading, show a minimal loading UI
  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[calc(100vh-120px)]">
        <Loader2 className="h-10 w-10 animate-spin text-primary mb-4" />
        <h2 className="text-xl font-medium mb-2">Loading Project</h2>
        <p className="text-muted-foreground">Please wait while we load your project data...</p>
      </div>
    );
  }
  
  return (
    <main className="flex flex-col items-start gap-8">
      {/* RequireProjectDirectory will handle the case when no project is selected */}
      <RequireProjectDirectory>
        {/* Show main app content when a project directory is selected */}
        <div className="w-full">
          <div className="flex justify-between items-center mb-6">
            <h1 className="text-2xl font-bold">
              Project: {projectDirectory?.split('/').pop()}
            </h1>
          </div>
          
          {/* GeneratePrompt Component */}
          <Suspense fallback={
            <div className="flex justify-center items-center p-8">
              <Loader2 className="h-8 w-8 animate-spin" />
            </div>
          }>
            <GeneratePromptRoot />
          </Suspense>
        </div>
      </RequireProjectDirectory>
    </main>
  );
}
