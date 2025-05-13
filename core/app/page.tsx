"use client";
import { Suspense } from "react";
import { useProject } from "@/lib/contexts/project-context";
import { useSessionContext } from "@/lib/contexts/session-context";
import { RequireProjectDirectory } from "@/components/with-project-directory";
import { ImplementationPlansPanel } from "@/app/components/implementation-plans-panel";
import GeneratePromptForm from './components/generate-prompt/generate-prompt-form';

export default function Home() {
  const { projectDirectory, } = useProject();
  const { activeSessionId } = useSessionContext();
  
  // We no longer show a full-screen loading UI to avoid interrupting the experience
  // Instead, we'll let child components handle their own loading states
  
  return (
    <main className="flex flex-col items-start">
      {/* RequireProjectDirectory will handle the case when no project is selected */}
      <RequireProjectDirectory>
        {/* Show main app content when a project directory is selected */}
        <div className="relative w-full">
          <div className="flex justify-between items-center mb-8">
            <h1 className="text-2xl font-bold">
              Project: {projectDirectory?.split('/').pop()}
            </h1>
          </div>
          
          {/* GeneratePrompt Component */}
          <Suspense fallback={
            <div className="p-8 min-h-[200px] border border-dashed rounded-md border-border bg-card/10">
              <div className="h-5 w-1/3 bg-muted/30 rounded-md animate-pulse mb-4"></div>
              <div className="h-40 w-full bg-muted/20 rounded-md animate-pulse"></div>
            </div>
          }>
            <GeneratePromptForm />
          </Suspense>

          {/* Implementation Plans Panel */}
          <Suspense fallback={
            <div className="p-6 min-h-[120px] border border-dashed rounded-md border-border bg-card/10 mt-8">
              <div className="h-4 w-1/4 bg-muted/30 rounded-md animate-pulse mb-3"></div>
              <div className="h-20 w-full bg-muted/20 rounded-md animate-pulse"></div>
            </div>
          }>
            <ImplementationPlansPanel sessionId={activeSessionId} />
          </Suspense>

        </div>
      </RequireProjectDirectory>
    </main>
  );
}
